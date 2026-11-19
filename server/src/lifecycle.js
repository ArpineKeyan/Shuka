// Order lifecycle. The server is the only place that decides which status moves are allowed.
//
//   placed ──► confirmed ──► shipped ──► delivered
//     │            │
//     └────────────┴──► cancelled     (stock goes back)
import { db, tx } from './db.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';
import { str } from './validate.js';

export const STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];

// Allowed moves, per role.
const MOVES = {
  seller: { placed: ['confirmed', 'cancelled'], confirmed: ['shipped', 'cancelled'], shipped: ['delivered'] },
  buyer:  { placed: ['cancelled'], confirmed: ['cancelled'] },
};
export const allowedMoves = (role, status) => MOVES[role][status] ?? [];

// Changes one seller order's status inside one transaction.
// `scopeSql` limits the lookup to the current user's own orders.
async function move(role, userId, sellerOrderId, to, scopeSql, scopeArgs) {
  if (!STATUSES.includes(to)) throw badRequest('to must be one of: ' + STATUSES.join(', '));
  return tx(async t => {
    const so = await t.get(`SELECT so.* FROM seller_orders so JOIN orders o ON o.id = so.order_id
                            WHERE so.id = ? AND ${scopeSql}`, [sellerOrderId, ...scopeArgs]);
    if (!so) throw notFound('Order not found.');
    if (!allowedMoves(role, so.status).includes(to)) {
      throw conflict(`Can't change an order from ${so.status} to ${to}.`, 'move_not_allowed',
        { from: so.status, to, allowed: allowedMoves(role, so.status) });
    }
    // "AND status = ?" guards against two clicks at the same moment.
    const { changes } = await t.run(
      `UPDATE seller_orders SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ? AND status = ?`, [to, so.id, so.status]);
    if (changes !== 1) throw conflict('The order changed in the meantime. Reload and try again.', 'move_not_allowed');
    await t.run('INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)',
      [so.id, so.status, to, userId]);
    if (to === 'cancelled') {
      // Put the stock back, in the same transaction as the status change.
      const items = await t.all('SELECT product_id, quantity FROM order_items WHERE seller_order_id = ?', [so.id]);
      for (const i of items) {
        await t.run('UPDATE products SET stock = stock + ? WHERE id = ?', [i.quantity, i.product_id]);
      }
    }
    return so.order_id;
  });
}

// POST /seller/orders/:id/status  { "to": "shipped" }
export const sellerMove = (seller, sellerOrderId, to) =>
  move('seller', seller.id, sellerOrderId, str(to), 'so.seller_id = ?', [seller.id]);

// POST /orders/:id/sellers/:sellerOrderId/cancel
export const buyerCancel = (buyer, orderId, sellerOrderId) =>
  move('buyer', buyer.id, sellerOrderId, 'cancelled', 'so.order_id = ? AND o.buyer_id = ?', [orderId, buyer.id]);

// GET /seller/orders?status= — the seller's own orders, newest first, with counts for the tabs.
export async function listSellerOrders(seller, status) {
  if (status && !STATUSES.includes(status)) throw badRequest('status must be one of: ' + STATUSES.join(', '));
  const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
  for (const r of await db.all('SELECT status, COUNT(*) AS n FROM seller_orders WHERE seller_id = ? GROUP BY status', [seller.id])) {
    counts[r.status] = r.n;
  }
  const rows = await db.all(
    `SELECT so.id, so.order_id, so.status, so.subtotal_amd, so.updated_at, o.created_at, o.recipient, o.city, o.region,
            (SELECT SUM(quantity) FROM order_items WHERE seller_order_id = so.id) AS units
     FROM seller_orders so JOIN orders o ON o.id = so.order_id
     WHERE so.seller_id = ? ${status ? 'AND so.status = ?' : ''}
     ORDER BY o.created_at DESC, so.id DESC`, status ? [seller.id, status] : [seller.id]);
  return {
    counts,
    orders: rows.map(r => ({
      id: r.id, orderNumber: r.order_id, status: r.status, subtotalAmd: r.subtotal_amd, units: r.units,
      recipient: r.recipient, city: r.city, region: r.region, createdAt: r.created_at, updatedAt: r.updated_at,
    })),
  };
}

// GET /seller/orders/:id — only the seller of this part. Shows where to deliver and how much cash to collect.
export async function getSellerOrder(seller, sellerOrderId) {
  const so = await db.get(
    `SELECT so.*, o.recipient, o.phone, o.region, o.city, o.street, o.apartment, o.note, o.created_at AS ordered_at
     FROM seller_orders so JOIN orders o ON o.id = so.order_id
     WHERE so.id = ? AND so.seller_id = ?`, [sellerOrderId, seller.id]);
  if (!so) throw notFound('Order not found.');
  const items = await db.all('SELECT * FROM order_items WHERE seller_order_id = ? ORDER BY id', [so.id]);
  const history = await db.all('SELECT * FROM status_history WHERE seller_order_id = ? ORDER BY id', [so.id]);
  return {
    id: so.id, orderNumber: so.order_id, status: so.status, orderedAt: so.ordered_at,
    items: items.map(i => ({ productId: i.product_id, title: i.title, unitPriceAmd: i.unit_price_amd,
                             quantity: i.quantity, lineTotalAmd: i.unit_price_amd * i.quantity })),
    cashToCollectAmd: so.subtotal_amd,
    delivery: { recipient: so.recipient, phone: so.phone, region: so.region, city: so.city,
                street: so.street, apartment: so.apartment, note: so.note },
    allowedMoves: allowedMoves('seller', so.status),
    history: history.map(h => ({ from: h.from_status, to: h.to_status, at: h.created_at })),
  };
}

// POST /products/:id/reviews — only a buyer with a delivered item of this product, once per product.
export async function addReview(buyer, productId, body) {
  const rating = Number(body?.rating);
  const text = str(body?.body);
  const fields = {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fields.rating = 'Choose 1 to 5 stars.';
  if (text.length > 2000) fields.body = 'Keep the review under 2000 characters.';
  if (Object.keys(fields).length) throw badRequest('Please fix the highlighted fields.', fields);

  const product = await db.get('SELECT id FROM products WHERE id = ?', [productId]);
  if (!product) throw notFound('Product not found.');
  const delivered = await db.get(
    `SELECT 1 FROM order_items oi
     JOIN seller_orders so ON so.id = oi.seller_order_id JOIN orders o ON o.id = so.order_id
     WHERE oi.product_id = ? AND o.buyer_id = ? AND so.status = 'delivered' LIMIT 1`, [productId, buyer.id]);
  if (!delivered) throw forbidden('You can review a product once it has been delivered to you.');

  try {
    return await tx(async t => {
      const { lastId } = await t.run('INSERT INTO reviews (product_id, buyer_id, rating, body) VALUES (?, ?, ?, ?)',
        [productId, buyer.id, rating, text]);
      // Keep the product's average up to date for sorting and product cards.
      await t.run(
        `UPDATE products SET
           rating_avg = (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE product_id = ?),
           rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = ?)
         WHERE id = ?`, [productId, productId, productId]);
      return lastId;
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw conflict('You already reviewed this product.', 'already_reviewed');
    throw err;
  }
}

// Checkout and buyer orders.
import { db, tx } from './db.js';
import { badRequest, conflict, notFound, HttpError } from './errors.js';
import { str, normalizePhone, phoneMessage } from './validate.js';

export const REGIONS = ['Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik', 'Kotayk',
                        'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor'];

function validateAddress(body) {
  const fields = {};
  const a = {
    recipient: str(body?.recipient), phone: normalizePhone(str(body?.phone)),
    region: str(body?.region), city: str(body?.city), street: str(body?.street),
    apartment: str(body?.apartment), note: str(body?.note),
  };
  if (a.recipient.length < 2 || a.recipient.length > 80) fields.recipient = 'Enter the recipient’s name.';
  if (!a.phone) fields.phone = phoneMessage;
  if (!REGIONS.includes(a.region)) fields.region = 'Choose Yerevan or a marz.';
  if (a.city.length < 2 || a.city.length > 80) fields.city = 'Enter a city or village.';
  if (a.street.length < 2 || a.street.length > 120) fields.street = 'Enter the street and building.';
  if (a.apartment.length > 40) fields.apartment = 'Keep it under 40 characters.';
  if (a.note.length > 500) fields.note = 'Keep the note under 500 characters.';
  if (Object.keys(fields).length) throw badRequest('Please fix the highlighted fields.', fields);
  return a;
}

class PriceChanged extends Error {
  constructor(changes) { super('price_changed'); this.changes = changes; }
}

// POST /orders. The whole checkout is one transaction: either every line gets its stock
// and the order is created, or nothing changes at all.
export async function checkout(user, body) {
  const requestKey = str(body?.requestKey);
  if (requestKey.length < 8 || requestKey.length > 100) throw badRequest('requestKey is missing.');
  const address = validateAddress(body);

  // Same request key again (double click, retry): return the order that already exists.
  const existing = await db.get('SELECT id, buyer_id FROM orders WHERE request_key = ?', [requestKey]);
  if (existing) {
    if (existing.buyer_id !== user.id) throw conflict('This request key was already used.', 'request_key_used');
    return { orderId: existing.id, duplicate: true };
  }

  try {
    const orderId = await tx(async t => {
      // Check again inside the transaction: the first click may have just finished.
      const again = await t.get('SELECT id, buyer_id FROM orders WHERE request_key = ?', [requestKey]);
      if (again) {
        if (again.buyer_id !== user.id) throw conflict('This request key was already used.', 'request_key_used');
        return { existingId: again.id };
      }

      const lines = await t.all(
        `SELECT ci.product_id, ci.quantity, ci.price_when_added,
                p.title, p.price_amd, p.seller_id, p.is_published
         FROM cart_items ci JOIN products p ON p.id = ci.product_id
         WHERE ci.user_id = ? ORDER BY p.seller_id, p.id`, [user.id]);
      if (lines.length === 0) throw badRequest('Your cart is empty.');

      const changes = [];
      for (const l of lines) {
        if (!l.is_published) throw conflict(`"${l.title}" is no longer available. Remove it from your cart.`, 'unavailable');
        if (l.seller_id === user.id) throw conflict("You can't buy your own product.", 'own_product');
        if (l.price_amd !== l.price_when_added) {
          changes.push({ productId: l.product_id, title: l.title, oldPriceAmd: l.price_when_added, newPriceAmd: l.price_amd });
        }
      }
      if (changes.length) throw new PriceChanged(changes);

      // Take the stock. The WHERE stock >= ? makes this safe when many buyers check out at once:
      // if someone else took the last units first, 0 rows change and the whole order is rolled back.
      for (const l of lines) {
        const { changes: n } = await t.run(
          'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
          [l.quantity, l.product_id, l.quantity]);
        if (n !== 1) {
          const { stock } = await t.get('SELECT stock FROM products WHERE id = ?', [l.product_id]);
          throw conflict(
            stock === 0 ? `"${l.title}" just sold out.` : `Only ${stock} left of "${l.title}".`,
            'out_of_stock', { productId: l.product_id, title: l.title, available: stock });
        }
      }

      // One order, one seller order per seller. Title, price and address are copied,
      // so later edits to the product never change this order.
      const bySeller = new Map();
      for (const l of lines) {
        if (!bySeller.has(l.seller_id)) bySeller.set(l.seller_id, []);
        bySeller.get(l.seller_id).push(l);
      }
      const total = lines.reduce((s, l) => s + l.price_amd * l.quantity, 0);
      const { lastId: newOrderId } = await t.run(
        `INSERT INTO orders (buyer_id, recipient, phone, region, city, street, apartment, note, total_amd, request_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, address.recipient, address.phone, address.region, address.city, address.street,
         address.apartment, address.note, total, requestKey]);

      for (const [sellerId, items] of bySeller) {
        const subtotal = items.reduce((s, l) => s + l.price_amd * l.quantity, 0);
        const { lastId: soId } = await t.run(
          'INSERT INTO seller_orders (order_id, seller_id, status, subtotal_amd) VALUES (?, ?, ?, ?)',
          [newOrderId, sellerId, 'placed', subtotal]);
        for (const l of items) {
          await t.run(
            'INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?, ?, ?, ?, ?)',
            [soId, l.product_id, l.title, l.price_amd, l.quantity]);
        }
        await t.run(
          'INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by) VALUES (?, NULL, ?, ?)',
          [soId, 'placed', user.id]);
      }
      await t.run('DELETE FROM cart_items WHERE user_id = ?', [user.id]);
      return { newId: newOrderId };
    });
    if (orderId.existingId) return { orderId: orderId.existingId, duplicate: true };
    return { orderId: orderId.newId, duplicate: false };
  } catch (err) {
    if (err instanceof PriceChanged) {
      // Nothing was ordered. Update the cart to the new prices so the buyer can review and try again.
      for (const c of err.changes) {
        await db.run('UPDATE cart_items SET price_when_added = ? WHERE user_id = ? AND product_id = ?',
          [c.newPriceAmd, user.id, c.productId]);
      }
      throw conflict('Some prices changed since you added them. Check the new prices and place the order again.',
        'price_changed', { changes: err.changes });
    }
    // Backup for the double-click case: the UNIQUE constraint on request_key rejected a second insert.
    if (!(err instanceof HttpError) && String(err.message).includes('request_key')) {
      const o = await db.get('SELECT id FROM orders WHERE request_key = ? AND buyer_id = ?', [requestKey, user.id]);
      if (o) return { orderId: o.id, duplicate: true };
    }
    throw err;
  }
}

// GET /orders — the buyer's own orders, newest first, with one status per seller.
export async function listOrders(user) {
  const orders = await db.all(
    'SELECT id, total_amd, created_at FROM orders WHERE buyer_id = ? ORDER BY created_at DESC, id DESC', [user.id]);
  const parts = await db.all(
    `SELECT so.id, so.order_id, so.status, so.subtotal_amd, u.store_name
     FROM seller_orders so JOIN orders o ON o.id = so.order_id JOIN users u ON u.id = so.seller_id
     WHERE o.buyer_id = ? ORDER BY so.id`, [user.id]);
  return orders.map(o => ({
    id: o.id, totalAmd: o.total_amd, createdAt: o.created_at,
    sellers: parts.filter(p => p.order_id === o.id)
      .map(p => ({ sellerOrderId: p.id, storeName: p.store_name, status: p.status, subtotalAmd: p.subtotal_amd })),
  }));
}

// GET /orders/:id — only the buyer who placed it. Someone else's order looks like it doesn't exist.
export async function getOrder(user, orderId) {
  const o = await db.get('SELECT * FROM orders WHERE id = ? AND buyer_id = ?', [orderId, user.id]);
  if (!o) throw notFound('Order not found.');
  const parts = await db.all(
    `SELECT so.*, u.store_name FROM seller_orders so JOIN users u ON u.id = so.seller_id
     WHERE so.order_id = ? ORDER BY so.id`, [orderId]);
  const items = await db.all(
    `SELECT oi.*, (SELECT COUNT(*) FROM reviews r WHERE r.product_id = oi.product_id AND r.buyer_id = ?) AS reviewed
     FROM order_items oi JOIN seller_orders so ON so.id = oi.seller_order_id
     WHERE so.order_id = ? ORDER BY oi.id`, [user.id, orderId]);
  const history = await db.all(
    `SELECT h.* FROM status_history h JOIN seller_orders so ON so.id = h.seller_order_id
     WHERE so.order_id = ? ORDER BY h.id`, [orderId]);
  return {
    id: o.id, createdAt: o.created_at, totalAmd: o.total_amd,
    address: { recipient: o.recipient, phone: o.phone, region: o.region, city: o.city,
               street: o.street, apartment: o.apartment, note: o.note },
    payment: 'cash_on_delivery',
    sellers: parts.map(p => ({
      sellerOrderId: p.id, storeName: p.store_name, status: p.status, subtotalAmd: p.subtotal_amd,
      canCancel: p.status === 'placed' || p.status === 'confirmed',
      items: items.filter(i => i.seller_order_id === p.id).map(i => ({
        productId: i.product_id, title: i.title, unitPriceAmd: i.unit_price_amd, quantity: i.quantity,
        lineTotalAmd: i.unit_price_amd * i.quantity,
        canReview: p.status === 'delivered' && i.reviewed === 0,
      })),
      history: history.filter(h => h.seller_order_id === p.id)
        .map(h => ({ from: h.from_status, to: h.to_status, at: h.created_at })),
    })),
  };
}

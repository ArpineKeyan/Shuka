// Cart: signed-in users only. Quantity can't go above stock, sellers can't buy their own products.
import { db } from './db.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';
import { imageUrls } from './images.js';

export async function setCartItem(user, productId, quantityRaw) {
  const quantity = Number(quantityRaw);
  if (!Number.isInteger(quantity) || quantity < 1) throw badRequest('Quantity must be a whole number, 1 or more.');
  const p = await db.get('SELECT id, seller_id, title, price_amd, stock FROM products WHERE id = ? AND is_published = 1', [productId]);
  if (!p) throw notFound('Product not found.');
  if (p.seller_id === user.id) throw forbidden("You can't buy your own product.");
  if (p.stock === 0) throw conflict(`"${p.title}" is out of stock.`, 'out_of_stock');
  if (quantity > p.stock) throw conflict(`Only ${p.stock} left of "${p.title}".`, 'not_enough_stock', { available: p.stock });
  // A new line remembers today's price. Changing the quantity keeps the original price,
  // so the cart can warn when the seller changes it.
  await db.run(
    `INSERT INTO cart_items (user_id, product_id, quantity, price_when_added) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = excluded.quantity`,
    [user.id, productId, quantity, p.price_amd]);
}

export async function removeCartItem(user, productId) {
  await db.run('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [user.id, productId]);
}

export async function lastAddress(userId) {
  return db.get(
    `SELECT recipient, phone, region, city, street, apartment FROM orders
     WHERE buyer_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`, [userId]);
}

// The cart, grouped by seller, with a warning on lines that need attention.
export async function getCart(user) {
  const rows = await db.all(
    `SELECT ci.product_id, ci.quantity, ci.price_when_added,
            p.title, p.price_amd, p.stock, p.is_published, p.seller_id, u.store_name,
            (SELECT file_path FROM product_images i WHERE i.product_id = p.id ORDER BY position LIMIT 1) AS main_image
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     JOIN users u ON u.id = p.seller_id
     WHERE ci.user_id = ?
     ORDER BY u.store_name, p.title`, [user.id]);

  const groups = new Map();
  let total = 0, itemCount = 0, canCheckout = rows.length > 0;
  for (const r of rows) {
    let warning = null;
    if (!r.is_published) warning = 'unavailable';
    else if (r.stock === 0) warning = 'sold_out';
    else if (r.quantity > r.stock) warning = 'not_enough_stock';
    else if (r.price_amd !== r.price_when_added) warning = 'price_changed';
    if (warning && warning !== 'price_changed') canCheckout = false;

    if (!groups.has(r.seller_id)) {
      groups.set(r.seller_id, { seller: { id: r.seller_id, storeName: r.store_name }, items: [], subtotalAmd: 0 });
    }
    const g = groups.get(r.seller_id);
    const line = r.price_amd * r.quantity;
    g.items.push({
      productId: r.product_id, title: r.title, image: imageUrls(r.main_image),
      unitPriceAmd: r.price_amd, priceWhenAddedAmd: r.price_when_added,
      quantity: r.quantity, stock: r.stock, lineTotalAmd: line, warning,
    });
    g.subtotalAmd += line;
    total += line;
    itemCount += r.quantity;
  }
  return { groups: [...groups.values()], totalAmd: total, itemCount, canCheckout,
           lastAddress: await lastAddress(user.id) };
}

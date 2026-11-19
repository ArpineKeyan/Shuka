// Seller logic. Every query includes seller_id = the current user, so a seller
// can never read or change another seller's products.
import { db, tx } from './db.js';
import { badRequest, conflict, notFound } from './errors.js';
import { str, normalizePhone, phoneMessage } from './validate.js';
import { imageUrls, MAX_IMAGES } from './images.js';

export async function activateSeller(user, body) {
  if (user.store_name != null) throw conflict('You are already a seller.', 'already_seller');
  const storeName = str(body?.storeName);
  const phone = normalizePhone(str(body?.phone ?? user.phone));
  const fields = {};
  if (storeName.length < 2 || storeName.length > 60) fields.storeName = 'Store name must be 2–60 characters.';
  if (!phone) fields.phone = phoneMessage;
  if (Object.keys(fields).length) throw badRequest('Please fix the highlighted fields.', fields);
  try {
    await db.run('UPDATE users SET store_name = ?, phone = ? WHERE id = ? AND store_name IS NULL',
      [storeName, phone, user.id]);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      throw badRequest('Please fix the highlighted fields.', { storeName: 'This store name is taken.' });
    }
    throw err;
  }
  return db.get('SELECT * FROM users WHERE id = ?', [user.id]);
}

// Checks product fields. partial = true for PATCH (only check what was sent).
export async function validateProduct(body, { partial }) {
  const out = {};
  const fields = {};
  const has = k => body?.[k] !== undefined;

  if (!partial || has('title')) {
    const v = str(body?.title);
    if (v.length < 3 || v.length > 120) fields.title = 'Title must be 3–120 characters.'; else out.title = v;
  }
  if (!partial || has('description')) {
    const v = str(body?.description);
    if (v.length < 10 || v.length > 5000) fields.description = 'Description must be 10–5000 characters.'; else out.description = v;
  }
  if (!partial || has('priceAmd')) {
    const v = Number(body?.priceAmd);
    if (!Number.isInteger(v) || v < 1 || v > 100_000_000) fields.priceAmd = 'Price must be a whole number of dram, at least 1.';
    else out.price_amd = v;
  }
  if (!partial || has('stock')) {
    const v = Number(body?.stock);
    if (!Number.isInteger(v) || v < 0 || v > 100_000) fields.stock = 'Stock must be a whole number, 0 or more.';
    else out.stock = v;
  }
  if (!partial || has('categoryId')) {
    const v = Number(body?.categoryId);
    const ok = Number.isInteger(v) && await db.get('SELECT 1 FROM categories WHERE id = ?', [v]);
    if (!ok) fields.categoryId = 'Choose a category.'; else out.category_id = v;
  }
  if (has('isPublished')) {
    if (typeof body.isPublished !== 'boolean') fields.isPublished = 'isPublished must be true or false.';
    else out.is_published = body.isPublished ? 1 : 0;
  }
  if (Object.keys(fields).length) throw badRequest('Please fix the highlighted fields.', fields);
  return out;
}

export async function ownProduct(sellerId, productId) {
  const p = await db.get('SELECT * FROM products WHERE id = ? AND seller_id = ?', [productId, sellerId]);
  if (!p) throw notFound('Product not found.');
  return p;
}

async function imageCount(productId) {
  return (await db.get('SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?', [productId])).n;
}

export async function createProduct(sellerId, body) {
  const v = await validateProduct(body, { partial: false });
  // New products start unpublished: photos are uploaded after the product exists.
  const { lastId } = await db.run(
    `INSERT INTO products (seller_id, category_id, title, description, price_amd, stock, is_published)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [sellerId, v.category_id, v.title, v.description, v.price_amd, v.stock]);
  return lastId;
}

export async function updateProduct(sellerId, productId, body) {
  await ownProduct(sellerId, productId);
  const v = await validateProduct(body, { partial: true });
  if (v.is_published === 1 && (await imageCount(productId)) === 0) {
    throw badRequest('Add at least one photo before publishing.', { images: 'Add at least one photo.' });
  }
  const cols = Object.keys(v);
  if (cols.length === 0) return;
  // Column names come from validateProduct, never from the request, so this is safe.
  await db.run(
    `UPDATE products SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND seller_id = ?`,
    [...cols.map(c => v[c]), productId, sellerId]);
}

// For the seller's product table, including units sold (cancelled parts don't count).
export async function listSellerProducts(sellerId) {
  const rows = await db.all(
    `SELECT p.id, p.title, p.price_amd, p.stock, p.is_published, p.created_at,
            (SELECT file_path FROM product_images i WHERE i.product_id = p.id ORDER BY position LIMIT 1) AS main_image,
            COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
                      JOIN seller_orders so ON so.id = oi.seller_order_id
                      WHERE oi.product_id = p.id AND so.status <> 'cancelled'), 0) AS units_sold
     FROM products p WHERE p.seller_id = ? ORDER BY p.created_at DESC, p.id DESC`, [sellerId]);
  return rows.map(r => ({
    id: r.id, title: r.title, priceAmd: r.price_amd, stock: r.stock,
    isPublished: r.is_published === 1, unitsSold: r.units_sold,
    image: imageUrls(r.main_image), createdAt: r.created_at,
  }));
}

// Free positions 0..4 for new images. Position 0 (or the lowest) is the main image.
export async function freePositions(productId) {
  const used = new Set((await db.all('SELECT position FROM product_images WHERE product_id = ?', [productId]))
    .map(r => r.position));
  return [...Array(MAX_IMAGES).keys()].filter(p => !used.has(p));
}

export async function addImageRows(productId, keys) {
  return tx(async t => {
    const used = new Set((await t.all('SELECT position FROM product_images WHERE product_id = ?', [productId]))
      .map(r => r.position));
    const free = [...Array(MAX_IMAGES).keys()].filter(p => !used.has(p));
    if (free.length < keys.length) throw conflict(`A product can have at most ${MAX_IMAGES} photos.`, 'too_many_images');
    for (const [i, key] of keys.entries()) {
      await t.run('INSERT INTO product_images (product_id, file_path, position) VALUES (?, ?, ?)',
        [productId, key, free[i]]);
    }
  });
}

// Deletes one image row. If it was the last photo, the product is unpublished.
export async function deleteImageRow(productId, imageId) {
  return tx(async t => {
    const img = await t.get('SELECT * FROM product_images WHERE id = ? AND product_id = ?', [imageId, productId]);
    if (!img) throw notFound('Photo not found.');
    await t.run('DELETE FROM product_images WHERE id = ?', [imageId]);
    const { n } = await t.get('SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?', [productId]);
    if (n === 0) await t.run('UPDATE products SET is_published = 0 WHERE id = ?', [productId]);
    return img.file_path;
  });
}

// Moves one image to position 0 (main), keeping the order of the rest.
export async function setMainImage(productId, imageId) {
  return tx(async t => {
    const imgs = await t.all('SELECT * FROM product_images WHERE product_id = ? ORDER BY position', [productId]);
    const chosen = imgs.find(i => i.id === imageId);
    if (!chosen) throw notFound('Photo not found.');
    const ordered = [chosen, ...imgs.filter(i => i.id !== imageId)];
    // position is UNIQUE and must stay 0..4, so remove and re-insert in the new order.
    await t.run('DELETE FROM product_images WHERE product_id = ?', [productId]);
    for (const [pos, img] of ordered.entries()) {
      await t.run('INSERT INTO product_images (id, product_id, file_path, position) VALUES (?, ?, ?, ?)',
        [img.id, productId, img.file_path, pos]);
    }
  });
}

// Dashboard numbers. Plain SQL, as the brief asks.
export async function sellerOverview(sellerId) {
  const counts = await db.get(
    `SELECT COALESCE(SUM(status = 'placed'), 0)    AS placed,
            COALESCE(SUM(status = 'confirmed'), 0) AS confirmed,
            COALESCE(SUM(status = 'shipped'), 0)   AS shipped,
            COALESCE(SUM(status = 'delivered'), 0) AS delivered,
            COALESCE(SUM(status = 'cancelled'), 0) AS cancelled
     FROM seller_orders WHERE seller_id = ?`, [sellerId]);
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { revenue } = await db.get(
    `SELECT COALESCE(SUM(so.subtotal_amd), 0) AS revenue
     FROM seller_orders so
     WHERE so.seller_id = ? AND so.status = 'delivered'
       AND EXISTS (SELECT 1 FROM status_history h
                   WHERE h.seller_order_id = so.id AND h.to_status = 'delivered' AND h.created_at >= ?)`,
    [sellerId, since]);
  return {
    toConfirm: counts.placed, toShip: counts.confirmed,
    ordersByStatus: counts, revenueLast30DaysAmd: revenue,
  };
}

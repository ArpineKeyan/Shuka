// Catalog queries: categories, product search, product page, reviews.
import { db } from './db.js';
import { badRequest } from './errors.js';
import { imageUrls } from './images.js';

export const PAGE_SIZE = 24;

const SORTS = {
  newest:     'p.created_at DESC, p.id DESC',
  price_asc:  'p.price_amd ASC, p.id DESC',
  price_desc: 'p.price_amd DESC, p.id DESC',
  rating:     'p.rating_avg DESC, p.rating_count DESC, p.id DESC',
};

export function listCategories() {
  return db.all('SELECT id, name, slug FROM categories ORDER BY name');
}

function intParam(value, name, { min = 0 } = {}) {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw badRequest(`${name} must be a whole number ≥ ${min}.`);
  return n;
}

// Turns a product row into the shape the frontend uses.
function card(r) {
  return {
    id: r.id, title: r.title, priceAmd: r.price_amd, stock: r.stock,
    ratingAvg: r.rating_avg, ratingCount: r.rating_count,
    category: { slug: r.category_slug, name: r.category_name },
    storeName: r.store_name,
    image: imageUrls(r.main_image),
    createdAt: r.created_at,
  };
}

const CARD_SELECT = `
  SELECT p.id, p.title, p.price_amd, p.stock, p.rating_avg, p.rating_count, p.created_at,
         c.slug AS category_slug, c.name AS category_name, u.store_name,
         (SELECT file_path FROM product_images i WHERE i.product_id = p.id
           ORDER BY position LIMIT 1) AS main_image
  FROM products p
  JOIN categories c ON c.id = p.category_id
  JOIN users u ON u.id = p.seller_id`;

// GET /products?q=&category=&minPrice=&maxPrice=&sort=&page=
export async function searchProducts(query) {
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  const sort = query.sort || 'newest';
  if (!SORTS[sort]) throw badRequest('sort must be one of: ' + Object.keys(SORTS).join(', '));
  const minPrice = intParam(query.minPrice, 'minPrice');
  const maxPrice = intParam(query.maxPrice, 'maxPrice');
  const page = intParam(query.page, 'page', { min: 1 }) ?? 1;

  const where = ['p.is_published = 1'];
  const args = [];
  if (q) {
    // Escape % and _ so they are searched as plain characters.
    const like = '%' + q.replace(/[\\%_]/g, ch => '\\' + ch) + '%';
    where.push(`(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')`);
    args.push(like, like);
  }
  if (query.category) { where.push('c.slug = ?'); args.push(String(query.category)); }
  if (minPrice != null) { where.push('p.price_amd >= ?'); args.push(minPrice); }
  if (maxPrice != null) { where.push('p.price_amd <= ?'); args.push(maxPrice); }
  const whereSql = 'WHERE ' + where.join(' AND ');

  const { total } = await db.get(
    `SELECT COUNT(*) AS total FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`, args);
  const rows = await db.all(
    `${CARD_SELECT} ${whereSql} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`,
    [...args, PAGE_SIZE, (page - 1) * PAGE_SIZE]);

  return { items: rows.map(card), total, page, pageSize: PAGE_SIZE,
           pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

// GET /products/:id — published products for everyone; the owner also sees unpublished ones.
export async function getProduct(id, user) {
  const r = await db.get(
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name, u.store_name
     FROM products p JOIN categories c ON c.id = p.category_id JOIN users u ON u.id = p.seller_id
     WHERE p.id = ? AND (p.is_published = 1 OR p.seller_id = ?)`,
    [id, user?.id ?? -1]);
  if (!r) return null;
  const images = await db.all(
    'SELECT id, file_path, position FROM product_images WHERE product_id = ? ORDER BY position', [id]);
  return {
    id: r.id, title: r.title, description: r.description, priceAmd: r.price_amd, stock: r.stock,
    isPublished: r.is_published === 1, ratingAvg: r.rating_avg, ratingCount: r.rating_count,
    category: { id: r.category_id, slug: r.category_slug, name: r.category_name },
    seller: { id: r.seller_id, storeName: r.store_name },
    images: images.map(i => ({ id: i.id, position: i.position, ...imageUrls(i.file_path) })),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// GET /products/:id/reviews — newest first
export async function listReviews(productId, pageParam) {
  const page = intParam(pageParam, 'page', { min: 1 }) ?? 1;
  const size = 20;
  const rows = await db.all(
    `SELECT r.id, r.rating, r.body, r.created_at, u.name AS buyer_name
     FROM reviews r JOIN users u ON u.id = r.buyer_id
     WHERE r.product_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    [productId, size, (page - 1) * size]);
  return rows.map(r => ({ id: r.id, rating: r.rating, body: r.body,
                          buyerName: r.buyer_name, createdAt: r.created_at }));
}

import { Router } from 'express';
import { listCategories, searchProducts, getProduct, listReviews } from '../catalog.js';
import { db } from '../db.js';
import { notFound } from '../errors.js';

export const catalogRouter = Router();

function productId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw notFound('Product not found.');
  return id;
}

// Anyone
catalogRouter.get('/categories', async (_req, res) => {
  res.json({ categories: await listCategories() });
});

catalogRouter.get('/products', async (req, res) => {
  res.json(await searchProducts(req.query));
});

catalogRouter.get('/products/:id', async (req, res) => {
  const product = await getProduct(productId(req), req.user);
  if (!product) throw notFound('Product not found.');
  res.json({ product });
});

catalogRouter.get('/products/:id/reviews', async (req, res) => {
  const id = productId(req);
  const exists = await db.get('SELECT 1 FROM products WHERE id = ? AND is_published = 1', [id]);
  if (!exists) throw notFound('Product not found.');
  res.json({ reviews: await listReviews(id, req.query.page) });
});

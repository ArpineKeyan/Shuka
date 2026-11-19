import { Router } from 'express';
import { requireUser } from '../auth.js';
import { notFound } from '../errors.js';
import { getCart, setCartItem, removeCartItem } from '../cart.js';
import { checkout, listOrders, getOrder, REGIONS } from '../orders.js';
import { buyerCancel, addReview } from '../lifecycle.js';
import { getProduct } from '../catalog.js';

export const ordersRouter = Router();

const idParam = (v, what) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw notFound(`${what} not found.`);
  return n;
};

// Signed in
ordersRouter.get('/cart', requireUser, async (req, res) => {
  res.json(await getCart(req.user));
});

ordersRouter.put('/cart/items/:productId', requireUser, async (req, res) => {
  await setCartItem(req.user, idParam(req.params.productId, 'Product'), req.body?.quantity);
  res.json(await getCart(req.user));
});

ordersRouter.delete('/cart/items/:productId', requireUser, async (req, res) => {
  await removeCartItem(req.user, idParam(req.params.productId, 'Product'));
  res.json(await getCart(req.user));
});

ordersRouter.get('/regions', (_req, res) => res.json({ regions: REGIONS }));

ordersRouter.post('/orders', requireUser, async (req, res) => {
  const { orderId, duplicate } = await checkout(req.user, req.body);
  res.status(duplicate ? 200 : 201).json({ order: await getOrder(req.user, orderId), duplicate });
});

// Owner of the order
ordersRouter.get('/orders', requireUser, async (req, res) => {
  res.json({ orders: await listOrders(req.user) });
});

ordersRouter.get('/orders/:id', requireUser, async (req, res) => {
  res.json({ order: await getOrder(req.user, idParam(req.params.id, 'Order')) });
});

ordersRouter.post('/orders/:id/sellers/:sellerOrderId/cancel', requireUser, async (req, res) => {
  const orderId = idParam(req.params.id, 'Order');
  await buyerCancel(req.user, orderId, idParam(req.params.sellerOrderId, 'Order'));
  res.json({ order: await getOrder(req.user, orderId) });
});

// Buyer with a delivered item
ordersRouter.post('/products/:id/reviews', requireUser, async (req, res) => {
  const id = idParam(req.params.id, 'Product');
  await addReview(req.user, id, req.body);
  res.status(201).json({ product: await getProduct(id, req.user) });
});

import { Router } from 'express';
import multer from 'multer';
import { requireUser, requireSeller, publicUser } from '../auth.js';
import { badRequest, notFound } from '../errors.js';
import { getProduct } from '../catalog.js';
import { processImage, newImageKey, storeImage, removeImage, MAX_FILE_BYTES, MAX_IMAGES } from '../images.js';
import {
  activateSeller, createProduct, updateProduct, listSellerProducts, ownProduct,
  freePositions, addImageRows, deleteImageRow, setMainImage, sellerOverview,
} from '../seller.js';

export const sellerRouter = Router();

const idParam = (v, what = 'Product') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw notFound(`${what} not found.`);
  return n;
};

// Files are kept in memory only long enough to check and resize them.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_IMAGES },
}).array('images', MAX_IMAGES);

function receiveFiles(req, res) {
  return new Promise((resolve, reject) => upload(req, res, err => {
    if (!err) return resolve();
    if (err.code === 'LIMIT_FILE_SIZE') return reject(badRequest(`Each photo must be ${MAX_FILE_BYTES / 1024 / 1024} MB or smaller.`));
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return reject(badRequest(`Upload up to ${MAX_IMAGES} photos in the "images" field.`));
    }
    reject(err);
  }));
}

// Signed in
sellerRouter.post('/seller/activate', requireUser, async (req, res) => {
  res.json({ user: publicUser(await activateSeller(req.user, req.body)) });
});

// Seller only from here on
sellerRouter.get('/seller/overview', requireSeller, async (req, res) => {
  res.json(await sellerOverview(req.user.id));
});

sellerRouter.get('/seller/products', requireSeller, async (req, res) => {
  res.json({ products: await listSellerProducts(req.user.id) });
});

sellerRouter.post('/seller/products', requireSeller, async (req, res) => {
  const id = await createProduct(req.user.id, req.body);
  res.status(201).json({ product: await getProduct(id, req.user) });
});

sellerRouter.get('/seller/products/:id', requireSeller, async (req, res) => {
  const id = idParam(req.params.id);
  await ownProduct(req.user.id, id);
  res.json({ product: await getProduct(id, req.user) });
});

sellerRouter.patch('/seller/products/:id', requireSeller, async (req, res) => {
  const id = idParam(req.params.id);
  await updateProduct(req.user.id, id, req.body);
  res.json({ product: await getProduct(id, req.user) });
});

// Upload 1–5 photos (multipart form, field name "images").
sellerRouter.post('/seller/products/:id/images', requireSeller, async (req, res) => {
  const id = idParam(req.params.id);
  await ownProduct(req.user.id, id);
  await receiveFiles(req, res);
  const files = req.files || [];
  if (files.length === 0) throw badRequest('Choose at least one photo.');
  if (files.length > (await freePositions(id)).length) {
    throw badRequest(`A product can have at most ${MAX_IMAGES} photos.`);
  }

  // Check and resize all files first, then store them. None of this runs inside a DB transaction.
  const processed = [];
  for (const f of files) processed.push(await processImage(f.buffer, f.originalname));
  const keys = processed.map(() => newImageKey(id));
  await Promise.all(keys.map((k, i) => storeImage(k, processed[i])));

  try {
    await addImageRows(id, keys);
  } catch (err) {
    await Promise.all(keys.map(removeImage));   // don't leave orphan files behind
    throw err;
  }
  res.status(201).json({ product: await getProduct(id, req.user) });
});

sellerRouter.delete('/seller/products/:id/images/:imageId', requireSeller, async (req, res) => {
  const id = idParam(req.params.id);
  const imageId = idParam(req.params.imageId, 'Photo');
  await ownProduct(req.user.id, id);
  const key = await deleteImageRow(id, imageId);
  await removeImage(key);
  res.json({ product: await getProduct(id, req.user) });
});

sellerRouter.post('/seller/products/:id/images/:imageId/main', requireSeller, async (req, res) => {
  const id = idParam(req.params.id);
  const imageId = idParam(req.params.imageId, 'Photo');
  await ownProduct(req.user.id, id);
  await setMainImage(id, imageId);
  res.json({ product: await getProduct(id, req.user) });
});

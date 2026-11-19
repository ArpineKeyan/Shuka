// Break-it tests from the project brief. Run against a running server:
//   npm run break-it                                   (local, http://localhost:3000)
//   BASE_URL=https://your-site.netlify.app npm run break-it   (live site)
// Each run creates its own test accounts and products, so it can run many times.
import sharp from 'sharp';

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const RUN = Date.now().toString(36);
const results = [];

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body, isForm) {
    const headers = { cookie: this.cookie };
    let payload;
    if (isForm) payload = body;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + '/api' + path, { method, headers, body: payload });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) if (c.startsWith('shuka_session=')) this.cookie = c.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b ?? {}); }
  put(p, b) { return this.req('PUT', p, b); }
  patch(p, b) { return this.req('PATCH', p, b); }
}

let n = 0;
async function newUser(label) {
  const c = new Client();
  const r = await c.post('/auth/register', {
    email: `breakit-${RUN}-${label}-${++n}@test.am`, password: 'breakit-123', name: `Test ${label}`,
    phone: '+37499' + String(100000 + Math.floor(Math.random() * 899999)) });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.data)}`);
  c.user = r.data.user;
  return c;
}
async function newSeller(label) {
  const c = await newUser(label);
  const r = await c.post('/seller/activate', { storeName: `Breakit ${label} ${RUN}-${n}` });
  if (r.status !== 200) throw new Error(`activate failed: ${r.status}`);
  return c;
}
const photo = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#888' } }).jpeg().toBuffer();
async function newProduct(seller, { price = 5000, stock = 10, title = 'Break-it item' } = {}) {
  const r = await seller.post('/seller/products', { title: `${title} ${RUN}`, description: 'Created by the break-it test.', priceAmd: price, stock, categoryId: 1 });
  if (r.status !== 201) throw new Error(`create product failed: ${r.status} ${JSON.stringify(r.data)}`);
  const id = r.data.product.id;
  const fd = new FormData();
  fd.append('images', new Blob([photo], { type: 'image/jpeg' }), 'photo.jpg');
  const up = await seller.req('POST', `/seller/products/${id}/images`, fd, true);
  if (up.status !== 201) throw new Error(`upload failed: ${up.status} ${JSON.stringify(up.data)}`);
  await seller.patch(`/seller/products/${id}`, { isPublished: true });
  return id;
}
const address = key => ({ requestKey: key, recipient: 'Break It', phone: '+37499123456', region: 'Yerevan', city: 'Yerevan', street: 'Test street 1' });
const key = () => `breakit-${RUN}-${Math.random().toString(36).slice(2)}`;
async function buy(buyer, productId, qty = 1) {
  const c = await buyer.put(`/cart/items/${productId}`, { quantity: qty });
  if (c.status !== 200) throw new Error(`add to cart failed: ${c.status} ${JSON.stringify(c.data)}`);
  const o = await buyer.post('/orders', address(key()));
  if (o.status !== 201) throw new Error(`checkout failed: ${o.status} ${JSON.stringify(o.data)}`);
  return o.data.order;
}
const stockOf = async id => (await new Client().get(`/products/${id}`)).data.product?.stock;

async function test(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.log(`FAIL  ${name} — ${e.message}`);
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log(`Break-it tests against ${BASE}\n`);
const health = await new Client().get('/health').catch(e => ({ status: 0, data: e.message }));
if (health.status !== 200) { console.log(`The server is not reachable at ${BASE} (${health.data}). Start it first.`); process.exit(1); }

const sellerA = await newSeller('A');
const sellerB = await newSeller('B');

await test('Last units: stock 3, 30 checkouts at the same time', async () => {
  const id = await newProduct(sellerA, { stock: 3, title: 'Last units' });
  const buyers = [];
  for (let i = 0; i < 30; i++) {
    const b = await newUser('rush');
    const r = await b.put(`/cart/items/${id}`, { quantity: 1 });
    expect(r.status === 200, `could not add to cart: ${r.status}`);
    buyers.push(b);
  }
  const res = await Promise.all(buyers.map(b => b.post('/orders', address(key()))));
  const count = s => res.filter(r => r.status === s).length;
  const locked = res.filter(r => JSON.stringify(r.data).toLowerCase().includes('locked')).length;
  const stock = await stockOf(id);
  const detail = `${count(201)} orders, ${count(409)} × 409, stock ${stock}, ${locked} "database is locked", other: ${res.length - count(201) - count(409)}`;
  expect(count(201) === 3 && count(409) === 27 && stock === 0 && locked === 0, detail);
  return detail;
});

await test('Double click: same checkout twice with the same request key', async () => {
  const id = await newProduct(sellerA);
  const b = await newUser('double');
  await b.put(`/cart/items/${id}`, { quantity: 1 });
  const k = key();
  const [r1, r2] = await Promise.all([b.post('/orders', address(k)), b.post('/orders', address(k))]);
  const r3 = await b.post('/orders', address(k));
  const orders = (await b.get('/orders')).data.orders.length;
  const ids = new Set([r1, r2, r3].map(r => r.data.order?.id));
  expect(orders === 1 && ids.size === 1, `buyer has ${orders} orders, answers: ${[r1, r2, r3].map(r => r.status).join(', ')}`);
  return `1 order (#${[...ids][0]}), answers ${r1.status}/${r2.status}/${r3.status}`;
});

await test('Price changed: checkout stops and shows the new price', async () => {
  const id = await newProduct(sellerA, { price: 5000 });
  const b = await newUser('price');
  await b.put(`/cart/items/${id}`, { quantity: 1 });
  await sellerA.patch(`/seller/products/${id}`, { priceAmd: 6500 });
  const r = await b.post('/orders', address(key()));
  const c = r.data.error?.details?.changes?.[0];
  expect(r.status === 409 && r.data.error.code === 'price_changed' && c?.newPriceAmd === 6500,
    `got ${r.status} ${JSON.stringify(r.data)}`);
  expect((await b.get('/orders')).data.orders.length === 0, 'an order was created anyway');
  return `409 price_changed: ${c.oldPriceAmd} → ${c.newPriceAmd}`;
});

await test('Old order after edit: keeps the old title and price', async () => {
  const id = await newProduct(sellerA, { price: 4000, title: 'Original title' });
  const b = await newUser('old');
  const order = await buy(b, id);
  await sellerA.patch(`/seller/products/${id}`, { title: 'Changed title', priceAmd: 9999 });
  const item = (await b.get(`/orders/${order.id}`)).data.order.sellers[0].items[0];
  expect(item.title.startsWith('Original title') && item.unitPriceAmd === 4000, JSON.stringify(item));
  return `order shows "${item.title}" at ${item.unitPriceAmd} ֏`;
});

let shared;   // an order between buyer X and seller A, reused below
await test("Someone else's order: other seller and other buyer get no data", async () => {
  const id = await newProduct(sellerA);
  const x = await newUser('x');
  const order = await buy(x, id);
  const soId = order.sellers[0].sellerOrderId;
  shared = { x, order, soId, productId: id };
  const other = await newUser('y');
  const r1 = await sellerB.get(`/seller/orders/${soId}`);
  const r2 = await other.get(`/orders/${order.id}`);
  const r3 = await sellerB.post(`/seller/orders/${soId}/status`, { to: 'confirmed' });
  const leaked = [r1, r2, r3].some(r => JSON.stringify(r.data).includes('Break It'));
  expect([r1, r2, r3].every(r => r.status === 403 || r.status === 404) && !leaked,
    `answers ${r1.status}/${r2.status}/${r3.status}`);
  return `seller B: ${r1.status}, buyer Y: ${r2.status}, seller B moving it: ${r3.status}`;
});

await test('Move not allowed: Placed → Delivered, and cancelling a shipped order', async () => {
  const { x, order, soId } = shared;
  const r1 = await sellerA.post(`/seller/orders/${soId}/status`, { to: 'delivered' });
  const after1 = (await sellerA.get(`/seller/orders/${soId}`)).data.order;
  expect(r1.status === 409 && after1.status === 'placed' && after1.history.length === 1, `placed→delivered gave ${r1.status}, status ${after1.status}`);
  await sellerA.post(`/seller/orders/${soId}/status`, { to: 'confirmed' });
  await sellerA.post(`/seller/orders/${soId}/status`, { to: 'shipped' });
  const r2 = await x.post(`/orders/${order.id}/sellers/${soId}/cancel`);
  const after2 = (await sellerA.get(`/seller/orders/${soId}`)).data.order;
  expect(r2.status === 409 && after2.status === 'shipped', `cancel shipped gave ${r2.status}, status ${after2.status}`);
  return `both 409, nothing changed (history rows: ${after2.history.length})`;
});

await test('Cancel returns stock', async () => {
  const id = await newProduct(sellerA, { stock: 10 });
  const b = await newUser('cancel');
  const order = await buy(b, id, 4);
  const before = await stockOf(id);
  const r = await b.post(`/orders/${order.id}/sellers/${order.sellers[0].sellerOrderId}/cancel`);
  const after = await stockOf(id);
  expect(r.status === 200 && before === 6 && after === 10, `stock ${before} → ${after}, answer ${r.status}`);
  return `stock ${before} → ${after}`;
});

await test('Foreign keys: order item for a product that does not exist', async () => {
  if (BASE.includes('localhost') || process.env.DATABASE_URL) {
    // Talks to the database directly (the local file, or Turso if DATABASE_URL is set).
    const { db } = await import('../src/db.js');
    const so = await db.get('SELECT id FROM seller_orders LIMIT 1');
    try {
      await db.run('INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?, 999999999, ?, 1, 1)', [so.id, 'ghost']);
      await db.run("DELETE FROM order_items WHERE title = 'ghost'");
      throw new Error('SQLite accepted the row');
    } catch (e) {
      expect(/FOREIGN KEY/i.test(e.message), e.message);
      return 'rejected by SQLite: ' + e.message;
    }
  }
  throw new Error('needs database access: run locally, or set DATABASE_URL and DATABASE_AUTH_TOKEN');
});

await test('Bad upload: 30 MB file and a renamed .exe', async () => {
  const id = await newProduct(sellerA);
  const send = async (buf, name, type) => {
    const fd = new FormData();
    fd.append('images', new Blob([buf], { type }), name);
    return sellerA.req('POST', `/seller/products/${id}/images`, fd, true);
  };
  const big = await send(Buffer.alloc(30 * 1024 * 1024, 1), 'big.jpg', 'image/jpeg');
  const exe = await send(Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(20000, 7)]), 'holiday.jpg', 'image/jpeg');
  const msg = r => r.data?.error?.message || `HTTP ${r.status}`;
  expect(big.status === 400 || big.status === 413, `30 MB: ${big.status} ${msg(big)}`);
  expect(exe.status === 400, `exe: ${exe.status} ${msg(exe)}`);
  return `30 MB → "${msg(big)}" | .exe → "${msg(exe)}"`;
});

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} passed.`);
process.exit(failed ? 1 : 0);

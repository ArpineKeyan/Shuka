// Fills an empty database with demo data: categories, 3 sellers, 42 products, 2 buyers.
// Run: npm run seed   (only works on an empty database)
import { migrate } from './migrate.js';
import { db, tx } from './db.js';
import { hashPassword } from './auth.js';
import sharp from 'sharp';
import { processImage, newImageKey, storeImage } from './images.js';

const DEMO_PASSWORD = 'shuka-demo';

const CATEGORIES = [
  ['Electronics', 'electronics'], ['Home & Kitchen', 'home-kitchen'], ['Clothing', 'clothing'],
  ['Books', 'books'], ['Food & Drinks', 'food-drinks'], ['Beauty', 'beauty'],
  ['Sports', 'sports'], ['Handmade', 'handmade'],
];

const SELLERS = [
  { email: 'ani@shuka.am',   name: 'Ani Petrosyan',   phone: '+37491100001', store: 'Ani Tech' },
  { email: 'gor@shuka.am',   name: 'Gor Hakobyan',    phone: '+37491100002', store: 'Gor Home & Style' },
  { email: 'lilit@shuka.am', name: 'Lilit Sargsyan',  phone: '+37491100003', store: 'Lilit Handmade' },
];
const BUYERS = [
  { email: 'buyer1@shuka.am', name: 'Aram Grigoryan', phone: '+37493200001' },
  { email: 'buyer2@shuka.am', name: 'Mariam Avetisyan', phone: '+37493200002' },
];

// [seller index, category slug, title, price AMD, stock, description]
const PRODUCTS = [
  [0, 'electronics', 'Wireless earbuds', 14900, 25, 'Bluetooth 5.3 earbuds with charging case. About 6 hours per charge.'],
  [0, 'electronics', 'USB-C fast charger 30W', 7500, 40, 'Charges most phones to 50% in 30 minutes.'],
  [0, 'electronics', 'Power bank 20000 mAh', 12900, 15, 'Two USB-A ports and one USB-C. Charges a phone about 4 times.'],
  [0, 'electronics', 'Mechanical keyboard', 32000, 8, 'Compact keyboard with brown switches and an Armenian layout sticker set.'],
  [0, 'electronics', 'Wireless mouse', 6900, 30, 'Quiet clicks, works for a year on one AA battery.'],
  [0, 'electronics', 'Phone stand', 3500, 50, 'Aluminium stand, adjustable angle, fits phones and small tablets.'],
  [0, 'electronics', 'Smart LED bulb', 5900, 3, 'Change color and brightness from your phone.'],
  [0, 'electronics', 'Portable speaker', 21500, 12, 'Waterproof speaker, good for picnics at Lake Sevan.'],
  [0, 'electronics', 'HDMI cable 2 m', 2900, 60, 'Supports 4K at 60 Hz.'],
  [0, 'electronics', 'Webcam 1080p', 16900, 10, 'Full HD webcam with a built-in microphone.'],
  [0, 'books', 'Learn JavaScript in 30 days', 9800, 20, 'A practical beginner book with exercises for every day.'],
  [0, 'books', 'Intro to databases', 11500, 7, 'Tables, keys, joins and transactions, explained with examples.'],
  [0, 'sports', 'Fitness tracker band', 18900, 9, 'Counts steps, sleep and heart rate. Battery lasts a week.'],
  [0, 'sports', 'Jump rope', 2500, 35, 'Adjustable length with ball bearings.'],
  [1, 'home-kitchen', 'Copper jazzve (coffee pot)', 8900, 18, 'Traditional copper pot for Armenian coffee. Holds 2 cups.'],
  [1, 'home-kitchen', 'Ceramic coffee cups, set of 6', 12500, 10, 'Small cups for Armenian coffee, with saucers.'],
  [1, 'home-kitchen', 'Cast iron pan 28 cm', 19900, 6, 'Heavy pan that keeps heat well. Works on gas and induction.'],
  [1, 'home-kitchen', 'Kitchen knife set', 24900, 5, 'Three knives and a wooden block.'],
  [1, 'home-kitchen', 'Wool blanket', 29000, 4, 'Warm blanket made from Armenian sheep wool.'],
  [1, 'home-kitchen', 'Tea glasses, set of 4', 6500, 22, 'Glasses with metal holders.'],
  [1, 'home-kitchen', 'Bamboo cutting board', 4900, 28, 'Large board with a juice groove.'],
  [1, 'home-kitchen', 'Table lamp', 15500, 2, 'Warm light, linen shade.'],
  [1, 'clothing', 'Cotton T-shirt', 5900, 45, 'Plain T-shirt, 100% cotton. Sizes S to XL.'],
  [1, 'clothing', 'Hoodie', 14500, 16, 'Warm hoodie with a front pocket.'],
  [1, 'clothing', 'Winter hat', 4500, 30, 'Knitted hat for cold Yerevan winters.'],
  [1, 'clothing', 'Leather belt', 8500, 12, 'Brown leather belt with a metal buckle.'],
  [1, 'clothing', 'Running socks, 3 pairs', 3900, 40, 'Breathable socks for sport.'],
  [1, 'sports', 'Yoga mat', 9900, 14, 'Non-slip mat, 6 mm thick.'],
  [1, 'beauty', 'Hand cream', 2900, 50, 'Hand cream with apricot oil.'],
  [2, 'handmade', 'Pomegranate wall plate', 18000, 3, 'Hand-painted ceramic plate with a pomegranate pattern.'],
  [2, 'handmade', 'Felt slippers', 7900, 11, 'Warm handmade felt slippers.'],
  [2, 'handmade', 'Silver earrings', 22000, 5, 'Handmade silver earrings with an Armenian ornament.'],
  [2, 'handmade', 'Wooden spoon set', 5500, 15, 'Three spoons carved from apricot wood.'],
  [2, 'handmade', 'Embroidered pillow cover', 9500, 8, 'Cotton cover with hand embroidery, 45 × 45 cm.'],
  [2, 'handmade', 'Clay candle holder', 4200, 1, 'Small handmade candle holder.'],
  [2, 'food-drinks', 'Apricot jam', 2400, 40, 'Homemade jam from Ararat valley apricots. 400 g jar.'],
  [2, 'food-drinks', 'Dried fruit mix', 4800, 25, 'Dried apricots, plums and figs. 500 g.'],
  [2, 'food-drinks', 'Mountain herbal tea', 3200, 30, 'Thyme and mint collected in Syunik. 100 g.'],
  [2, 'food-drinks', 'Gata (sweet bread)', 2800, 0, 'Traditional sweet bread. Baked to order.'],
  [2, 'food-drinks', 'Walnut sujukh', 3900, 18, 'Walnuts in grape juice. About 300 g.'],
  [2, 'beauty', 'Natural soap, set of 3', 4500, 20, 'Handmade soap with lavender, honey and rose.'],
  [2, 'beauty', 'Rose water toner', 3800, 14, 'Toner made from Armenian roses. 150 ml.'],
];

await migrate();

const { n } = await db.get('SELECT COUNT(*) AS n FROM users');
if (n > 0) {
  console.log('The database already has users, so the seed was skipped.');
  console.log('To start over locally, stop the server and delete server/data/.');
  process.exit(0);
}

const hash = await hashPassword(DEMO_PASSWORD);
await tx(async t => {
  for (const [name, slug] of CATEGORIES) {
    await t.run('INSERT INTO categories (name, slug) VALUES (?, ?)', [name, slug]);
  }
  const catId = {};
  for (const r of await t.all('SELECT id, slug FROM categories')) catId[r.slug] = r.id;

  const sellerIds = [];
  for (const s of SELLERS) {
    const { lastId } = await t.run(
      'INSERT INTO users (email, password_hash, name, phone, store_name) VALUES (?, ?, ?, ?, ?)',
      [s.email, hash, s.name, s.phone, s.store]);
    sellerIds.push(lastId);
  }
  for (const b of BUYERS) {
    await t.run('INSERT INTO users (email, password_hash, name, phone) VALUES (?, ?, ?, ?)',
      [b.email, hash, b.name, b.phone]);
  }

  // Spread creation times over the last 42 hours so "newest" has a clear order.
  const now = Date.now();
  for (const [i, [seller, cat, title, price, stock, desc]] of PRODUCTS.entries()) {
    const at = new Date(now - (PRODUCTS.length - i) * 3600_000).toISOString();
    await t.run(
      `INSERT INTO products (seller_id, category_id, title, description, price_amd, stock, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sellerIds[seller], catId[cat], title, desc, price, stock, at, at]);
  }
});

// Placeholder photos: a colored card with the product title, made with sharp (no downloads).
const COLORS = {
  'electronics': ['#1d3557', '#457b9d'], 'home-kitchen': ['#8d5524', '#c68642'], 'clothing': ['#2a9d8f', '#8ab17d'],
  'books': ['#6d597a', '#b56576'], 'food-drinks': ['#e76f51', '#f4a261'], 'beauty': ['#d6336c', '#f783ac'],
  'sports': ['#2b9348', '#80b918'], 'handmade': ['#9c6644', '#ddb892'],
};
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function wrap(text, max = 16) {
  const lines = []; let line = '';
  for (const w of text.split(' ')) {
    if ((line + ' ' + w).trim().length > max && line) { lines.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  return [...lines, line].slice(0, 3);
}
function placeholderSvg(title, slug, variant) {
  const [a, b] = COLORS[slug];
  const lines = wrap(title);
  const y0 = 600 - (lines.length - 1) * 45;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${variant ? b : a}"/><stop offset="1" stop-color="${variant ? a : b}"/></linearGradient></defs>
    <rect width="1200" height="1200" fill="url(#g)"/>
    <circle cx="${variant ? 950 : 250}" cy="${variant ? 250 : 950}" r="180" fill="#ffffff" opacity="0.12"/>
    ${lines.map((l, i) => `<text x="600" y="${y0 + i * 90}" font-family="Helvetica, Arial, sans-serif" font-size="80"
      font-weight="700" fill="#ffffff" text-anchor="middle">${esc(l)}</text>`).join('')}
    <text x="600" y="1100" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#ffffff" opacity="0.8"
      text-anchor="middle">Shuka demo photo ${variant + 1}</text></svg>`);
}

const products = await db.all('SELECT p.id, p.title, c.slug FROM products p JOIN categories c ON c.id = p.category_id ORDER BY p.id');
for (const [i, p] of products.entries()) {
  const count = i % 7 === 0 ? 3 : 1;   // a few products get 3 photos, to show the gallery
  for (let pos = 0; pos < count; pos++) {
    const key = newImageKey(p.id);
    await storeImage(key, await processImage(await sharp(placeholderSvg(p.title, p.slug, pos)).png().toBuffer(), 'seed.png'));
    await db.run('INSERT INTO product_images (product_id, file_path, position) VALUES (?, ?, ?)', [p.id, key, pos]);
  }
}

console.log(`Seeded ${CATEGORIES.length} categories, ${SELLERS.length} sellers, ${BUYERS.length} buyers, ${PRODUCTS.length} products.`);
console.log(`All demo accounts use the password: ${DEMO_PASSWORD}`);

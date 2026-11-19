# Shuka

Amazon-style marketplace for Armenia. Course project.
Anyone can register, sell products and buy from several sellers in one cart. Payment is cash on delivery.

## Run locally (one command)

Needs Node.js 22 or newer.

```
npm run dev
```

The first run installs the packages and creates a local database with demo data.
Then open **http://localhost:5173**.

Demo accounts (password `shuka-demo` for all):

| Email | Role |
|---|---|
| ani@shuka.am, gor@shuka.am, lilit@shuka.am | sellers |
| buyer1@shuka.am, buyer2@shuka.am | buyers |

To start over with fresh demo data: stop the app, delete `server/data/`, run `npm run dev` again.

## Break-it tests

With the app running (`npm run dev`), open a second terminal:

```
cd server
npm run break-it
```

It runs every break-it test from the brief (last units, double click, price change, old orders, other people's data,
moves that aren't allowed, cancel returns stock, foreign keys, bad uploads) and prints PASS or FAIL for each.
Against the live site: `BASE_URL=https://your-site.netlify.app npm run break-it`.

## How it's built

- `client/`: React + Vite website
- `server/`: Node.js + Express REST API, SQLite database
  - `server/migrations/`: numbered SQL files, applied on start
  - `server/src/seed.js`: demo data (8 categories, 3 sellers, 42 products with photos, 2 buyers)
- Production: website on Netlify, API on Render, database on Turso (hosted SQLite), photos on Cloudinary

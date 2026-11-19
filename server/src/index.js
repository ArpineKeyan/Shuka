import express from 'express';
import cookieParser from 'cookie-parser';
import { migrate } from './migrate.js';
import { loadUser } from './auth.js';
import { errorHandler, notFound } from './errors.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';

await migrate();

const app = express();
app.set('trust proxy', 1);          // Render and Netlify sit in front of us
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(loadUser);

const api = express.Router();
api.get('/health', (_req, res) => res.json({ ok: true }));
api.use(authRouter);
api.use(catalogRouter);
api.use((_req, _res) => { throw notFound('No such endpoint.'); });

app.use('/api', api);
app.use(errorHandler);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Shuka API on http://localhost:${port}/api`));

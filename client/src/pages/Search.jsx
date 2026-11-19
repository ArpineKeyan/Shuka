import { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { Link, useRouter, useQuery } from '../router.jsx';
import { useLoad, PageState, ProductCard, Pagination } from '../components/ui.jsx';

const SORTS = [['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Rating']];

// All filters live in the URL, so a search can be shared.
export function Search() {
  const { navigate } = useRouter();
  const query = useQuery();
  const { q = '', category = '', minPrice = '', maxPrice = '', sort = 'newest', page = '1' } = query;
  const [cats, setCats] = useState([]);
  const [min, setMin] = useState(minPrice);
  const [max, setMax] = useState(maxPrice);
  useEffect(() => { api.get('/categories').then(r => setCats(r.categories)).catch(() => {}); }, []);
  useEffect(() => { setMin(minPrice); setMax(maxPrice); }, [minPrice, maxPrice]);

  const state = useLoad(() => api.get('/products' + qs({ q, category, minPrice, maxPrice, sort, page })),
    [q, category, minPrice, maxPrice, sort, page]);

  const go = changes => navigate('/search' + qs({ ...query, page: undefined, ...changes }));
  const catName = cats.find(c => c.slug === category)?.name;
  const title = q ? `Results for “${q}”` : catName || 'All products';

  return (
    <div className="search-page">
      <aside className="filters">
        <h2 className="h3">Filters</h2>
        <label className="field"><span className="field-label">Category</span>
          <select value={category} onChange={e => go({ category: e.target.value })}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <form onSubmit={e => { e.preventDefault(); go({ minPrice: min, maxPrice: max }); }}>
          <span className="field-label">Price, ֏</span>
          <div className="price-range">
            <input type="number" min="0" placeholder="From" value={min} onChange={e => setMin(e.target.value)} aria-label="Price from" />
            <input type="number" min="0" placeholder="To" value={max} onChange={e => setMax(e.target.value)} aria-label="Price to" />
          </div>
          <button className="btn btn-small btn-secondary" type="submit">Apply</button>
        </form>
      </aside>
      <section>
        <div className="section-head">
          <h1 className="h2">{title}</h1>
          <label className="sort">Sort:
            <select value={sort} onChange={e => go({ sort: e.target.value })}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <PageState state={state}>{d => d.total === 0 ? (
          <div className="empty">
            <p>No products match this search.</p>
            <Link to="/search" className="btn">Show all products</Link>
          </div>
        ) : (
          <>
            <p className="muted">{d.total} {d.total === 1 ? 'product' : 'products'}</p>
            <div className="grid">{d.items.map(p => <ProductCard key={p.id} p={p} />)}</div>
            <Pagination page={d.page} pages={d.pages} hrefFor={n => '/search' + qs({ ...query, page: n })} />
          </>
        )}</PageState>
      </section>
    </div>
  );
}

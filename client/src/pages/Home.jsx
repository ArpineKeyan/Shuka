import { api } from '../api.js';
import { Link } from '../router.jsx';
import { useLoad, PageState, ProductCard } from '../components/ui.jsx';

export function Home() {
  const state = useLoad(async () => {
    const [c, p] = await Promise.all([api.get('/categories'), api.get('/products?sort=newest')]);
    return { categories: c.categories, products: p.items.slice(0, 12) };
  }, []);
  return (
    <PageState state={state}>{d => (
      <>
        <section className="hero">
          <h1>Buy from local sellers across Armenia</h1>
          <p>Pay in cash when your order arrives.</p>
        </section>
        <h2>Categories</h2>
        <div className="cat-grid">
          {d.categories.map(c => <Link key={c.slug} to={`/search?category=${c.slug}`} className="cat-tile">{c.name}</Link>)}
        </div>
        <div className="section-head">
          <h2>New arrivals</h2>
          <Link to="/search">See all products →</Link>
        </div>
        <div className="grid">{d.products.map(p => <ProductCard key={p.id} p={p} />)}</div>
      </>
    )}</PageState>
  );
}

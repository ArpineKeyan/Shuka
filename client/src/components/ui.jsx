import { useEffect, useState, useCallback } from 'react';
import { Link } from '../router.jsx';
import { amd, STATUS_LABEL } from '../format.js';

// Loads data for a page. Returns { data, error, loading, reload }.
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true, error: null }));
    fn().then(data => alive && setState({ data, error: null, loading: false }))
        .catch(error => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

export function Loading() { return <p className="muted">Loading…</p>; }

export function ErrorBox({ error, children }) {
  if (!error) return null;
  return <div className="alert alert-error" role="alert">{error.message || String(error)}{children}</div>;
}

export function PageState({ state, children }) {
  if (state.loading && !state.data) return <Loading />;
  if (state.error) {
    if (state.error.status === 404) return <NotFound />;
    return <ErrorBox error={state.error} />;
  }
  return children(state.data);
}

export function NotFound() {
  return (
    <div className="empty">
      <h1>Not found</h1>
      <p>This page doesn’t exist, or you don’t have access to it.</p>
      <Link to="/" className="btn">Go to the home page</Link>
    </div>
  );
}

export function Stars({ value, count }) {
  const full = Math.round(value);
  return (
    <span className="stars" title={count ? `${value} out of 5` : 'No reviews yet'}>
      <span aria-hidden="true">{'★'.repeat(full)}<span className="stars-off">{'★'.repeat(5 - full)}</span></span>
      {count !== undefined && <span className="muted small"> {count ? `${value.toFixed(1)} (${count})` : 'No reviews'}</span>}
    </span>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function ProductCard({ p }) {
  return (
    <Link to={`/p/${p.id}`} className="card">
      <div className="card-img">{p.image ? <img src={p.image.thumb} alt="" loading="lazy" /> : <div className="noimg">No photo</div>}</div>
      <div className="card-body">
        <div className="card-title">{p.title}</div>
        <div className="price">{amd(p.priceAmd)}</div>
        <Stars value={p.ratingAvg} count={p.ratingCount} />
        {p.stock === 0 && <div className="small danger">Out of stock</div>}
      </div>
    </Link>
  );
}

export function Field({ label, error, hint, children }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function Pagination({ page, pages, hrefFor }) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pages">
      {page > 1 && <Link to={hrefFor(page - 1)}>← Previous</Link>}
      <span className="muted">Page {page} of {pages}</span>
      {page < pages && <Link to={hrefFor(page + 1)}>Next →</Link>}
    </nav>
  );
}

// Quantity box that can't go below 1 or above max.
export function Qty({ value, max, onChange, disabled }) {
  const set = v => onChange(Math.max(1, Math.min(max, v)));
  return (
    <span className="qty">
      <button type="button" onClick={() => set(value - 1)} disabled={disabled || value <= 1} aria-label="Less">−</button>
      <input type="number" min="1" max={max} value={value} disabled={disabled}
             onChange={e => set(Number(e.target.value) || 1)} aria-label="Quantity" />
      <button type="button" onClick={() => set(value + 1)} disabled={disabled || value >= max} aria-label="More">+</button>
    </span>
  );
}

export const Money = ({ v }) => <span className="nowrap">{amd(v)}</span>;

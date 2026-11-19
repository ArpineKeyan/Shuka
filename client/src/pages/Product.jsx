import { useState } from 'react';
import { api } from '../api.js';
import { Link, useRouter } from '../router.jsx';
import { useSession } from '../session.jsx';
import { amd, date, stockText } from '../format.js';
import { useLoad, PageState, Stars, Qty, ErrorBox } from '../components/ui.jsx';

export function Product({ id }) {
  const { user, refreshCart } = useSession();
  const { navigate, path } = useRouter();
  const state = useLoad(async () => {
    const [p, r] = await Promise.all([api.get(`/products/${id}`), api.get(`/products/${id}/reviews`).catch(() => ({ reviews: [] }))]);
    return { product: p.product, reviews: r.reviews };
  }, [id]);
  const [img, setImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  return (
    <PageState state={state}>{({ product: p, reviews }) => {
      const own = user && user.id === p.seller.id;
      const main = p.images[img] || p.images[0];
      const add = async () => {
        if (!user) return navigate(`/login?next=${encodeURIComponent(path)}`);
        setBusy(true); setError(null); setMsg(null);
        try {
          // The cart stores the total quantity for a product, so add to what is already there.
          const cart = await api.get('/cart');
          const already = cart.groups.flatMap(g => g.items).find(i => i.productId === p.id)?.quantity || 0;
          await api.put(`/cart/items/${p.id}`, { quantity: already + qty });
          await refreshCart();
          setMsg('Added to your cart.');
        } catch (e) { setError(e); } finally { setBusy(false); }
      };
      return (
        <>
          <div className="product">
            <div className="gallery">
              <div className="gallery-main">{main ? <img src={main.large} alt={p.title} /> : <div className="noimg">No photo</div>}</div>
              {p.images.length > 1 && (
                <div className="thumbs">
                  {p.images.map((im, i) => (
                    <button key={im.id} type="button" className={i === img ? 'active' : ''} onClick={() => setImg(i)} aria-label={`Photo ${i + 1}`}>
                      <img src={im.thumb} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="product-info">
              <h1>{p.title}</h1>
              <Stars value={p.ratingAvg} count={p.ratingCount} />
              <div className="price big">{amd(p.priceAmd)}</div>
              <div className={p.stock === 0 ? 'danger' : p.stock <= 5 ? 'warn' : 'ok'}>{stockText(p.stock)}</div>
              <p className="muted">Sold by <strong>{p.seller.storeName}</strong> · <Link to={`/search?category=${p.category.slug}`}>{p.category.name}</Link></p>
              {!p.isPublished && <div className="alert">This product is not published. Only you can see it.</div>}
              {own ? (
                <div className="alert">This is your product. <Link to={`/seller/products/${p.id}`}>Edit it</Link></div>
              ) : p.stock > 0 && p.isPublished ? (
                <div className="buy">
                  <Qty value={qty} max={p.stock} onChange={setQty} disabled={busy} />
                  <button className="btn" onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add to cart'}</button>
                </div>
              ) : null}
              {msg && <div className="alert alert-ok">{msg} <Link to="/cart">Go to cart</Link></div>}
              <ErrorBox error={error} />
              <h2 className="h3">Description</h2>
              <p className="pre">{p.description}</p>
            </div>
          </div>
          <section className="reviews">
            <h2>Reviews</h2>
            {reviews.length === 0 ? <p className="muted">No reviews yet.</p> : reviews.map(r => (
              <div key={r.id} className="review">
                <Stars value={r.rating} /> <strong>{r.buyerName}</strong> <span className="muted small">{date(r.createdAt)}</span>
                {r.body && <p className="pre">{r.body}</p>}
              </div>
            ))}
          </section>
        </>
      );
    }}</PageState>
  );
}

import { useState } from 'react';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { useSession } from '../session.jsx';
import { amd } from '../format.js';
import { useLoad, PageState, Qty, ErrorBox, Money } from '../components/ui.jsx';

function Warning({ item }) {
  switch (item.warning) {
    case 'price_changed':
      return <div className="alert small">The price changed from {amd(item.priceWhenAddedAmd)} to {amd(item.unitPriceAmd)} since you added it.</div>;
    case 'sold_out': return <div className="alert alert-error small">Sold out. Remove it to continue.</div>;
    case 'not_enough_stock': return <div className="alert alert-error small">Only {item.stock} left. Lower the quantity to continue.</div>;
    case 'unavailable': return <div className="alert alert-error small">No longer for sale. Remove it to continue.</div>;
    default: return null;
  }
}

export function Cart() {
  const { setCartCount } = useSession();
  const state = useLoad(() => api.get('/cart'), []);
  const [cart, setCart] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const data = cart || state.data;

  const update = async fn => {
    setBusy(true); setError(null);
    try { const c = await fn(); setCart(c); setCartCount(c.itemCount); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  const setQty = (id, quantity) => update(() => api.put(`/cart/items/${id}`, { quantity }));
  const remove = id => update(() => api.del(`/cart/items/${id}`));

  return (
    <PageState state={{ ...state, data }}>{c => (
      <>
        <h1>Your cart</h1>
        {c.groups.length === 0 ? (
          <div className="empty"><p>Your cart is empty.</p><Link to="/search" className="btn">Browse products</Link></div>
        ) : (
          <div className="cart-layout">
            <div>
              <ErrorBox error={error} />
              {c.groups.map(g => (
                <section key={g.seller.id} className="panel">
                  <h2 className="h3">Sold by {g.seller.storeName}</h2>
                  {g.items.map(i => (
                    <div key={i.productId} className="cart-line">
                      <Link to={`/p/${i.productId}`} className="cart-thumb">{i.image ? <img src={i.image.thumb} alt="" /> : null}</Link>
                      <div className="cart-main">
                        <Link to={`/p/${i.productId}`}>{i.title}</Link>
                        <div className="muted small">{amd(i.unitPriceAmd)} each</div>
                        <Warning item={i} />
                        <div className="cart-controls">
                          {i.stock > 0 && i.warning !== 'unavailable' &&
                            <Qty value={Math.min(i.quantity, i.stock)} max={i.stock} disabled={busy} onChange={v => setQty(i.productId, v)} />}
                          <button className="link-btn" onClick={() => remove(i.productId)} disabled={busy}>Remove</button>
                        </div>
                      </div>
                      <div className="cart-total"><Money v={i.lineTotalAmd} /></div>
                    </div>
                  ))}
                  <div className="subtotal">Subtotal: <strong><Money v={g.subtotalAmd} /></strong></div>
                </section>
              ))}
            </div>
            <aside className="panel summary">
              <div className="row"><span>Total</span><strong className="price"><Money v={c.totalAmd} /></strong></div>
              <p className="muted small">Payment: cash on delivery</p>
              {c.canCheckout
                ? <Link to="/checkout" className="btn btn-block">Proceed to checkout</Link>
                : <button className="btn btn-block" disabled>Fix the items marked in red</button>}
            </aside>
          </div>
        )}
      </>
    )}</PageState>
  );
}

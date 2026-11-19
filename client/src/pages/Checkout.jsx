import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Link, useRouter } from '../router.jsx';
import { useSession } from '../session.jsx';
import { amd } from '../format.js';
import { Field, Loading, ErrorBox, Money } from '../components/ui.jsx';

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));

export function Checkout() {
  const { user, refreshCart } = useSession();
  const { navigate } = useRouter();
  const [cart, setCart] = useState(null);
  const [regions, setRegions] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const key = useRef(newKey());   // one key per checkout: a double click sends the same key

  const loadCart = async () => {
    const c = await api.get('/cart');
    setCart(c);
    return c;
  };

  useEffect(() => {
    Promise.all([loadCart(), api.get('/regions')]).then(([c, r]) => {
      setRegions(r.regions);
      const a = c.lastAddress;   // last address is filled in again
      setForm({
        recipient: a?.recipient || user.name, phone: a?.phone || user.phone, region: a?.region || 'Yerevan',
        city: a?.city || '', street: a?.street || '', apartment: a?.apartment || '', note: '',
      });
    }).catch(setError);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error && !cart) return <ErrorBox error={error} />;
  if (!cart || !form) return <Loading />;
  if (cart.groups.length === 0) return <div className="empty"><p>Your cart is empty.</p><Link to="/" className="btn">Go shopping</Link></div>;

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const fe = error?.fields || {};

  const submit = async e => {
    e.preventDefault();
    if (sending) return;
    setSending(true); setError(null);
    try {
      const r = await api.post('/orders', { ...form, requestKey: key.current });
      await refreshCart();
      navigate(`/orders/${r.order.id}/placed`, { replace: true });
    } catch (err) {
      setError(err);
      if (err.code === 'price_changed' || err.code === 'out_of_stock') await loadCart().catch(() => {});
      if (err.code !== 'invalid_input') key.current = newKey();
      setSending(false);
    }
  };

  return (
    <form className="checkout" onSubmit={submit} noValidate>
      <div>
        <h1>Checkout</h1>
        <section className="panel">
          <h2 className="h3">Delivery address</h2>
          <div className="form-grid">
            <Field label="Recipient name" error={fe.recipient}><input value={form.recipient} onChange={set('recipient')} autoComplete="name" /></Field>
            <Field label="Phone" error={fe.phone} hint="e.g. +374 91 123456"><input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" /></Field>
            <Field label="Region" error={fe.region}>
              <select value={form.region} onChange={set('region')}>{regions.map(r => <option key={r}>{r}</option>)}</select>
            </Field>
            <Field label="City or village" error={fe.city}><input value={form.city} onChange={set('city')} /></Field>
            <Field label="Street and building" error={fe.street}><input value={form.street} onChange={set('street')} autoComplete="street-address" /></Field>
            <Field label="Apartment" error={fe.apartment}><input value={form.apartment} onChange={set('apartment')} /></Field>
          </div>
          <Field label="Note for delivery (optional)" error={fe.note}><textarea rows="2" value={form.note} onChange={set('note')} /></Field>
        </section>
      </div>
      <aside className="panel summary">
        <h2 className="h3">Your order</h2>
        {cart.groups.map(g => (
          <div key={g.seller.id} className="summary-group">
            <div className="muted small">From {g.seller.storeName}</div>
            {g.items.map(i => (
              <div key={i.productId} className="row small"><span>{i.title} × {i.quantity}</span><Money v={i.lineTotalAmd} /></div>
            ))}
          </div>
        ))}
        <div className="row total"><span>Total</span><strong className="price"><Money v={cart.totalAmd} /></strong></div>
        <p><strong>Payment: cash on delivery</strong></p>
        {error && error.code !== 'invalid_input' && (
          <div className="alert alert-error" role="alert">
            {error.message}
            {error.code === 'price_changed' && (
              <ul>{error.details.changes.map(c => <li key={c.productId}>{c.title}: {amd(c.oldPriceAmd)} → {amd(c.newPriceAmd)}</li>)}</ul>
            )}
            {(error.code === 'out_of_stock' || error.code === 'unavailable') && <div><Link to="/cart">Back to cart</Link></div>}
          </div>
        )}
        {error?.code === 'invalid_input' && <div className="alert alert-error" role="alert">{error.message}</div>}
        <button className="btn btn-block" type="submit" disabled={sending || !cart.canCheckout}>
          {sending ? 'Placing order…' : 'Place order'}
        </button>
      </aside>
    </form>
  );
}

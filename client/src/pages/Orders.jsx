import { useState } from 'react';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { amd, date, dateTime } from '../format.js';
import { useLoad, PageState, StatusBadge, Money, ErrorBox, Field } from '../components/ui.jsx';

export function OrderPlaced({ id }) {
  return (
    <div className="empty">
      <h1>Thank you! Your order is placed.</h1>
      <p className="big">Order number <strong>#{id}</strong></p>
      <p>The sellers will confirm it and bring it to you. You pay in cash on delivery.</p>
      <Link to={`/orders/${id}`} className="btn">See your order</Link>
    </div>
  );
}

export function MyOrders() {
  const state = useLoad(() => api.get('/orders'), []);
  return (
    <PageState state={state}>{({ orders }) => (
      <>
        <h1>My orders</h1>
        {orders.length === 0 ? <div className="empty"><p>You have no orders yet.</p><Link to="/" className="btn">Start shopping</Link></div> : (
          <div className="list">
            {orders.map(o => (
              <Link key={o.id} to={`/orders/${o.id}`} className="list-row">
                <div><strong>Order #{o.id}</strong><div className="muted small">{date(o.createdAt)}</div></div>
                <div className="statuses">{o.sellers.map(s => <span key={s.sellerOrderId} className="small">{s.storeName}: <StatusBadge status={s.status} /></span>)}</div>
                <strong><Money v={o.totalAmd} /></strong>
              </Link>
            ))}
          </div>
        )}
      </>
    )}</PageState>
  );
}

function ReviewForm({ productId, onDone }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.post(`/products/${productId}/reviews`, { rating, body }); onDone(); }
    catch (err) { setError(err); setBusy(false); }
  };
  return (
    <form className="review-form" onSubmit={submit}>
      <div className="star-input" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} stars`}
                  className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      <Field label="Your review (optional)" error={error?.fields?.body}><textarea rows="2" value={body} onChange={e => setBody(e.target.value)} /></Field>
      {error && <div className="field-error">{error.fields?.rating || error.message}</div>}
      <button className="btn btn-small" disabled={busy || rating === 0}>Send review</button>
    </form>
  );
}

export function OrderDetail({ id }) {
  const state = useLoad(() => api.get(`/orders/${id}`), [id]);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [reviewing, setReviewing] = useState(null);

  const cancel = async soId => {
    setError(null);
    try { await api.post(`/orders/${id}/sellers/${soId}/cancel`); setConfirming(null); state.reload(); }
    catch (e) { setError(e); setConfirming(null); state.reload(); }
  };

  return (
    <PageState state={state}>{({ order: o }) => (
      <>
        <p><Link to="/orders">← My orders</Link></p>
        <h1>Order #{o.id}</h1>
        <p className="muted">Placed {dateTime(o.createdAt)} · Total <strong><Money v={o.totalAmd} /></strong> · Cash on delivery</p>
        <ErrorBox error={error} />
        <section className="panel">
          <h2 className="h3">Delivery address</h2>
          <p>{o.address.recipient}, {o.address.phone}<br />
            {o.address.street}{o.address.apartment && `, apt ${o.address.apartment}`}, {o.address.city}, {o.address.region}
            {o.address.note && <><br /><span className="muted">Note: {o.address.note}</span></>}</p>
        </section>
        {o.sellers.map(s => (
          <section key={s.sellerOrderId} className="panel">
            <div className="section-head">
              <h2 className="h3">From {s.storeName}</h2>
              <StatusBadge status={s.status} />
            </div>
            {s.items.map(i => (
              <div key={i.productId} className="order-item">
                <div className="row">
                  <span><Link to={`/p/${i.productId}`}>{i.title}</Link> × {i.quantity} <span className="muted small">({amd(i.unitPriceAmd)} each)</span></span>
                  <Money v={i.lineTotalAmd} />
                </div>
                {i.canReview && (reviewing === i.productId
                  ? <ReviewForm productId={i.productId} onDone={() => { setReviewing(null); state.reload(); }} />
                  : <button className="btn btn-small btn-secondary" onClick={() => setReviewing(i.productId)}>Write a review</button>)}
              </div>
            ))}
            <div className="subtotal">Subtotal: <strong><Money v={s.subtotalAmd} /></strong></div>
            <h3 className="h4">Status history</h3>
            <ol className="history">
              {s.history.map((h, n) => <li key={n}><StatusBadge status={h.to} /> <span className="muted small">{dateTime(h.at)}</span></li>)}
            </ol>
            {s.canCancel && (confirming === s.sellerOrderId ? (
              <div className="confirm">
                Cancel this part of the order?
                <button className="btn btn-small btn-danger" onClick={() => cancel(s.sellerOrderId)}>Yes, cancel</button>
                <button className="btn btn-small btn-secondary" onClick={() => setConfirming(null)}>No</button>
              </div>
            ) : <button className="btn btn-small btn-secondary" onClick={() => setConfirming(s.sellerOrderId)}>Cancel</button>)}
          </section>
        ))}
      </>
    )}</PageState>
  );
}


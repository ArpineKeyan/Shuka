import { useState } from 'react';
import { api, qs } from '../../api.js';
import { Link, useRouter, useQuery } from '../../router.jsx';
import { amd, dateTime, STATUS_LABEL } from '../../format.js';
import { useLoad, PageState, StatusBadge, Money, ErrorBox } from '../../components/ui.jsx';

export function SellerNav() {
  const { path } = useRouter();
  const tab = (to, label, exact) => {
    const active = exact ? path === to : path.startsWith(to);
    return <Link to={to} className={active ? 'active' : ''}>{label}</Link>;
  };
  return (
    <nav className="tabs seller-nav" aria-label="Seller dashboard">
      {tab('/seller', 'Overview', true)}{tab('/seller/products', 'Products')}{tab('/seller/orders', 'Orders')}
    </nav>
  );
}

export function SellerOverview() {
  const state = useLoad(() => api.get('/seller/overview'), []);
  return (
    <>
      <h1>Seller dashboard</h1>
      <SellerNav />
      <PageState state={state}>{o => (
        <>
          <div className="stats">
            <Link to="/seller/orders?status=placed" className="stat"><span className="stat-num">{o.toConfirm}</span>orders to confirm</Link>
            <Link to="/seller/orders?status=confirmed" className="stat"><span className="stat-num">{o.toShip}</span>orders to ship</Link>
            <div className="stat"><span className="stat-num">{amd(o.revenueLast30DaysAmd)}</span>revenue from delivered orders, last 30 days</div>
          </div>
          <h2 className="h3">Orders by status</h2>
          <div className="status-counts">
            {Object.entries(o.ordersByStatus).map(([s, n]) => (
              <Link key={s} to={`/seller/orders?status=${s}`}><StatusBadge status={s} /> {n}</Link>
            ))}
          </div>
          <p><Link to="/seller/products/new" className="btn">Add a product</Link></p>
        </>
      )}</PageState>
    </>
  );
}

export function SellerProducts() {
  const state = useLoad(() => api.get('/seller/products'), []);
  const [error, setError] = useState(null);
  const toggle = async p => {
    setError(null);
    try { await api.patch(`/seller/products/${p.id}`, { isPublished: !p.isPublished }); state.reload(); }
    catch (e) { setError(e); }
  };
  return (
    <>
      <div className="section-head"><h1>Seller dashboard</h1><Link to="/seller/products/new" className="btn">Add a product</Link></div>
      <SellerNav />
      <ErrorBox error={error} />
      <PageState state={state}>{({ products }) => products.length === 0 ? (
        <div className="empty"><p>You have no products yet.</p><Link to="/seller/products/new" className="btn">Add your first product</Link></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th></th><th>Title</th><th>Price</th><th>Stock</th><th>Status</th><th>Sold</th><th></th></tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>{p.image ? <img className="mini" src={p.image.thumb} alt="" /> : <div className="mini noimg" />}</td>
                  <td><Link to={`/p/${p.id}`}>{p.title}</Link></td>
                  <td className="nowrap">{amd(p.priceAmd)}</td>
                  <td className={p.stock === 0 ? 'danger' : ''}>{p.stock}</td>
                  <td>{p.isPublished ? <span className="badge badge-delivered">Published</span> : <span className="badge">Hidden</span>}</td>
                  <td>{p.unitsSold}</td>
                  <td className="nowrap">
                    <Link to={`/seller/products/${p.id}`} className="btn btn-small btn-secondary">Edit</Link>{' '}
                    <button className="btn btn-small btn-secondary" onClick={() => toggle(p)}>{p.isPublished ? 'Unpublish' : 'Publish'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}</PageState>
    </>
  );
}

const STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export function SellerOrders() {
  const { status = '' } = useQuery();
  const state = useLoad(() => api.get('/seller/orders' + qs({ status })), [status]);
  return (
    <>
      <h1>Seller dashboard</h1>
      <SellerNav />
      <PageState state={state}>{({ counts, orders }) => (
        <>
          <nav className="tabs small-tabs" aria-label="Order status">
            <Link to="/seller/orders" className={!status ? 'active' : ''}>All ({Object.values(counts).reduce((a, b) => a + b, 0)})</Link>
            {STATUSES.map(s => <Link key={s} to={`/seller/orders?status=${s}`} className={status === s ? 'active' : ''}>{STATUS_LABEL[s]} ({counts[s]})</Link>)}
          </nav>
          {orders.length === 0 ? <p className="muted">No orders here.</p> : (
            <div className="list">
              {orders.map(o => (
                <Link key={o.id} to={`/seller/orders/${o.id}`} className="list-row">
                  <div><strong>Order #{o.orderNumber}</strong><div className="muted small">{dateTime(o.createdAt)}</div></div>
                  <div className="small">{o.recipient}, {o.city}<div className="muted">{o.units} {o.units === 1 ? 'item' : 'items'}</div></div>
                  <StatusBadge status={o.status} />
                  <strong><Money v={o.subtotalAmd} /></strong>
                </Link>
              ))}
            </div>
          )}
        </>
      )}</PageState>
    </>
  );
}

const MOVE_LABEL = { confirmed: 'Confirm order', shipped: 'Mark as shipped', delivered: 'Mark as delivered', cancelled: 'Cancel order' };

export function SellerOrderDetail({ id }) {
  const state = useLoad(() => api.get(`/seller/orders/${id}`), [id]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const move = async to => {
    if (to === 'cancelled' && !window.confirm('Cancel this order? The stock will go back.')) return;
    setBusy(true); setError(null);
    try { await api.post(`/seller/orders/${id}/status`, { to }); state.reload(); }
    catch (e) { setError(e); state.reload(); } finally { setBusy(false); }
  };
  return (
    <>
      <p><Link to="/seller/orders">← Orders</Link></p>
      <PageState state={state}>{({ order: o }) => (
        <>
          <div className="section-head"><h1>Order #{o.orderNumber}</h1><StatusBadge status={o.status} /></div>
          <p className="muted">Ordered {dateTime(o.orderedAt)}</p>
          <ErrorBox error={error} />
          <div className="two-col">
            <section className="panel">
              <h2 className="h3">Deliver to</h2>
              <p className="big">{o.delivery.recipient}</p>
              <p><a href={`tel:${o.delivery.phone}`}>{o.delivery.phone}</a></p>
              <p>{o.delivery.street}{o.delivery.apartment && `, apt ${o.delivery.apartment}`}<br />{o.delivery.city}, {o.delivery.region}</p>
              {o.delivery.note && <p className="alert">Note: {o.delivery.note}</p>}
            </section>
            <section className="panel">
              <h2 className="h3">Items</h2>
              {o.items.map(i => (
                <div key={i.productId} className="row"><span>{i.title} × {i.quantity} <span className="muted small">({amd(i.unitPriceAmd)} each)</span></span><Money v={i.lineTotalAmd} /></div>
              ))}
              <div className="row total"><span>Cash to collect</span><strong className="price"><Money v={o.cashToCollectAmd} /></strong></div>
            </section>
          </div>
          {o.allowedMoves.length > 0 && (
            <div className="actions">
              {o.allowedMoves.map(to => (
                <button key={to} className={`btn ${to === 'cancelled' ? 'btn-danger' : ''}`} disabled={busy} onClick={() => move(to)}>{MOVE_LABEL[to]}</button>
              ))}
            </div>
          )}
          <h2 className="h3">Status history</h2>
          <ol className="history">
            {o.history.map((h, n) => <li key={n}><StatusBadge status={h.to} /> <span className="muted small">{dateTime(h.at)}</span></li>)}
          </ol>
        </>
      )}</PageState>
    </>
  );
}

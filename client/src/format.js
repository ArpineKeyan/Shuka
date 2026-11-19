const n = new Intl.NumberFormat('en-US');
export const amd = v => `${n.format(v)} ֏`;
export const date = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const dateTime = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const STATUS_LABEL = { placed: 'Placed', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
export const stockText = s => (s === 0 ? 'Out of stock' : s <= 5 ? `Only ${s} left` : 'In stock');

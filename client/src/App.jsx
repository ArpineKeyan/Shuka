import { RouterProvider, useRouter, match, Link } from './router.jsx';
import { SessionProvider, useSession } from './session.jsx';
import { Header } from './components/Header.jsx';
import { Loading, NotFound } from './components/ui.jsx';
import { Home } from './pages/Home.jsx';
import { Search } from './pages/Search.jsx';
import { Product } from './pages/Product.jsx';
import { Cart } from './pages/Cart.jsx';
import { Checkout } from './pages/Checkout.jsx';
import { MyOrders, OrderDetail, OrderPlaced } from './pages/Orders.jsx';
import { Login, Register, Account, BecomeSeller } from './pages/Auth.jsx';
import { SellerOverview, SellerProducts, SellerOrders, SellerOrderDetail } from './pages/seller/Seller.jsx';
import { ProductEditor } from './pages/seller/ProductEditor.jsx';

// [path, page, who can open it]. The server checks permissions again on every request;
// this only decides which page to show.
const ROUTES = [
  ['/', Home], ['/search', Search], ['/p/:id', Product],
  ['/login', Login], ['/register', Register],
  ['/cart', Cart, 'user'], ['/checkout', Checkout, 'user'],
  ['/orders', MyOrders, 'user'], ['/orders/:id', OrderDetail, 'user'], ['/orders/:id/placed', OrderPlaced, 'user'],
  ['/account', Account, 'user'], ['/sell', BecomeSeller, 'user'],
  ['/seller', SellerOverview, 'seller'], ['/seller/products', SellerProducts, 'seller'],
  ['/seller/products/new', ProductEditor, 'seller'], ['/seller/products/:id', ProductEditor, 'seller'],
  ['/seller/orders', SellerOrders, 'seller'], ['/seller/orders/:id', SellerOrderDetail, 'seller'],
];

function Page() {
  const { path, search, navigate } = useRouter();
  const { user } = useSession();
  for (const [pattern, Component, need] of ROUTES) {
    const params = match(pattern, path);
    if (!params) continue;
    if (need && user === undefined) return <Loading />;
    if (need && !user) {
      queueMicrotask(() => navigate(`/login?next=${encodeURIComponent(path + search)}`, { replace: true }));
      return <Loading />;
    }
    if (need === 'seller' && !user.isSeller) {
      return <div className="empty"><p>Become a seller to open the dashboard.</p><Link to="/sell" className="btn">Sell on Shuka</Link></div>;
    }
    return <Component key={path} {...params} />;
  }
  return <NotFound />;
}

export function App() {
  return (
    <RouterProvider>
      <SessionProvider>
        <Header />
        <main className="wrap main"><Page /></main>
        <footer className="footer wrap muted small">Shuka · Delivery inside Armenia · Cash on delivery</footer>
      </SessionProvider>
    </RouterProvider>
  );
}

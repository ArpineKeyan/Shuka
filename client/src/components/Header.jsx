import { useEffect, useState } from 'react';
import { Link, useRouter, useQuery } from '../router.jsx';
import { useSession } from '../session.jsx';
import { api } from '../api.js';

export function Header() {
  const { user, logout, cartCount } = useSession();
  const { navigate, path } = useRouter();
  const query = useQuery();
  const [q, setQ] = useState(query.q || '');
  const [cats, setCats] = useState([]);
  const [menu, setMenu] = useState(false);

  useEffect(() => { api.get('/categories').then(r => setCats(r.categories)).catch(() => {}); }, []);
  useEffect(() => { if (path === '/search') setQ(query.q || ''); }, [path, query.q]);
  useEffect(() => setMenu(false), [path]);

  const submit = e => {
    e.preventDefault();
    navigate('/search' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : ''));
  };
  const doLogout = async () => { await logout(); navigate('/'); };

  return (
    <header className="header">
      <div className="header-row wrap">
        <Link to="/" className="logo">Shuka</Link>
        <form className="search" onSubmit={submit} role="search">
          <input type="search" placeholder="Search products" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
          <button type="submit">Search</button>
        </form>
        <div className="header-actions">
          <Link to="/cart" className="cart-link" aria-label={`Cart, ${cartCount} items`}>
            <span aria-hidden="true">🛒</span><span className="cart-label">Cart</span>
            {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
          </Link>
          {user === undefined ? null : user ? (
            <div className="account">
              <button type="button" className="account-btn" onClick={() => setMenu(m => !m)} aria-expanded={menu}>
                {user.name.split(' ')[0]} ▾
              </button>
              {menu && (
                <div className="menu" role="menu">
                  <Link to="/orders">My orders</Link>
                  {user.isSeller ? <Link to="/seller">Seller dashboard</Link> : <Link to="/sell">Sell on Shuka</Link>}
                  <Link to="/account">Account</Link>
                  <button type="button" onClick={doLogout}>Log out</button>
                </div>
              )}
            </div>
          ) : (
            <Link to={`/login?next=${encodeURIComponent(path)}`} className="btn btn-small">Log in</Link>
          )}
        </div>
      </div>
      <nav className="cats wrap" aria-label="Categories">
        {cats.map(c => <Link key={c.slug} to={`/search?category=${c.slug}`}>{c.name}</Link>)}
      </nav>
    </header>
  );
}

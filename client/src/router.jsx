// A very small router: enough for this app, no extra package needed.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const Ctx = createContext(null);
const current = () => ({ path: window.location.pathname, search: window.location.search });

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(current);
  useEffect(() => {
    const onPop = () => setLoc(current());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
    setLoc(current());
    if (!replace) window.scrollTo(0, 0);
  }, []);
  return <Ctx.Provider value={{ ...loc, navigate }}>{children}</Ctx.Provider>;
}

export const useRouter = () => useContext(Ctx);
export const useQuery = () => Object.fromEntries(new URLSearchParams(useRouter().search));

export function Link({ to, children, ...rest }) {
  const { navigate } = useRouter();
  const onClick = e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    rest.onNavigate?.();
    navigate(to);
  };
  const { onNavigate, ...props } = rest;
  return <a href={to} onClick={onClick} {...props}>{children}</a>;
}

// "/orders/:id" matches "/orders/12" -> { id: "12" }
export function match(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

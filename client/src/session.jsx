// Who is signed in, and how many items are in the cart (for the header icon).
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined);   // undefined = still loading, null = signed out
  const [cartCount, setCartCount] = useState(0);

  const refreshCart = useCallback(async () => {
    try { setCartCount((await api.get('/cart')).itemCount); } catch { setCartCount(0); }
  }, []);

  useEffect(() => {
    api.get('/me').then(r => setUser(r.user)).catch(() => setUser(null));
  }, []);
  useEffect(() => { if (user) refreshCart(); else setCartCount(0); }, [user, refreshCart]);

  const logout = async () => { await api.post('/auth/logout'); setUser(null); };
  return (
    <Ctx.Provider value={{ user, setUser, logout, cartCount, setCartCount, refreshCart }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);

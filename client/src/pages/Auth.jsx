import { useState } from 'react';
import { api } from '../api.js';
import { Link, useRouter, useQuery } from '../router.jsx';
import { useSession } from '../session.jsx';
import { Field } from '../components/ui.jsx';

// Only allow going back to a page on this site after logging in.
const safeNext = n => (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') && !n.startsWith('/register') ? n : '/');

function useForm(initial) {
  const [form, setForm] = useState(initial);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  return [form, set];
}

export function Login() {
  const { setUser } = useSession();
  const { navigate } = useRouter();
  const { next } = useQuery();
  const [form, set] = useForm({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await api.post('/auth/login', form);
      setUser(r.user);
      navigate(safeNext(next), { replace: true });
    } catch (err) {
      setError(err.status === 401 ? { message: 'Wrong email or password.' } : err);
      setBusy(false);
    }
  };
  return (
    <form className="auth panel" onSubmit={submit}>
      <h1>Log in</h1>
      <Field label="Email"><input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></Field>
      <Field label="Password"><input type="password" value={form.password} onChange={set('password')} autoComplete="current-password" required /></Field>
      {error && <div className="alert alert-error" role="alert">{error.message}</div>}
      <button className="btn btn-block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      <p className="muted">New to Shuka? <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></p>
    </form>
  );
}

export function Register() {
  const { setUser } = useSession();
  const { navigate } = useRouter();
  const { next } = useQuery();
  const [form, set] = useForm({ email: '', password: '', name: '', phone: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fe = error?.fields || {};
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await api.post('/auth/register', form);
      setUser(r.user);
      navigate(safeNext(next), { replace: true });
    } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <form className="auth panel" onSubmit={submit} noValidate>
      <h1>Create an account</h1>
      <Field label="Email" error={fe.email || (error?.code === 'email_taken' && error.message)}>
        <input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
      </Field>
      <Field label="Password" error={fe.password} hint="At least 8 characters">
        <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
      </Field>
      <Field label="Name" error={fe.name}><input value={form.name} onChange={set('name')} autoComplete="name" /></Field>
      <Field label="Phone" error={fe.phone} hint="e.g. +374 91 123456"><input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" /></Field>
      {error && !Object.keys(fe).length && error.code !== 'email_taken' && <div className="alert alert-error" role="alert">{error.message}</div>}
      <button className="btn btn-block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      <p className="muted">Already have an account? <Link to="/login">Log in</Link></p>
    </form>
  );
}

export function Account() {
  const { user, setUser } = useSession();
  const [form, set] = useForm({ name: user.name, phone: user.phone });
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const fe = error?.fields || {};
  const submit = async e => {
    e.preventDefault(); setError(null); setSaved(false);
    try { const r = await api.patch('/me', form); setUser(r.user); setSaved(true); } catch (err) { setError(err); }
  };
  return (
    <form className="auth panel" onSubmit={submit} noValidate>
      <h1>Account</h1>
      <p className="muted">{user.email}</p>
      <Field label="Name" error={fe.name}><input value={form.name} onChange={set('name')} /></Field>
      <Field label="Phone" error={fe.phone}><input value={form.phone} onChange={set('phone')} inputMode="tel" /></Field>
      {saved && <div className="alert alert-ok">Saved.</div>}
      <button className="btn">Save</button>
    </form>
  );
}

export function BecomeSeller() {
  const { user, setUser } = useSession();
  const { navigate } = useRouter();
  const [form, set] = useForm({ storeName: '', phone: user.phone });
  const [error, setError] = useState(null);
  const fe = error?.fields || {};
  if (user.isSeller) return <div className="empty"><p>You already sell on Shuka.</p><Link to="/seller" className="btn">Open your dashboard</Link></div>;
  const submit = async e => {
    e.preventDefault(); setError(null);
    try { const r = await api.post('/seller/activate', form); setUser(r.user); navigate('/seller'); } catch (err) { setError(err); }
  };
  return (
    <form className="auth panel" onSubmit={submit} noValidate>
      <h1>Sell on Shuka</h1>
      <p className="muted">Choose a store name. Buyers will see it on your products. You can start selling right away.</p>
      <Field label="Store name" error={fe.storeName}><input value={form.storeName} onChange={set('storeName')} /></Field>
      <Field label="Phone for orders" error={fe.phone}><input value={form.phone} onChange={set('phone')} inputMode="tel" /></Field>
      {error && !Object.keys(fe).length && <div className="alert alert-error">{error.message}</div>}
      <button className="btn btn-block">Start selling</button>
    </form>
  );
}

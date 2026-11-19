import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Link, useRouter } from '../../router.jsx';
import { Field, Loading, ErrorBox } from '../../components/ui.jsx';
import { SellerNav } from './Seller.jsx';

const MAX_IMAGES = 5;
const MAX_MB = 8;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Add and edit a product. For a new product, photos are picked first and uploaded right after saving.
export function ProductEditor({ id }) {
  const isNew = !id;
  const { navigate } = useRouter();
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(null);
  const [images, setImages] = useState([]);       // photos already saved
  const [pending, setPending] = useState([]);     // new product: picked, not uploaded yet
  const [error, setError] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/categories').then(r => setCats(r.categories)).catch(setError);
    if (isNew) {
      setForm({ title: '', categoryId: '', description: '', priceAmd: '', stock: '1', isPublished: true });
    } else {
      api.get(`/seller/products/${id}`).then(({ product: p }) => {
        setForm({ title: p.title, categoryId: String(p.category.id), description: p.description,
                  priceAmd: String(p.priceAmd), stock: String(p.stock), isPublished: p.isPublished });
        setImages(p.images);
      }).catch(setError);
    }
  }, [id, isNew]);

  if (error?.status === 404) return <ErrorBox error={error} />;
  if (!form) return error ? <ErrorBox error={error} /> : <Loading />;

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const fe = error?.fields || {};
  const photoCount = images.length + pending.length;

  const checkFiles = files => {
    for (const f of files) {
      if (!TYPES.includes(f.type)) return `"${f.name}" is not a JPG, PNG or WebP photo.`;
      if (f.size > MAX_MB * 1024 * 1024) return `"${f.name}" is bigger than ${MAX_MB} MB.`;
    }
    if (photoCount + files.length > MAX_IMAGES) return `A product can have at most ${MAX_IMAGES} photos.`;
    return null;
  };

  const upload = async (productId, files) => {
    const fd = new FormData();
    files.forEach(f => fd.append('images', f));
    return (await api.post(`/seller/products/${productId}/images`, fd)).product;
  };

  const pickFiles = async e => {
    const files = [...e.target.files];
    e.target.value = '';
    setFileError(null); setMsg(null);
    const problem = checkFiles(files);
    if (problem) return setFileError(problem);
    if (isNew) return setPending(p => [...p, ...files.map(f => Object.assign(f, { preview: URL.createObjectURL(f) }))]);
    setBusy(true);
    try { setImages((await upload(id, files)).images); } catch (err) { setFileError(err.message); } finally { setBusy(false); }
  };

  const removeImage = async imageId => {
    setBusy(true); setFileError(null);
    try {
      const p = (await api.del(`/seller/products/${id}/images/${imageId}`)).product;
      setImages(p.images);
      if (!p.isPublished) setForm(f => ({ ...f, isPublished: false }));
    } catch (err) { setFileError(err.message); } finally { setBusy(false); }
  };
  const makeMain = async imageId => {
    setBusy(true);
    try { setImages((await api.post(`/seller/products/${id}/images/${imageId}/main`)).product.images); }
    catch (err) { setFileError(err.message); } finally { setBusy(false); }
  };

  const save = async e => {
    e.preventDefault();
    setBusy(true); setError(null); setMsg(null);
    const body = { title: form.title, categoryId: Number(form.categoryId), description: form.description,
                   priceAmd: Number(form.priceAmd), stock: Number(form.stock) };
    try {
      if (isNew) {
        if (form.isPublished && pending.length === 0) {
          throw Object.assign(new Error('Please fix the highlighted fields.'), { fields: { images: 'Add at least one photo, or untick “Published”.' } });
        }
        const created = (await api.post('/seller/products', body)).product;
        try {
          if (pending.length) await upload(created.id, pending);
          if (form.isPublished) await api.patch(`/seller/products/${created.id}`, { isPublished: true });
        } catch (err) {
          // The product exists but the photos failed: continue on its edit page.
          navigate(`/seller/products/${created.id}`, { replace: true });
          setFileError(err.message);
          return;
        }
        navigate(`/seller/products/${created.id}?saved=1`, { replace: true });
        return;
      }
      const p = (await api.patch(`/seller/products/${id}`, { ...body, isPublished: form.isPublished })).product;
      setImages(p.images);
      setMsg('Saved.');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const savedNote = !isNew && new URLSearchParams(window.location.search).get('saved') && !msg && !error;
  return (
    <>
      <h1>{isNew ? 'Add a product' : 'Edit product'}</h1>
      <SellerNav />
      <form className="panel editor" onSubmit={save} noValidate>
        <Field label="Title" error={fe.title}><input value={form.title} onChange={set('title')} /></Field>
        <Field label="Category" error={fe.categoryId}>
          <select value={form.categoryId} onChange={set('categoryId')}>
            <option value="">Choose a category</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Description" error={fe.description}><textarea rows="5" value={form.description} onChange={set('description')} /></Field>
        <div className="form-grid">
          <Field label="Price, ֏ (dram)" error={fe.priceAmd}><input type="number" min="1" step="1" inputMode="numeric" value={form.priceAmd} onChange={set('priceAmd')} /></Field>
          <Field label="Stock" error={fe.stock}><input type="number" min="0" step="1" inputMode="numeric" value={form.stock} onChange={set('stock')} /></Field>
        </div>

        <div className={`field ${fe.images ? 'has-error' : ''}`}>
          <span className="field-label">Photos ({photoCount} of {MAX_IMAGES}). The first one is the main photo.</span>
          <div className="photo-grid">
            {images.map((im, i) => (
              <div key={im.id} className="photo">
                <img src={im.thumb} alt="" />
                {i === 0 ? <span className="badge badge-delivered">Main</span>
                         : <button type="button" className="link-btn small" onClick={() => makeMain(im.id)} disabled={busy}>Make main</button>}
                <button type="button" className="link-btn small danger" onClick={() => removeImage(im.id)} disabled={busy}>Delete</button>
              </div>
            ))}
            {pending.map((f, i) => (
              <div key={f.preview} className="photo">
                <img src={f.preview} alt="" />
                {images.length + i === 0 && <span className="badge badge-delivered">Main</span>}
                <button type="button" className="link-btn small danger" onClick={() => { URL.revokeObjectURL(f.preview); setPending(p => p.filter(x => x !== f)); }}>Remove</button>
              </div>
            ))}
            {photoCount < MAX_IMAGES && (
              <label className="photo add-photo">
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={pickFiles} disabled={busy} />
                <span>+ Add photos</span>
              </label>
            )}
          </div>
          <span className="field-hint">JPG, PNG or WebP, up to {MAX_MB} MB each.</span>
          {(fileError || fe.images) && <span className="field-error">{fileError || fe.images}</span>}
        </div>

        <label className="check"><input type="checkbox" checked={form.isPublished} onChange={set('isPublished')} /> Published (buyers can see and buy it)</label>
        {error && !Object.keys(fe).length && <div className="alert alert-error">{error.message}</div>}
        {error && Object.keys(fe).length > 0 && <div className="alert alert-error">Please fix the highlighted fields.</div>}
        {(msg || savedNote) && <div className="alert alert-ok">Saved. <Link to={`/p/${id}`}>View the product page</Link></div>}
        <div className="actions">
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <Link to="/seller/products" className="btn btn-secondary">Back to products</Link>
        </div>
      </form>
    </>
  );
}

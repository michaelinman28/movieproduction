import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { errorText } from '../lib/format';

export function ProfilePage() {
  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    api.me()
      .then((p) => { setForm({ full_name: p.full_name ?? '', phone: p.phone ?? '' }); setEmail(p.email ?? ''); })
      .catch((e) => setMessage({ kind: 'error', text: errorText(e) }))
      .finally(() => setLoaded(true));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.updateMe({ full_name: form.full_name.trim(), phone: form.phone.trim() || null });
      setMessage({ kind: 'info', text: 'Profile saved.' });
    } catch (err) { setMessage({ kind: 'error', text: errorText(err) }); }
  }

  if (!loaded) return <p className="muted">Loading…</p>;
  return (
    <section className="stack">
      <h1>Your profile</h1>
      <form className="card wide" onSubmit={save}>
        <label>Full name<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required autoComplete="name" /></label>
        <label>Email<input value={email} disabled /></label>
        <label>Phone number<input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" placeholder="Optional" /></label>
        <p className="muted small">Your name, email and phone are visible to people in the companies you belong to.</p>
        {message && <p className={message.kind}>{message.text}</p>}
        <div className="row"><button type="submit">Save profile</button></div>
      </form>
    </section>
  );
}

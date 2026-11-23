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

  if (!loaded) return <p className="text-muted">Loading…</p>;
  return (
    <section className="flex flex-col gap-5">
      <h1>Your profile</h1>
      <form className="card w-full max-w-xl" onSubmit={save}>
        <label className="label">Full name<input className="field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required autoComplete="name" /></label>
        <label className="label">Email<input className="field" value={email} disabled /></label>
        <label className="label">Phone number<input className="field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" placeholder="Optional" /></label>
        <p className="hint">Your name, email and phone are visible to people in the companies you belong to.</p>
        {message && <p className={message.kind === 'error' ? 'error' : 'notice'}>{message.text}</p>}
        <div><button type="submit" className="btn">Save profile</button></div>
      </form>
    </section>
  );
}

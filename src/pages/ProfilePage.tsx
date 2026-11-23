import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export function ProfilePage() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', me).maybeSingle().then(({ data, error }) => {
      if (error) setMessage({ kind: 'error', text: error.message });
      if (data) {
        setForm({ full_name: data.full_name ?? '', phone: data.phone ?? '' });
        setEmail(data.email ?? '');
      }
      setLoaded(true);
    });
  }, [me]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const { error } = await supabase.from('profiles')
      .update({ full_name: form.full_name.trim(), phone: form.phone.trim() || null })
      .eq('id', me);
    setMessage(error ? { kind: 'error', text: error.message } : { kind: 'info', text: 'Profile saved.' });
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

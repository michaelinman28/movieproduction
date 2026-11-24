import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PersonContacts } from '../components/PersonContacts';
import { Section } from '../components/Section';
import { errorText } from '../lib/format';

export function ProfilePage() {
  const [form, setForm] = useState({ full_name: '', nickname: '', phone: '' });
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const me = useAuth().session?.user.id ?? '';
  // Changing your sign-in email: only you can, and the new address must be confirmed.
  const [newEmail, setNewEmail] = useState('');
  const [emailMessage, setEmailMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  async function changeEmail(e: FormEvent) {
    e.preventDefault();
    const address = newEmail.trim().toLowerCase();
    if (!address || address === email.toLowerCase()) return;
    setEmailMessage(null);
    const { error } = await supabase.auth.updateUser({ email: address }, { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL });
    if (error) { setEmailMessage({ kind: 'error', text: error.message }); return; }
    setNewEmail('');
    setEmailMessage({ kind: 'info', text: `Check ${address} (and your current inbox) for a confirmation link. Your email changes once you confirm it.` });
  }

  useEffect(() => {
    api.me()
      .then((p) => { setForm({ full_name: p.full_name ?? '', nickname: p.nickname ?? '', phone: p.phone ?? '' }); setEmail(p.email ?? ''); })
      .catch((e) => setMessage({ kind: 'error', text: errorText(e) }))
      .finally(() => setLoaded(true));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api.updateMe({ full_name: form.full_name.trim(), nickname: form.nickname.trim() || null, phone: form.phone.trim() || null });
      setMessage({ kind: 'info', text: 'Profile saved.' });
    } catch (err) { setMessage({ kind: 'error', text: errorText(err) }); }
  }

  if (!loaded) return <p className="text-muted">Loading…</p>;
  return (
    <section className="flex flex-col gap-5">
      <h1>Your profile</h1>
      <form className="card w-full max-w-xl" onSubmit={save}>
        <label className="label">Full name<input className="field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required autoComplete="name" /></label>
        <label className="label">Nickname<input className="field" value={form.nickname} maxLength={60} onChange={(e) => setForm({ ...form, nickname: e.target.value })} autoComplete="nickname" placeholder="Optional" /></label>
        <label className="label">Email<input className="field" value={email} disabled /></label>
        <label className="label">Phone number<input className="field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" placeholder="Optional" /></label>
        <p className="hint">Your name, email and phone are visible to people in the companies you belong to.</p>
        {message && <p className={message.kind === 'error' ? 'error' : 'notice'}>{message.text}</p>}
        <div><button type="submit" className="btn">Save profile</button></div>
      </form>
      <Section id="profile.email" title="Sign-in email">
      <form className="card w-full max-w-xl" onSubmit={changeEmail}>
        <p className="hint m-0">Only you can change this. We send a link to confirm the new address first.</p>
        <label className="label">New email<input className="field" type="email" value={newEmail} required autoComplete="email" onChange={(e) => setNewEmail(e.target.value)} /></label>
        {emailMessage && <p className={emailMessage.kind === 'error' ? 'error' : 'notice'}>{emailMessage.text}</p>}
        <div><button type="submit" className="btn btn-secondary">Send confirmation</button></div>
      </form>
      </Section>
      {me && <div className="card w-full max-w-xl"><PersonContacts userId={me} name="you" canEdit /></div>}
    </section>
  );
}

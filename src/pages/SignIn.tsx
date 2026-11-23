import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function SignIn() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { data, error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: {
              data: { full_name: fullName.trim(), phone: phone.trim() },
              // Send the confirmation link back to wherever the app is running.
              emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
            } });
    setBusy(false);
    if (error) setMessage({ kind: 'error', text: error.message });
    else if (mode === 'sign-up' && !data.session)
      setMessage({ kind: 'info', text: 'Check your email to confirm your account, then sign in.' });
  }

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <form className="card w-full max-w-sm" onSubmit={submit}>
        <h1>Movie Production</h1>
        <p className="text-muted">{mode === 'sign-in' ? 'Sign in to your account' : 'Create an account'}</p>
        {mode === 'sign-up' && (
          <label className="label">
            Full name
            <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        {mode === 'sign-up' && (
          <label className="label">
            Phone number <span className="text-muted">(optional)</span>
            <input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </label>
        )}
        <label className="label">
          Email
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="label">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          />
        </label>
        {message && <p className={message.kind === 'error' ? 'error' : 'notice'}>{message.text}</p>}
        <button type="submit" className="btn sm:w-full" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="btn-link justify-center"
          onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(null); }}
        >
          {mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}

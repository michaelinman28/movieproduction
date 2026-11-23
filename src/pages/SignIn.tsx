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
    <main className="auth">
      <form className="card" onSubmit={submit}>
        <h1>Movie Production</h1>
        <p className="muted">{mode === 'sign-in' ? 'Sign in to your account' : 'Create an account'}</p>
        {mode === 'sign-up' && (
          <label>
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        {mode === 'sign-up' && (
          <label>
            Phone number <span className="muted">(optional)</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
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
        {message && <p className={message.kind}>{message.text}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(null); }}
        >
          {mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}

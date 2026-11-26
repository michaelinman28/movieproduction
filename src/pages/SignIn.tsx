import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { emailProblem, formatPhone, phoneOrThrow } from '../lib/contact';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { PasswordField } from '../components/PasswordField';
import { readInvite } from '../lib/invite';

export function SignIn() {
  // An invite link opens sign-up with their name and email filled in.
  const [invite] = useState(() => readInvite());
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(invite ? 'sign-up' : 'sign-in');
  const [fullName, setFullName] = useState(invite?.name ?? '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(invite?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    let cleanPhone: string | null = null;
    if (mode === 'sign-up') {
      const problem = emailProblem(email);
      if (problem) { setMessage({ kind: 'error', text: problem }); return; }
      try { cleanPhone = phoneOrThrow(phone); } catch (err) { setMessage({ kind: 'error', text: (err as Error).message }); return; }
    }
    setBusy(true);
    const { data, error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: {
              data: { full_name: fullName.trim(), phone: cleanPhone ?? '' },
              // Send the confirmation link back to wherever the app is running.
              emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
            } });
    setBusy(false);
    if (error) setMessage({ kind: 'error', text: error.message });
    else if (mode === 'sign-up' && !data.session)
      setMessage({ kind: 'info', text: 'Check your email to confirm your account, then sign in.' });
  }

  return (
    <main className="relative grid min-h-dvh place-items-center p-4">
      <div className="absolute top-2 right-2"><ThemeSwitch /></div>
      <form className="card w-full max-w-sm" onSubmit={submit}>
        <h1>Movie Production</h1>
        <p className="text-muted">{mode === 'sign-in' ? 'Sign in to your account' : 'Create an account'}</p>
        {invite && mode === 'sign-up' && (
          <p className="notice">You've been invited{invite.company ? ` to ${invite.company}` : ''}. Create your account with {invite.email || 'the email the invite was sent to'} and you'll be in as soon as you confirm it. Already have an account with that email? Sign in instead.</p>
        )}
        {mode === 'sign-up' && (
          <label className="label">
            Full name
            <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        {mode === 'sign-up' && (
          <label className="label">
            Phone number <span className="text-muted">(optional)</span>
            <input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setPhone(formatPhone(phone))} autoComplete="tel" placeholder="e.g. 404-555-0123" />
          </label>
        )}
        <label className="label">
          Email
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="label">
          Password
          <PasswordField
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

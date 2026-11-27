import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, DATA_CHANGED } from '../lib/api';

/**
 * The header's link to your profile: a person icon and your name (your nickname if you
 * have one), so it reads as your account. Falls back to your sign-in email. On phones
 * only the icon shows.
 */
export function HeaderAccount({ email }: { email: string | undefined }) {
  const [name, setName] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => api.me().then((p) => { if (live) setName(p.nickname?.trim() || p.full_name?.trim() || ''); }).catch(() => {});
    load();
    // A change on the Profile page shows here straight away.
    window.addEventListener(DATA_CHANGED, load);
    return () => { live = false; window.removeEventListener(DATA_CHANGED, load); };
  }, []);
  const shown = name || email || 'Profile';
  return (
    <Link to="/profile" title="Your profile" aria-label={`Your profile: ${shown}`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-fg no-underline hover:bg-accent-soft">
      <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
      {/* Phones show just the icon; there isn't room for a name beside the title. */}
      <span className="hidden max-w-56 truncate sm:inline">{shown}</span>
    </Link>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { displayName } from '../lib/format';
import { copyInvite, inviteMailto, type InviteInfo } from '../lib/invite';

// The signed-in person's name, to sign the invite with (fetched once).
let me: Promise<string> | null = null;
const myName = () => (me ??= api.me().then((p) => displayName(p)).catch(() => ''));

/**
 * For someone added without an account: says so, and offers to send them an invite
 * from your own email app, or copy it to send another way.
 */
export function InviteButtons({ info }: { info: Omit<InviteInfo, 'from'> }) {
  const [from, setFrom] = useState('');
  const [copied, setCopied] = useState<boolean | null>(null);
  useEffect(() => { let live = true; myName().then((n) => { if (live) setFrom(n); }); return () => { live = false; }; }, []);
  const full: InviteInfo = { ...info, from: from || undefined };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-accent-soft p-3">
      <p className="m-0 text-sm">
        <strong>{info.name || info.email}</strong> doesn't have an account yet. They join automatically when they sign up with <strong>{info.email}</strong>. Until then you can still give them tasks.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a className="btn no-underline" href={inviteMailto(full)}>Email invite</a>
        <button type="button" className="btn btn-secondary" onClick={async () => setCopied(await copyInvite(full))}>Copy invite</button>
      </div>
      {copied === true && <p className="hint m-0">Invite copied. Paste it into a text, chat or email.</p>}
      {copied === false && <p className="error m-0">Your browser didn't allow copying. Use Email invite instead.</p>}
    </div>
  );
}

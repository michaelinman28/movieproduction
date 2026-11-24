/**
 * Invites for people added before they have an account. There's no email server:
 * the invite opens the admin's own email app (mailto:) with the message filled in,
 * or is copied to paste into a text or chat. The link opens sign-up with their email
 * filled in; once they sign up with that email and confirm it, they're in.
 */

export interface InviteInfo { name: string; email: string; company: string; project?: string; from?: string }

/** The sign-up link, with their name and email filled in. */
export function inviteLink(i: InviteInfo): string {
  const q = new URLSearchParams({ invite: '1', email: i.email, name: i.name, company: i.company });
  return `${window.location.origin}${import.meta.env.BASE_URL}?${q}`;
}

export function inviteSubject(i: InviteInfo): string {
  return `You're invited to ${i.project ? `${i.project} at ` : ''}${i.company}`;
}

export function inviteBody(i: InviteInfo): string {
  const first = i.name.trim().split(/\s+/)[0] || 'there';
  return [
    `Hi ${first},`,
    '',
    `${i.from ? `${i.from} has` : "You've been"} added you to ${i.project ? `the ${i.project} project at ` : ''}${i.company} on Movie Production, where we keep our tasks, locations and team.`,
    '',
    `Create your account with this email address (${i.email}) and you'll see everything straight away:`,
    inviteLink(i),
    '',
    'See you there!',
    ...(i.from ? [i.from] : []),
  ].join('\n');
}

/** A mailto: link that opens the person's own email app with the invite filled in. */
export function inviteMailto(i: InviteInfo): string {
  return `mailto:${encodeURIComponent(i.email)}?subject=${encodeURIComponent(inviteSubject(i))}&body=${encodeURIComponent(inviteBody(i))}`;
}

/** Copy the invite (subject and message) to paste anywhere. Returns false if the browser refused. */
export async function copyInvite(i: InviteInfo): Promise<boolean> {
  const text = `${inviteSubject(i)}\n\n${inviteBody(i)}`;
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** What a sign-up page opened from an invite link should fill in. */
export function readInvite(search = window.location.search): { email: string; name: string; company: string } | null {
  const q = new URLSearchParams(search);
  if (!q.get('invite')) return null;
  return { email: q.get('email') ?? '', name: q.get('name') ?? '', company: q.get('company') ?? '' };
}

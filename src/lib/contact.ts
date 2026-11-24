/**
 * Email and phone checks, matching the database's rules
 * (supabase/migrations/20261124030000_phone_email_format.sql), so mistakes show
 * before saving.
 *  - Phones: 10 digits (or 11 starting with 1) become ###-###-####; a number starting
 *    with + and another country code becomes + and its digits.
 *  - Emails: a name, an @, and a domain with a dot and an ending of 2+ letters.
 */

const EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

export const PHONE_HINT = 'Enter a 10-digit phone number, like 404-555-0123, or an international number starting with +';

/** The phone in the stored format, or null when blank. Throws with a message when it can't be. */
export function phoneOrThrow(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (/[A-Za-z]/.test(t)) throw new Error('Phone numbers can only have digits, like 404-555-0123');
  const all = t.replace(/\D/g, '');
  const intl = t.startsWith('+') && !all.startsWith('1');
  let d = all;
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length === 10 && !intl) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (t.startsWith('+') && all.length >= 8 && all.length <= 15) return `+${all}`;
  throw new Error(PHONE_HINT);
}

/** The phone in the stored format where it can be; otherwise as typed (for on-blur tidying). */
export function formatPhone(value: string): string {
  try { return phoneOrThrow(value) ?? ''; } catch { return value; }
}

/** The email trimmed and lowercased, or null when blank. Throws with a message when it isn't valid. */
export function emailOrThrow(value: string): string | null {
  const t = value.trim().toLowerCase();
  if (!t) return null;
  if (t.length > 254 || !EMAIL.test(t) || t.includes('..') || t.startsWith('.') || t.includes('.@')) {
    throw new Error(`"${value.trim()}" isn't a valid email address. Use the full address, like name@example.com`);
  }
  return t;
}

/** A message when the email isn't valid, otherwise null. */
export function emailProblem(value: string): string | null {
  try { emailOrThrow(value); return null; } catch (e) { return (e as Error).message; }
}

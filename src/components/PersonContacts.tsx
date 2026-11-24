import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Section } from './Section';
import { api, type PersonContact } from '../lib/api';
import { emailOrThrow, formatPhone, phoneOrThrow } from '../lib/contact';
import { errorText } from '../lib/format';

const telHref = (v: string) => `tel:${v.replace(/[^\d+]/g, '')}`;

/**
 * A person's other email addresses and phone numbers (besides their sign-in email and
 * main phone), each with an optional label such as Work. The person, or an admin of a
 * company they're in, adds and removes them; adding and removing happen at once.
 */
export function PersonContacts({ userId, name, canEdit }: { userId: string; name: string; canEdit: boolean }) {
  const [list, setList] = useState<PersonContact[] | null>(null);
  const [draft, setDraft] = useState({ kind: 'email' as 'email' | 'phone', value: '', label: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setList(await api.contacts(userId)); } catch (e) { setError(errorText(e)); setList([]); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const value = draft.kind === 'phone' ? phoneOrThrow(draft.value) : emailOrThrow(draft.value);
      if (!value) return;
      await api.addContact(userId, { kind: draft.kind, value, label: draft.label.trim() || null });
      setDraft({ ...draft, value: '', label: '' });
    } catch (err) { setError(errorText(err)); }
    await load();
  }
  async function remove(c: PersonContact) {
    if (!window.confirm(`Remove ${c.value}?`)) return;
    setError(null);
    try { await api.deleteContact(c.id); } catch (err) { setError(errorText(err)); }
    await load();
  }

  return (
    <Section id="person.contacts" title="Other emails and phones" level="h4" bodyClassName="flex flex-col gap-2"
      summary={list?.length ? String(list.length) : undefined}>
      {list === null ? <p className="hint">Loading…</p> : list.length ? (
        <ul className="flex flex-col">
          {list.map((c) => (
            <li key={c.id} className="flex min-h-11 items-center gap-2 border-b border-line last:border-b-0">
              <span className="w-14 shrink-0 text-xs text-muted">{c.label ?? (c.kind === 'email' ? 'Email' : 'Phone')}</span>
              <a className="min-w-0 flex-1 truncate" href={c.kind === 'email' ? `mailto:${c.value}` : telHref(c.value)}>{c.value}</a>
              {canEdit && <button type="button" className="btn-link text-sm" aria-label={`Remove ${c.value}`} onClick={() => remove(c)}>Remove</button>}
            </li>
          ))}
        </ul>
      ) : <p className="hint">No other emails or phones for {name}.</p>}
      {canEdit && (
        <form className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_8rem_auto] sm:items-end" onSubmit={add}>
          <label className="label">Type
            <select className="field" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as 'email' | 'phone' })}>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>
          </label>
          <label className="label">{draft.kind === 'email' ? 'Email address' : 'Phone number'}
            <input className="field" type={draft.kind === 'email' ? 'email' : 'tel'} value={draft.value} required minLength={3} maxLength={254}
              placeholder={draft.kind === 'email' ? 'e.g. ava@studio.com' : 'e.g. 404-555-0101'} onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              onBlur={() => { if (draft.kind === 'phone') setDraft((d) => ({ ...d, value: formatPhone(d.value) })); }} />
          </label>
          <label className="label">Label
            <input className="field" value={draft.label} maxLength={40} placeholder="e.g. Work" onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-secondary">Add</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </Section>
  );
}

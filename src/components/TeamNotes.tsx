import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Section } from './Section';
import { api, type TeamNote, type TeamNoteType } from '../lib/api';
import { useAuth } from '../lib/auth';
import { NONE, displayName, errorText } from '../lib/format';
import { useUnsaved } from '../lib/unsaved';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Notes about one person on a project, each with a type (Travel, Availability…).
 * Only company admins and the person themselves see this. Adding happens at once;
 * an author edits their own note and its type; the author or an admin deletes one.
 */
export function TeamNotes({ projectId, userId, name, types, isAdmin }: {
  projectId: string; userId: string; name: string; types: TeamNoteType[]; isAdmin: boolean;
}) {
  const { session } = useAuth();
  const me = session?.user.id;
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState({ body: '', type_id: '' });
  const [editing, setEditing] = useState<{ id: string; body: string; type_id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editedFrom = editing ? notes.find((n) => n.id === editing.id) : undefined;
  useUnsaved(Boolean(draft.body.trim()) || Boolean(editing && editedFrom
    && (editing.body.trim() !== editedFrom.body || editing.type_id !== (editedFrom.type_id ?? ''))));

  const load = useCallback(async () => {
    try { setNotes(await api.teamNotes(projectId, userId)); } catch (e) { setError(errorText(e)); }
    setLoaded(true);
  }, [projectId, userId]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(errorText(e)); return false; }
    await load();
    return true;
  };

  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name ?? null;
  const typeSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select className="field" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{NONE} No type</option>
      {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );

  async function add(e: FormEvent) {
    e.preventDefault();
    const body = draft.body.trim();
    if (body && await run(() => api.addTeamNote(projectId, userId, { body, type_id: draft.type_id || null }))) setDraft({ body: '', type_id: draft.type_id });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (editing && await run(() => api.updateTeamNote(editing.id, { body: editing.body.trim(), type_id: editing.type_id || null }))) setEditing(null);
  }

  async function remove(n: TeamNote) {
    if (window.confirm('Delete this note?')) await run(() => api.deleteTeamNote(n.id));
  }

  const own = userId === me;
  return (
    <Section id="project.person.notes" title={own ? 'Notes about you' : 'Team notes'} level="h4" summary={notes.length || undefined} bodyClassName="flex flex-col gap-2">
      <p className="hint">{own && !isAdmin ? 'Only you and the company\'s admins see these.' : `Only admins and ${name} see these.`}</p>
      {error && <p className="error">{error}</p>}
      {!loaded ? <p className="hint">Loading notes…</p> : !notes.length && <p className="hint">No notes yet.</p>}
      <ul className="flex flex-col gap-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-line p-2">
            <p className="text-xs text-muted">
              {typeName(n.type_id) && <span className="tag-chip mr-1 py-0 pr-2 text-xs">{typeName(n.type_id)}</span>}
              {displayName(n.author)} · {when(n.created_at)}{n.updated_at > n.created_at ? ' · edited' : ''}
            </p>
            {editing?.id === n.id ? (
              <form className="mt-1 flex flex-col gap-2" onSubmit={saveEdit}>
                {typeSelect(editing.type_id, (v) => setEditing({ ...editing, type_id: v }), 'Note type')}
                <textarea className="field" rows={3} value={editing.body} maxLength={5000} required autoFocus
                  aria-label="Edit note" onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                <div className="flex gap-2">
                  <button type="submit" className="btn">Save</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <p className="mt-1 whitespace-pre-wrap break-words">{n.body}</p>
                {(n.author_id === me || isAdmin) && (
                  <div className="mt-1 flex gap-3 text-sm">
                    {n.author_id === me && (
                      <button type="button" className="btn-link" onClick={() => setEditing({ id: n.id, body: n.body, type_id: n.type_id ?? '' })}>Edit</button>
                    )}
                    <button type="button" className="btn-link" onClick={() => remove(n)}>Delete</button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="flex flex-col gap-2" onSubmit={add}>
        {typeSelect(draft.type_id, (v) => setDraft({ ...draft, type_id: v }), 'New note\'s type')}
        <textarea className="field" rows={2} placeholder={own ? 'Add a note about yourself…' : `Add a note about ${name}…`} aria-label="New note"
          value={draft.body} maxLength={5000} onChange={(e) => setDraft({ ...draft, body: e.target.value })} required />
        <button type="submit" className="btn btn-secondary">Add note</button>
      </form>
    </Section>
  );
}

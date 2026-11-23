import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Section } from './Section';
import { api, type TaskNote } from '../lib/api';
import { useAuth } from '../lib/auth';
import { displayName, errorText } from '../lib/format';
import { useUnsaved } from '../lib/unsaved';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The notes on one task: anyone on the project adds them, authors edit their own. */
export function TaskNotes({ taskId, canManage }: { taskId: string; canManage: boolean }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A half-written note, or an edit in progress, counts as unsaved.
  useUnsaved(Boolean(draft.trim()) || Boolean(editing && editing.body.trim() !== notes.find((n) => n.id === editing.id)?.body));

  const load = useCallback(async () => {
    try { setNotes(await api.taskNotes(taskId)); } catch (e) { setError(errorText(e)); }
    setLoaded(true);
  }, [taskId]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(errorText(e)); return false; }
    await load();
    return true;
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (body && await run(() => api.addTaskNote(taskId, body))) setDraft('');
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (editing && await run(() => api.updateTaskNote(editing.id, editing.body.trim()))) setEditing(null);
  }

  async function remove(n: TaskNote) {
    if (window.confirm('Delete this note?')) await run(() => api.deleteTaskNote(n.id));
  }

  return (
    <Section id="task.notes" title="Notes" level="h4" summary={notes.length || undefined} bodyClassName="flex flex-col gap-2">
      {error && <p className="error">{error}</p>}
      {!loaded ? <p className="hint">Loading notes…</p> : !notes.length && <p className="hint">No notes yet.</p>}
      <ul className="flex flex-col gap-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-line p-2">
            <p className="text-xs text-muted">
              {displayName(n.author)} · {when(n.created_at)}{n.updated_at > n.created_at ? ' · edited' : ''}
            </p>
            {editing?.id === n.id ? (
              <form className="mt-1 flex flex-col gap-2" onSubmit={saveEdit}>
                <textarea className="field" rows={3} value={editing.body} maxLength={5000} required autoFocus
                  aria-label="Edit note" onChange={(e) => setEditing({ id: n.id, body: e.target.value })} />
                <div className="flex gap-2">
                  <button type="submit" className="btn">Save</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <p className="mt-1 whitespace-pre-wrap break-words">{n.body}</p>
                {(n.author_id === me || canManage) && (
                  <div className="mt-1 flex gap-3 text-sm">
                    {n.author_id === me && <button type="button" className="btn-link" onClick={() => setEditing({ id: n.id, body: n.body })}>Edit</button>}
                    <button type="button" className="btn-link" onClick={() => remove(n)}>Delete</button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="flex flex-col gap-2" onSubmit={add}>
        <textarea className="field" rows={2} placeholder="Add a note…" aria-label="New note" value={draft} maxLength={5000}
          onChange={(e) => setDraft(e.target.value)} required />
        <button type="submit" className="btn btn-secondary">Add note</button>
      </form>
    </Section>
  );
}

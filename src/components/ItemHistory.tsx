import { useEffect, useState } from 'react';
import { Section } from './Section';
import { api, type AuditEntry } from '../lib/api';
import { changeText, friendlyTime, sentence } from '../lib/activity';
import { errorText } from '../lib/format';

/**
 * An item's history from the activity log, for company admins: who added it, each
 * change with before and after, and what happened to the things on it (notes, tags,
 * shots, calls). Starts closed; loads when opened.
 */
export function ItemHistory({ companyId, kind, id, refresh }: {
  companyId: string;
  /** The item's table (tasks, scenes, shoot_days, project_locations…), or 'person'. */
  kind: string;
  id: string;
  /** Change this to reload, e.g. after a save. */
  refresh?: unknown;
}) {
  return (
    <Section id={`history.${kind}`} title="History" level="h4" defaultCollapsed>
      <HistoryList companyId={companyId} kind={kind} id={id} refresh={refresh} />
    </Section>
  );
}

function HistoryList({ companyId, kind, id, refresh }: { companyId: string; kind: string; id: string; refresh?: unknown }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.itemHistory(companyId, kind, id).then((e) => { if (live) { setEntries(e); setError(null); } }, (e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [companyId, kind, id, refresh]);

  if (error) return <p className="error">{error}</p>;
  if (!entries) return <p className="text-muted">Loading…</p>;
  if (!entries.length) return <p className="hint">Nothing logged yet. The log started when this feature was switched on.</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {entries.map((e) => {
        const own = e.kind === kind || (kind === 'person' && e.kind === 'profiles');
        return (
          <li key={e.id} className="flex flex-col gap-0.5 border-b border-line pb-2 last:border-b-0">
            <span className="text-sm">
              <strong>{sentence(e, own)}</strong>
            </span>
            <span className="text-xs text-muted">{friendlyTime(e.at)}{e.source === 'link' ? ', from their personal call sheet link' : ''}{e.detail ? ` · ${e.detail}` : ''}</span>
            {e.private
              ? <span className="text-sm text-muted">Private journal entry: the content isn't shown.</span>
              : e.changes.length > 0 && (
                <ul className="m-0 flex flex-col gap-0.5 pl-4 text-sm">
                  {e.changes.map((c) => <li key={c.field} className="break-words">{changeText(e, c)}</li>)}
                </ul>
              )}
          </li>
        );
      })}
    </ul>
  );
}

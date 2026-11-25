import { useCallback, useEffect, useMemo, useState } from 'react';
import { LatticeGrid, gridEsc, gridLinkHtml } from './LatticeGrid';
import { Section } from './Section';
import { api, type AuditEntry, type AuditPage } from '../lib/api';
import { ACTION_LABELS, KIND_LABELS, changesText, entryLink, friendlyTime, itemText, kindLabel, sortableTime } from '../lib/activity';
import { errorText } from '../lib/format';

interface Row { id: string; at: string; who: string; action: string; kind: string; item: string; to: string; title: string; changes: string; project: string }

/**
 * The activity log (audit trail) for a company or one project, newest first, for
 * company admins. The grid's filters work on what's loaded; "Load older entries"
 * fetches the next page.
 */
export function ActivityLog({ companyId, projectId, projects }: {
  companyId: string;
  /** One project's log; leave out for the whole company. */
  projectId?: string;
  /** The company's projects, for the clean-up tool's project choice (company log only). */
  projects?: { id: string; name: string }[];
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback((before?: number): Promise<AuditPage> =>
    projectId ? api.projectActivity(projectId, { before }) : api.companyActivity(companyId, { before }), [companyId, projectId]);

  const load = useCallback(async () => {
    try { const p = await fetchPage(); setEntries(p.entries); setNext(p.next_before); setError(null); }
    catch (e) { setError(errorText(e)); }
    setLoaded(true);
  }, [fetchPage]);
  useEffect(() => { load(); }, [load]);

  const older = async () => {
    if (next === null) return;
    setBusy(true);
    try { const p = await fetchPage(next); setEntries((have) => [...have, ...p.entries]); setNext(p.next_before); }
    catch (e) { setError(errorText(e)); }
    setBusy(false);
  };

  const byId = useMemo(() => new Map(entries.map((e) => [String(e.id), e])), [entries]);
  const rows = useMemo<Row[]>(() => entries.map((e) => {
    const link = entryLink(e, companyId);
    return {
      id: String(e.id), at: sortableTime(e.at), who: e.actor.name ?? 'Someone', action: ACTION_LABELS[e.action],
      kind: kindLabel(e.kind), item: itemText(e), to: link?.to ?? '', title: link?.title ?? '',
      changes: changesText(e), project: e.project_name ?? '',
    };
  }), [entries, companyId]);

  const options = useMemo(() => ({
    rowId: (r: Row) => r.id,
    toolbar: { quickFilter: true },
    groupPanel: false, statusBar: false,
    emptyMessage: 'Nothing logged yet',
    columns: [
      {
        field: 'at', header: 'When', width: 150, sort: 'desc', filter: false,
        render: ({ data }: { data: Row }) => { const e = byId.get(data.id); return e ? gridEsc(friendlyTime(e.at)) : ''; },
      },
      { field: 'who', header: 'Who', width: 140, filter: 'set' },
      { field: 'action', header: 'Did', width: 110, filter: 'set' },
      { field: 'kind', header: 'What', width: 140, filter: 'set' },
      {
        field: 'item', header: 'Item', width: 220, wrap: true,
        render: ({ data }: { data: Row }) => (data.to ? gridLinkHtml(data.item, data.to, data.title) : gridEsc(data.item)),
      },
      { field: 'changes', header: 'Details', width: 360, wrap: true },
      ...(projectId ? [] : [{ field: 'project', header: 'Project', width: 160, filter: 'set' }]),
    ],
  }), [byId, projectId]);

  if (!loaded) return <p className="text-muted">Loading…</p>;
  const summary = entries.length ? `${entries.length}${next !== null ? '+' : ''} ${entries.length === 1 ? 'entry' : 'entries'}` : undefined;

  return (
    <>
      <Section id={projectId ? 'project.activity' : 'company.activity'} title="Activity" summary={summary} bodyClassName="flex flex-col gap-2">
        {error && <p className="error">{error}</p>}
        <p className="hint">
          Every add, change and delete{projectId ? ' in this project' : ' in the company and its projects, plus sign-ins'}, and each time a call sheet is opened, newest first.
          Only company admins can see this. Private journal entries show only that something happened, never what they say. Select an item to open it, if it still exists.
        </p>
        <LatticeGrid stateId={projectId ? 'project.activity' : 'company.activity'} options={options} rows={rows} height={Math.min(140 + rows.length * 56, 640)} />
        {next !== null && (
          <button type="button" className="btn btn-secondary sm:self-start" disabled={busy} onClick={older}>{busy ? 'Loading…' : 'Load older entries'}</button>
        )}
      </Section>
      <ActivityCleanup companyId={companyId} projectId={projectId} projects={projects} onDone={load} />
    </>
  );
}

/**
 * Temporary: lets admins remove log entries while the platform is being set up.
 * Each clean-up leaves its own entry, which is never removed.
 */
function ActivityCleanup({ companyId, projectId, projects, onDone }: {
  companyId: string; projectId?: string; projects?: { id: string; name: string }[]; onDone: () => void;
}) {
  const [project, setProject] = useState(projectId ?? '');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dates are the person's own days: from the start of `from` to the end of `to`.
  const dayStart = (d: string, plus = 0) => { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day + plus).toISOString(); };

  const remove = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const r = await api.cleanUpActivity(companyId, {
        project_id: project || null, kind: kind || null, from: from ? dayStart(from) : null, to: to ? dayStart(to, 1) : null,
      });
      setMessage(`Removed ${r.removed} ${r.removed === 1 ? 'entry' : 'entries'}.`);
      setAsking(false);
      onDone();
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };

  const scope = [
    project ? `in ${projects?.find((p) => p.id === project)?.name ?? 'this project'}` : projectId ? '' : 'in the whole company (and its people\'s sign-ins)',
    kind ? `about ${kindLabel(kind).toLowerCase()}s` : '',
    from ? `from ${from}` : '', to ? `up to ${to}` : '',
  ].filter(Boolean).join(' ');

  return (
    <Section id="activity.cleanup" title="Clean up the log" summary="Temporary" defaultCollapsed bodyClassName="flex flex-col gap-3">
      <p className="hint">
        For tidying up while the platform is being set up. This tool will be switched off once the log is in real use, so entries can't be removed.
        Removing entries can't be undone. Each clean-up adds its own entry saying who removed how many, and those stay.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {!projectId && projects && (
          <label className="label">Project
            <select className="field" value={project} onChange={(e) => { setProject(e.target.value); setAsking(false); }}>
              <option value="">All, and company-wide entries</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label className="label">Kind of item
          <select className="field" value={kind} onChange={(e) => { setKind(e.target.value); setAsking(false); }}>
            <option value="">Every kind</option>
            {Object.entries(KIND_LABELS).filter(([k]) => k !== 'audit_log').sort((a, b) => a[1].localeCompare(b[1])).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="label">From
          <input className="field" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setAsking(false); }} />
        </label>
        <label className="label">Up to and including
          <input className="field" type="date" value={to} onChange={(e) => { setTo(e.target.value); setAsking(false); }} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="hint">{message}</p>}
      {asking ? (
        <div className="flex flex-col gap-2 rounded-md border border-line p-3">
          <p className="m-0">Remove every entry {scope || 'in this project'}? This can't be undone.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>{busy ? 'Removing…' : 'Yes, remove them'}</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-danger sm:self-start" onClick={() => setAsking(true)}>Remove entries…</button>
      )}
    </Section>
  );
}

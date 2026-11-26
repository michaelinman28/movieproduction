import { useCallback, useMemo, useRef, useState } from 'react';
import { LatticeGrid, gridEsc, gridLinkHtml } from '../../components/LatticeGrid';
import { Section } from '../../components/Section';
import { api, type NoteSource, type ProjectNote, type ProjectNotePage } from '../../lib/api';
import { setValues, useServerPages, type PageRequest } from '../../lib/serverPages';
import { displayName } from '../../lib/format';
import { itemPath } from '../../lib/links';
import { useProject } from './ProjectLayout';

/** Where each kind of note was taken, as shown in the Where column. */
export const NOTE_SOURCES: Record<NoteSource, string> = {
  task: 'Task notes',
  scene: 'Scene notes',
  character: 'Character notes',
  team: 'Team member notes',
  shot: 'Shot list',
  shoot_day: 'Shoot day',
  schedule: 'Day schedule',
  call: 'Call',
};

interface NoteRow { id: string; at: string; where: string; item: string; detail: string; note: string; by: string; to: string; title: string }

const pad = (n: number) => String(n).padStart(2, '0');
/** A sortable local time, 'YYYY-MM-DD HH:mm'. */
const sortable = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** e.g. 'Nov 25, 4:30 PM', with the year only when it isn't this year. */
const friendly = (iso: string) => {
  const d = new Date(iso);
  const year = d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {};
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', ...year, hour: 'numeric', minute: '2-digit' });
};

/** The page that holds the note, opened with its item's form. */
function linkFor(projectId: string, n: ProjectNote) {
  switch (n.item.kind) {
    case 'task': return { to: itemPath.task(projectId, n.item.id), page: 'Tasks' };
    case 'scene': return { to: itemPath.scene(projectId, n.item.id), page: 'Scenes' };
    case 'character': return { to: itemPath.character(projectId, n.item.id), page: 'Characters' };
    case 'team_member': return { to: itemPath.teamMember(projectId, n.item.id), page: 'Team' };
    default: return { to: itemPath.shootDay(projectId, n.item.id), page: 'Shoot days' };
  }
}

/**
 * Every note on the project in one place: task and scene notes, shot notes, shoot day
 * notes, notes in a day's schedule and notes on people's calls. Each links back to
 * where it was taken, which opens with that item's form. Notes are edited there.
 * The journal is a separate thing with its own page.
 */
export function ProjectNotes() {
  const { projectId } = useProject();
  // Notes keep growing, so the server pages them: the Where and By filters, sort by When
  // and the quick search go to the API and cover every note.
  const facets = useRef<ProjectNotePage['facets']>({ sources: [], authors: [] });
  const fetchPage = useCallback(({ offset, limit, query: q }: PageRequest) => {
    const pick = (col: string) => { const v = setValues(q, col); return v ? v.join(',') || 'nothing' : undefined; };
    return api.projectNotesPage(projectId, {
      offset, limit, q: q.quick || undefined, sources: pick('where'), author_ids: pick('by'),
      order: q.sorts[0]?.id === 'at' && q.sorts[0].dir === 'asc' ? 'oldest' : 'newest',
    }).then((p) => { facets.current = p.facets; setAll(p.facets.sources.reduce((n, x) => n + x.count, 0)); return { items: p.notes, total: p.total }; });
  }, [projectId]);
  const [all, setAll] = useState(0);
  const { items: notes, total, loaded, error, paging } = useServerPages<ProjectNote>('project.notes', fetchPage, { sorts: [{ id: 'at', dir: 'desc' }] });

  const rows = useMemo<NoteRow[]>(() => notes.map((n) => {
    const { to, page } = linkFor(projectId, n);
    return {
      id: n.key, at: sortable(n.at), where: NOTE_SOURCES[n.source], item: n.item.label, detail: n.item.detail ?? '',
      note: n.body, by: n.author ? displayName(n.author) : '', to, title: `Open ${n.item.label} on the ${page} page`,
    };
  }), [notes, projectId]);
  // A ref, so a new page doesn't rebuild the grid (which would drop its filters).
  const byAt = useRef(new Map<string, ProjectNote>());
  byAt.current = useMemo(() => new Map(notes.map((n) => [n.key, n])), [notes]);

  const options = useMemo(() => ({
    rowId: (r: NoteRow) => r.id,
    toolbar: { quickFilter: true },
    groupPanel: false, statusBar: false,
    emptyMessage: 'No notes yet',
    columns: [
      // The note comes first so it's what a phone shows; the rest scrolls sideways.
      { field: 'note', header: 'Note', width: 300, wrap: true, filter: false, sortable: false },
      {
        field: 'item', header: 'Taken on', width: 210, filter: false, sortable: false,
        render: ({ data }: { data: NoteRow }) => gridLinkHtml(data.item, data.to, data.title),
      },
      { field: 'detail', header: 'Part', width: 150, filter: false, sortable: false },
      {
        field: 'where', header: 'Where', width: 120, filter: 'set', sortable: false,
        setValues: () => facets.current.sources.map((x) => ({ key: x.source, label: NOTE_SOURCES[x.source], count: x.count })),
      },
      {
        field: 'by', header: 'By', width: 140, filter: 'set', sortable: false,
        setValues: () => facets.current.authors.map((x) => ({ key: x.id, label: x.author ? displayName(x.author) : '(Not recorded)', count: x.count }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      {
        field: 'at', header: 'When', width: 170, sort: 'desc', filter: false,
        render: ({ data }: { data: NoteRow }) => {
          const n = byAt.current.get(data.id);
          return n ? gridEsc(`${friendly(n.at)}${n.edited ? ' (edited)' : ''}`) : '';
        },
      },
    ],
  }), []);

  const sources = facets.current.sources.length;
  const summary = all ? `${all} ${all === 1 ? 'note' : 'notes'}${sources > 1 ? ` from ${sources} places` : ''}${total !== all ? `, ${total} shown by the filters` : ''}` : undefined;

  if (!loaded) return <p className="text-muted">Loading…</p>;

  return (
    <Section id="project.notes" title="Project notes" summary={summary}>
      {error && <p className="error">{error}</p>}
      <p className="hint mb-2">
        Every note on the project, newest first: notes on tasks and scenes, shot notes, shoot day notes, notes in a day's schedule and notes on
        people's calls. Select where a note was taken to open it there, where you can edit it. Filters and search cover every note.
      </p>
      <LatticeGrid stateId="project.notes" options={options} rows={rows} paging={paging} height={Math.min(140 + Math.max(rows.length, 3) * 56, 640)} />
    </Section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { LatticeGrid, gridEsc, gridLinkHtml } from '../../components/LatticeGrid';
import { Section } from '../../components/Section';
import { api, type NoteSource, type ProjectNote } from '../../lib/api';
import { displayName, errorText } from '../../lib/format';
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
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.projectNotes(projectId).then(setNotes, (e) => setError(errorText(e))).finally(() => setLoaded(true));
  }, [projectId]);

  const rows = useMemo<NoteRow[]>(() => notes.map((n) => {
    const { to, page } = linkFor(projectId, n);
    return {
      id: n.key, at: sortable(n.at), where: NOTE_SOURCES[n.source], item: n.item.label, detail: n.item.detail ?? '',
      note: n.body, by: n.author ? displayName(n.author) : '', to, title: `Open ${n.item.label} on the ${page} page`,
    };
  }), [notes, projectId]);
  const byAt = useMemo(() => new Map(notes.map((n) => [n.key, n])), [notes]);

  const options = useMemo(() => ({
    rowId: (r: NoteRow) => r.id,
    toolbar: { quickFilter: true },
    groupPanel: false, statusBar: false,
    emptyMessage: 'No notes yet',
    columns: [
      // The note comes first so it's what a phone shows; the rest scrolls sideways.
      { field: 'note', header: 'Note', width: 300, wrap: true },
      {
        field: 'item', header: 'Taken on', width: 210,
        render: ({ data }: { data: NoteRow }) => gridLinkHtml(data.item, data.to, data.title),
      },
      { field: 'detail', header: 'Part', width: 150 },
      { field: 'where', header: 'Where', width: 120, filter: 'set' },
      { field: 'by', header: 'By', width: 140, filter: 'set' },
      {
        field: 'at', header: 'When', width: 170, sort: 'desc', filter: false,
        render: ({ data }: { data: NoteRow }) => {
          const n = byAt.get(data.id);
          return n ? gridEsc(`${friendly(n.at)}${n.edited ? ' (edited)' : ''}`) : '';
        },
      },
    ],
  }), [byAt]);

  const sources = new Set(notes.map((n) => n.source)).size;
  const summary = notes.length ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}${sources > 1 ? ` from ${sources} places` : ''}` : undefined;

  if (!loaded) return <p className="text-muted">Loading…</p>;

  return (
    <Section id="project.notes" title="Project notes" summary={summary}>
      {error && <p className="error">{error}</p>}
      <p className="hint mb-2">
        Every note on the project, newest first: notes on tasks and scenes, shot notes, shoot day notes, notes in a day's schedule and notes on
        people's calls. Select where a note was taken to open it there, where you can edit it.
      </p>
      <LatticeGrid stateId="project.notes" options={options} rows={rows} height={Math.min(140 + rows.length * 56, 640)} />
    </Section>
  );
}

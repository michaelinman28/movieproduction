import { createRoute, z } from '@hono/zod-openapi';
import { authed, found, must } from '../context.ts';
import { IdParam, ProjectNote, ProjectNotePage, ProjectNoteQuery, SceneNote, TaskNoteInput } from '../schemas.ts';
import { body, errors, ok, profileFields, router, secured, send, withAuthors } from './common.ts';

// Scene notes (many per scene, like task notes), and every note on a project in one
// list for the Project Notes page. The project journal is separate and isn't here.
export const notes = router();
const sceneNoteTags = ['Scene notes'];

// deno-lint-ignore no-explicit-any
type Row = any;
type Db = Awaited<ReturnType<typeof authed>>['db'];
type Note = z.infer<typeof ProjectNote>;

// ---- Scene notes -------------------------------------------------------------

notes.openapi(createRoute({
  method: 'get', path: '/scenes/{id}/notes', tags: sceneNoteTags, security: secured,
  summary: 'Notes on a scene, oldest first',
  request: { params: IdParam },
  responses: { 200: ok(z.array(SceneNote)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const rows = must<Row[]>(await db.from('scene_notes').select('*').eq('scene_id', c.req.valid('param').id).order('created_at'));
  return send(c, await withAuthors(db, rows), 200);
});

notes.openapi(createRoute({
  method: 'post', path: '/scenes/{id}/notes', tags: sceneNoteTags, security: secured,
  summary: 'Add a note to a scene',
  description: 'Anyone on the project can add notes. The note is signed by the caller.',
  request: { params: IdParam, ...body(TaskNoteInput) },
  responses: { 201: ok(SceneNote, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const row = must<Row>(await db.from('scene_notes').insert({ scene_id: c.req.valid('param').id, body: c.req.valid('json').body }).select('*').single());
  return send(c, (await withAuthors(db, [row]))[0], 201);
});

notes.openapi(createRoute({
  method: 'patch', path: '/scene-notes/{id}', tags: sceneNoteTags, security: secured,
  summary: 'Edit your own scene note',
  request: { params: IdParam, ...body(TaskNoteInput) },
  responses: { 200: ok(SceneNote), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const row = found(must<Row[]>(await db.from('scene_notes').update({ body: c.req.valid('json').body }).eq('id', c.req.valid('param').id).select('*')));
  return send(c, (await withAuthors(db, [row]))[0], 200);
});

notes.openapi(createRoute({
  method: 'delete', path: '/scene-notes/{id}', tags: sceneNoteTags, security: secured,
  summary: 'Delete a scene note (its author, or a company admin)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  found(must(await db.from('scene_notes').delete().eq('id', c.req.valid('param').id).select('id')));
  return c.body(null, 204);
});

// ---- Every note on a project ---------------------------------------------------

const dayLabel = (d: Row) => {
  const date = new Date(`${d.shoot_date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return d.title ? `${date}: ${d.title}` : date;
};
const sceneLabel = (s: Row) => `Scene ${s.number}${s.set_name ? `: ${s.set_name}` : ''}`;
const personName = (p: Row) => p?.nickname || p?.full_name || p?.email || 'Someone';

/** Every note on the project, newest first. */
async function projectNotes(db: Db, id: string): Promise<Note[]> {
  const [tasks, scenes, shots, days, items, calls] = await Promise.all([
    db.from('tasks').select('id, title').eq('project_id', id),
    db.from('scenes').select('id, number, set_name').eq('project_id', id),
    db.from('shots').select('id, scene_id, sort_order, notes, note_by, note_at, updated_at').eq('project_id', id).order('sort_order'),
    db.from('shoot_days').select('id, shoot_date, title, notes, note_by, note_at, note, title_note_by, title_note_at, updated_at').eq('project_id', id),
    db.from('shoot_day_items').select('id, shoot_day_id, label, at_time, note_by, note_at, created_at').eq('project_id', id).eq('kind', 'note'),
    db.from('shoot_day_calls').select(`shoot_day_id, user_id, note, note_by, note_at, created_at, profile:profiles!shoot_day_calls_user_id_fkey(${profileFields})`).eq('project_id', id).not('note', 'is', null),
  ]).then((rs) => rs.map((r) => must<Row[]>(r)));
  const taskById = new Map(tasks.map((t: Row) => [t.id, t]));
  const sceneById = new Map(scenes.map((s: Row) => [s.id, s]));
  const dayById = new Map(days.map((d: Row) => [d.id, d]));

  const chars = must<Row[]>(await db.from('characters').select('id, name').eq('project_id', id));
  // Only company admins and the person a note is about can read team notes (the database decides).
  const teamRows = await withAuthors(db, must<Row[]>(await db.from('team_notes').select('*').eq('project_id', id)));
  const subjects = await withAuthors(db, [...new Set(teamRows.map((n: Row) => n.user_id))].map((author_id) => ({ author_id })));
  const subjectName = new Map(subjects.map((s) => [s.author_id, personName(s.author)]));
  const typeIds = [...new Set(teamRows.map((n: Row) => n.type_id).filter(Boolean))];
  const typeName = new Map(typeIds.length ? must<Row[]>(await db.from('team_note_types').select('id, name').in('id', typeIds)).map((t) => [t.id, t.name]) : []);
  const charById = new Map(chars.map((ch: Row) => [ch.id, ch]));
  const [taskNotes, sceneNotes, charNotes] = await Promise.all([
    tasks.length ? db.from('task_notes').select('*').in('task_id', tasks.map((t: Row) => t.id)) : { data: [], error: null },
    scenes.length ? db.from('scene_notes').select('*').in('scene_id', scenes.map((s: Row) => s.id)) : { data: [], error: null },
    chars.length ? db.from('character_notes').select('*').in('character_id', chars.map((ch: Row) => ch.id)) : { data: [], error: null },
  ]).then((rs) => rs.map((r) => must<Row[]>(r)));
  const [taskAuthored, sceneAuthored, charAuthored] = await Promise.all([withAuthors(db, taskNotes), withAuthors(db, sceneNotes), withAuthors(db, charNotes)]);
  // Notes kept in a field record who last wrote them (note_by) and when (note_at).
  const writerIds = [...new Set([...shots, ...days, ...items, ...calls].flatMap((r: Row) => [r.note_by, r.title_note_by]).filter(Boolean))];
  const writers = new Map((await withAuthors(db, writerIds.map((author_id) => ({ author_id })))).map((w) => [w.author_id, w.author]));
  const writer = (r: Row) => (r.note_by ? writers.get(r.note_by) ?? null : null);
  const titleWriter = (r: Row) => (r.title_note_by ? writers.get(r.title_note_by) ?? null : null);

  const out: z.infer<typeof ProjectNote>[] = [];
  for (const n of taskAuthored) {
    const t = taskById.get(n.task_id);
    out.push({ key: `task_note:${n.id}`, source: 'task', note_id: n.id, body: n.body, author: n.author, at: n.created_at, edited: n.updated_at > n.created_at,
      item: { kind: 'task', id: n.task_id, label: t?.title ?? 'Task', detail: null } });
  }
  for (const n of sceneAuthored) {
    const s = sceneById.get(n.scene_id);
    out.push({ key: `scene_note:${n.id}`, source: 'scene', note_id: n.id, body: n.body, author: n.author, at: n.created_at, edited: n.updated_at > n.created_at,
      item: { kind: 'scene', id: n.scene_id, label: s ? sceneLabel(s) : 'Scene', detail: null } });
  }
  for (const n of charAuthored) {
    const ch = charById.get(n.character_id);
    out.push({ key: `character_note:${n.id}`, source: 'character', note_id: n.id, body: n.body, author: n.author, at: n.created_at, edited: n.updated_at > n.created_at,
      item: { kind: 'character', id: n.character_id, label: ch?.name ?? 'Character', detail: null } });
  }
  for (const n of teamRows) {
    out.push({ key: `team_note:${n.id}`, source: 'team', note_id: n.id, body: n.body, author: n.author, at: n.created_at, edited: n.updated_at > n.created_at,
      item: { kind: 'team_member', id: n.user_id, label: subjectName.get(n.user_id) ?? 'Someone', detail: n.type_id ? typeName.get(n.type_id) ?? null : null } });
  }
  // Shots are numbered by their place in their scene's list.
  const shotNumber = new Map<string, number>();
  const perScene = new Map<string, number>();
  for (const sh of shots) {
    const n = (perScene.get(sh.scene_id) ?? 0) + 1;
    perScene.set(sh.scene_id, n);
    shotNumber.set(sh.id, n);
  }
  for (const sh of shots.filter((x: Row) => x.notes)) {
    const s = sceneById.get(sh.scene_id);
    out.push({ key: `shot:${sh.id}`, source: 'shot', note_id: null, body: sh.notes, author: writer(sh), at: sh.note_at ?? sh.updated_at, edited: false,
      item: { kind: 'scene', id: sh.scene_id, label: s ? sceneLabel(s) : 'Scene', detail: `Shot ${shotNumber.get(sh.id)}` } });
  }
  for (const d of days.filter((x: Row) => x.note)) {
    out.push({ key: `shoot_day_title:${d.id}`, source: 'shoot_day', note_id: null, body: d.note, author: titleWriter(d), at: d.title_note_at ?? d.updated_at, edited: false,
      item: { kind: 'shoot_day', id: d.id, label: dayLabel(d), detail: 'Title Note' } });
  }
  for (const d of days.filter((x: Row) => x.notes)) {
    out.push({ key: `shoot_day:${d.id}`, source: 'shoot_day', note_id: null, body: d.notes, author: writer(d), at: d.note_at ?? d.updated_at, edited: false,
      item: { kind: 'shoot_day', id: d.id, label: dayLabel(d), detail: 'Day notes' } });
  }
  for (const it of items) {
    const d = dayById.get(it.shoot_day_id);
    out.push({ key: `schedule:${it.id}`, source: 'schedule', note_id: null, body: it.label ?? '', author: writer(it), at: it.note_at ?? it.created_at, edited: false,
      item: { kind: 'shoot_day', id: it.shoot_day_id, label: d ? dayLabel(d) : 'Shoot day', detail: it.at_time ? `Schedule, ${String(it.at_time).slice(0, 5)}` : 'Schedule' } });
  }
  for (const cl of calls) {
    const d = dayById.get(cl.shoot_day_id);
    out.push({ key: `call:${cl.shoot_day_id}:${cl.user_id}`, source: 'call', note_id: null, body: cl.note, author: writer(cl), at: cl.note_at ?? cl.created_at, edited: false,
      item: { kind: 'shoot_day', id: cl.shoot_day_id, label: d ? dayLabel(d) : 'Shoot day', detail: `Call for ${personName(cl.profile)}` } });
  }
  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return out;
}

notes.openapi(createRoute({
  method: 'get', path: '/projects/{id}/notes', tags: ['Project notes'], security: secured,
  summary: 'Every note on the project, newest first',
  description: 'Task notes, scene notes, character notes, team member notes (only for company admins and the person they are about), shot notes, a shoot day\'s title note, a shoot day\'s call sheet notes, notes in a day\'s schedule and notes on people\'s calls, each with the item it was taken on so the app can link back to it. Journal entries are not included.',
  request: { params: IdParam },
  responses: { 200: ok(z.array(ProjectNote)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  return send(c, await projectNotes(db, c.req.valid('param').id), 200);
});

const list = (s: string | undefined) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

notes.openapi(createRoute({
  method: 'get', path: '/projects/{id}/notes/page', tags: ['Project notes'], security: secured,
  summary: 'One page of the project\'s notes, filtered and searched',
  description: 'The same notes as /projects/{id}/notes, one page at a time. Filter by where the note was taken (`sources`) and who wrote it (`author_ids`, "none" for unknown), '
    + 'search the note and what it was taken on (`q`), and sort newest or oldest first. `total` counts every match; `facets` count every note by where and by whom, for the filter lists.',
  request: { params: IdParam, query: ProjectNoteQuery },
  responses: { 200: ok(ProjectNotePage), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const f = c.req.valid('query');
  const all = await projectNotes(db, c.req.valid('param').id);
  const sources = list(f.sources), authors = list(f.author_ids);
  const words = (f.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const text = (n: Note) => [n.body, n.item.label, n.item.detail ?? '', n.author ? personName(n.author) : ''].join('\u0001').toLowerCase();
  const hits = all.filter((n) => (!sources.length || sources.includes(n.source))
    && (!authors.length || authors.includes(n.author?.id ?? 'none'))
    && words.every((w) => text(n).includes(w)));
  if (f.order === 'oldest') hits.reverse();
  const bySource = new Map<string, number>();
  const byAuthor = new Map<string, { author: Row; count: number }>();
  for (const n of all) {
    bySource.set(n.source, (bySource.get(n.source) ?? 0) + 1);
    const k = n.author?.id ?? 'none';
    byAuthor.set(k, { author: n.author, count: (byAuthor.get(k)?.count ?? 0) + 1 });
  }
  return send(c, {
    notes: hits.slice(f.offset, f.offset + f.limit), total: hits.length,
    facets: {
      sources: [...bySource].map(([source, count]) => ({ source, count })),
      authors: [...byAuthor].map(([id, v]) => ({ id, author: v.author ?? null, count: v.count })),
    },
  }, 200);
});

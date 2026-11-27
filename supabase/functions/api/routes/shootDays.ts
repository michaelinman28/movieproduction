import { createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { anonClient, authed, fail, found, must } from '../context.ts';
import {
  CallSheet, IdParam, LinkedCallSheet, ShareInput, ShareResult, SharedCallSheet, TokenParam, OrderInput, ShootDay, ShootDayCall, ShootDayCallInput, ShootDayInput, ShootDayItem,
  ShootDayItemInput, ShootDayItemUpdate, ShootDayUpdate, UserParams, WeatherLookup, WeatherResult,
} from '../schemas.ts';
import { body, errors, ok, profileFields, rolesByUser, router, secured, send } from './common.ts';

// Shoot days and their call sheets. Everyone on the project can plan days, call
// people and send the call sheet; whoever added a day, or a company admin, deletes
// it. Each person confirms only for themselves.
export const shootDays = router();
const tags = ['Shoot days'];
const sheetTags = ['Call sheets'];

// deno-lint-ignore no-explicit-any
type Row = any;
// deno-lint-ignore no-explicit-any
type Db = any;

/** Blank strings are stored as null. */
const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]));

/** Every column of shoot_days but the shared link code, which only crew can read (shoot_day_share_tokens). */
const DAY_COLS = 'id, project_id, shoot_date, title, crew_call, shooting_call, lunch, wrap, weather, sunrise, sunset, notes, '
  + 'version, sent_at, sent_by, created_by, created_at, updated_at, note_by, note_at, share_phones';

/** Days of a project with their number, scenes, pages and call counts (for cast only, just their own call). */
async function describeDays(db: Db, projectId: string, rows?: Row[]) {
  const [days, tokens] = await Promise.all([
    db.from('shoot_days').select(DAY_COLS).eq('project_id', projectId).order('shoot_date').order('created_at'),
    db.rpc('shoot_day_share_tokens', { pid: projectId }),
  ]);
  const shared = new Map(must<Row[]>(tokens).map((t) => [t.id, t.share_token]));
  const all = must<Row[]>(days).map((d) => ({ ...d, share_token: shared.get(d.id) ?? null }));
  const list = rows ? all.filter((d) => rows.some((r) => r.id === d.id)) : all;
  const ids = list.map((d) => d.id);
  const [items, calls, places] = ids.length
    ? await Promise.all([
      db.from('shoot_day_items').select('shoot_day_id, scene_id, sort_order, scenes(pages_eighths)').in('shoot_day_id', ids).eq('kind', 'scene').order('sort_order'),
      db.from('shoot_day_calls').select('shoot_day_id, confirmed_version').in('shoot_day_id', ids),
      db.from('shoot_day_locations').select('shoot_day_id, location_id').in('shoot_day_id', ids).order('sort_order'),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const itemRows = must<Row[]>(items);
  const callRows = must<Row[]>(calls);
  const placeRows = must<Row[]>(places);
  return list.map((d) => {
    const mine = itemRows.filter((i) => i.shoot_day_id === d.id);
    const called = callRows.filter((c) => c.shoot_day_id === d.id);
    return {
      ...d,
      location_ids: placeRows.filter((p) => p.shoot_day_id === d.id).map((p) => p.location_id),
      day_number: all.findIndex((x) => x.id === d.id) + 1,
      total_days: all.length,
      scene_ids: mine.map((i) => i.scene_id),
      pages_eighths: mine.reduce((n, i) => n + (i.scenes?.pages_eighths ?? 0), 0),
      called: called.length,
      confirmed: d.version ? called.filter((c) => c.confirmed_version === d.version).length : 0,
    };
  });
}

/** Makes a day's locations exactly `ids`, in that order (the first is the main one). */
async function setDayLocations(db: Db, dayId: string, ids: string[]) {
  const want = [...new Set(ids)];
  const have = must<Row[]>(await db.from('shoot_day_locations').select('location_id, sort_order').eq('shoot_day_id', dayId));
  const remove = have.filter((h) => !want.includes(h.location_id)).map((h) => h.location_id);
  if (remove.length) must(await db.from('shoot_day_locations').delete().eq('shoot_day_id', dayId).in('location_id', remove));
  for (const [i, locationId] of want.entries()) {
    const at = have.find((h) => h.location_id === locationId);
    if (!at) must(await db.from('shoot_day_locations').insert({ shoot_day_id: dayId, location_id: locationId, project_id: null, sort_order: i + 1 }));
    else if (at.sort_order !== i + 1) must(await db.from('shoot_day_locations').update({ sort_order: i + 1 }).eq('shoot_day_id', dayId).eq('location_id', locationId));
  }
}

async function oneDay(db: Db, id: string) {
  const row = found(must<Row[]>(await db.from('shoot_days').select('id, project_id').eq('id', id)));
  return (await describeDays(db, row.project_id, [row]))[0];
}

/** A day's calls with each person's profile and project roles, cast (with a character) first. */
async function callsFor(db: Db, day: Row) {
  const [calls, roles, chars, members] = await Promise.all([
    db.from('shoot_day_calls').select(`*, profile:profiles!shoot_day_calls_user_id_fkey(${profileFields})`).eq('shoot_day_id', day.id),
    db.from('project_member_roles').select('user_id, role_id').eq('project_id', day.project_id),
    db.from('characters').select('name, cast_number, actor_id').eq('project_id', day.project_id).not('actor_id', 'is', null)
      .order('cast_number', { ascending: true, nullsFirst: false }).order('name'),
    db.from('project_members').select('user_id, dietary, dietary_allergy').eq('project_id', day.project_id).not('dietary', 'is', null),
  ]);
  const byUser = rolesByUser(must(roles));
  // The characters each person plays, and their dietary needs (for catering).
  const plays = new Map<string, { name: string; cast_number: number | null }[]>();
  for (const ch of must<Row[]>(chars)) plays.set(ch.actor_id, [...(plays.get(ch.actor_id) ?? []), { name: ch.name, cast_number: ch.cast_number }]);
  const food = new Map(must<Row[]>(members).map((m) => [m.user_id, { needs: m.dietary, allergy: m.dietary_allergy }]));
  return must<Row[]>(calls).map((c) => ({
    ...c, role_ids: byUser.get(c.user_id) ?? [], characters: plays.get(c.user_id) ?? [], dietary: food.get(c.user_id) ?? null,
  }));
}

// ---- Days -------------------------------------------------------------------

shootDays.openapi(createRoute({
  method: 'get', path: '/projects/{id}/shoot-days', tags, security: secured,
  summary: 'The project\'s shoot days, by date, with their number, scenes, pages and confirmations',
  request: { params: IdParam },
  responses: { 200: ok(z.array(ShootDay)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  return send(c, await describeDays(db, c.req.valid('param').id), 200);
});

shootDays.openapi(createRoute({
  method: 'post', path: '/projects/{id}/shoot-days', tags, security: secured,
  summary: 'Add a shoot day (crew on the project)',
  request: { params: IdParam, ...body(ShootDayInput) },
  responses: { 201: ok(ShootDay, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const { location_ids, ...fields } = c.req.valid('json');
  const row = must<Row>(await db.from('shoot_days').insert({ ...clean(fields), project_id: id }).select('id').single());
  if (location_ids?.length) await setDayLocations(db, row.id, location_ids);
  return send(c, await oneDay(db, row.id), 201);
});

shootDays.openapi(createRoute({
  method: 'patch', path: '/shoot-days/{id}', tags, security: secured,
  summary: 'Change a shoot day (crew on the project). Send the call sheet again to share the change',
  request: { params: IdParam, ...body(ShootDayUpdate) },
  responses: { 200: ok(ShootDay), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const { location_ids, ...fields } = c.req.valid('json');
  if (Object.keys(fields).length) found(must<Row[]>(await db.from('shoot_days').update(clean(fields)).eq('id', id).select('id')));
  else found(must<Row[]>(await db.from('shoot_days').select('id').eq('id', id)));
  if (location_ids) await setDayLocations(db, id, location_ids);
  return send(c, await oneDay(db, id), 200);
});

shootDays.openapi(createRoute({
  method: 'delete', path: '/shoot-days/{id}', tags, security: secured,
  summary: 'Delete a shoot day (whoever added it, if crew, or a company admin)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  found(must(await db.from('shoot_days').delete().eq('id', c.req.valid('param').id).select('id')));
  return c.body(null, 204);
});

// ---- The day's schedule -----------------------------------------------------

shootDays.openapi(createRoute({
  method: 'post', path: '/shoot-days/{id}/items', tags, security: secured,
  summary: 'Add a scene, meal break, company move or note to the end of the day',
  request: { params: IdParam, ...body(ShootDayItemInput) },
  responses: { 201: ok(ShootDayItem, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const row = must<Row>(await db.from('shoot_day_items').insert({ ...clean(c.req.valid('json')), shoot_day_id: c.req.valid('param').id }).select('*').single());
  return send(c, row, 201);
});

shootDays.openapi(createRoute({
  method: 'put', path: '/shoot-days/{id}/item-order', tags, security: secured,
  summary: 'Put the day\'s schedule in a new order',
  request: { params: IdParam, ...body(OrderInput) },
  responses: { 204: { description: 'Reordered' }, 400: errors[400], 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const ids = c.req.valid('json').ids;
  const have = new Set(must<{ id: string }[]>(await db.from('shoot_day_items').select('id').eq('shoot_day_id', id)).map((r) => r.id));
  if (ids.length !== have.size || new Set(ids).size !== ids.length || ids.some((x) => !have.has(x))) {
    return c.json({ error: 'List every item on the day exactly once, in the new order.' }, 400);
  }
  for (const [i, itemId] of ids.entries()) must(await db.from('shoot_day_items').update({ sort_order: i + 1 }).eq('id', itemId).select('id'));
  return c.body(null, 204);
});

shootDays.openapi(createRoute({
  method: 'patch', path: '/shoot-day-items/{id}', tags, security: secured,
  summary: 'Change an item\'s time or words',
  request: { params: IdParam, ...body(ShootDayItemUpdate) },
  responses: { 200: ok(ShootDayItem), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  return send(c, found(must<Row[]>(await db.from('shoot_day_items').update(clean(c.req.valid('json'))).eq('id', c.req.valid('param').id).select('*'))), 200);
});

shootDays.openapi(createRoute({
  method: 'delete', path: '/shoot-day-items/{id}', tags, security: secured,
  summary: 'Take an item off the day (a scene stays scheduled until you change its status)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  found(must(await db.from('shoot_day_items').delete().eq('id', c.req.valid('param').id).select('id')));
  return c.body(null, 204);
});

// ---- Calls ------------------------------------------------------------------

shootDays.openapi(createRoute({
  method: 'get', path: '/shoot-days/{id}/calls', tags, security: secured,
  summary: 'Who is called on the day, with their call times and confirmations',
  request: { params: IdParam },
  responses: { 200: ok(z.array(ShootDayCall)), 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const day = found(must<Row[]>(await db.from('shoot_days').select('id, project_id').eq('id', c.req.valid('param').id)));
  return send(c, await callsFor(db, day), 200);
});

shootDays.openapi(createRoute({
  method: 'put', path: '/shoot-days/{id}/calls/{userId}', tags, security: secured,
  summary: 'Call someone on the project, or change their call',
  request: { params: UserParams, ...body(ShootDayCallInput) },
  responses: { 200: ok(z.object({ ok: z.literal(true) })), 400: errors[400], 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id, userId } = c.req.valid('param');
  const fields = clean(c.req.valid('json'));
  const existing = must<Row[]>(await db.from('shoot_day_calls').select('user_id').eq('shoot_day_id', id).eq('user_id', userId));
  if (existing.length) must(await db.from('shoot_day_calls').update(fields).eq('shoot_day_id', id).eq('user_id', userId).select('user_id'));
  // The database fills in project_id from the day; it's required, so send a placeholder.
  else must(await db.from('shoot_day_calls').insert({ ...fields, shoot_day_id: id, user_id: userId, project_id: '00000000-0000-0000-0000-000000000000' }).select('user_id'));
  return send(c, { ok: true }, 200);
});

shootDays.openapi(createRoute({
  method: 'post', path: '/shoot-days/{id}/calls/everyone', tags, security: secured,
  summary: 'Call everyone on the project team who isn\'t called yet, at the crew call',
  request: { params: IdParam },
  responses: { 200: ok(z.object({ added: z.number().int() })), 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const day = found(must<Row[]>(await db.from('shoot_days').select('id, project_id').eq('id', c.req.valid('param').id)));
  const [team, called] = await Promise.all([
    db.from('project_members').select('user_id').eq('project_id', day.project_id),
    db.from('shoot_day_calls').select('user_id').eq('shoot_day_id', day.id),
  ]);
  const have = new Set(must<Row[]>(called).map((r) => r.user_id));
  const add = must<Row[]>(team).filter((r) => !have.has(r.user_id))
    .map((r) => ({ shoot_day_id: day.id, user_id: r.user_id, project_id: day.project_id }));
  if (add.length) must(await db.from('shoot_day_calls').insert(add).select('user_id'));
  return send(c, { added: add.length }, 200);
});

shootDays.openapi(createRoute({
  method: 'delete', path: '/shoot-days/{id}/calls/{userId}', tags, security: secured,
  summary: 'Take someone off the day',
  request: { params: UserParams },
  responses: { 204: { description: 'Removed' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id, userId } = c.req.valid('param');
  found(must(await db.from('shoot_day_calls').delete().eq('shoot_day_id', id).eq('user_id', userId).select('user_id')));
  return c.body(null, 204);
});

// ---- The call sheet ---------------------------------------------------------

shootDays.openapi(createRoute({
  method: 'get', path: '/shoot-days/{id}/call-sheet', tags: sheetTags, security: secured,
  summary: 'Everything on a day\'s call sheet: the day, its locations, schedule, scenes, cast and crew, and a look at the next day',
  request: { params: IdParam },
  responses: { 200: ok(CallSheet), 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const day = await oneDay(db, c.req.valid('param').id);
  const all = await describeDays(db, day.project_id);
  const next = all[day.day_number] ?? null; // day_number is 1-based, so this is the following day
  const sceneIds = [...new Set([...day.scene_ids, ...(next?.scene_ids ?? [])])];
  const [items, scenes, calls, elems] = await Promise.all([
    db.from('shoot_day_items').select('*').eq('shoot_day_id', day.id).order('sort_order'),
    sceneIds.length ? db.from('scenes').select('*').in('id', sceneIds) : { data: [], error: null },
    callsFor(db, day),
    db.rpc('call_sheet_elements', { day: day.id }),
  ]);
  const sceneRows = must<Row[]>(scenes);
  // Today's locations, the next day's, and any scene location (so a name still shows if it was taken off the day).
  const locIds = [...new Set([...day.location_ids, ...(next?.location_ids ?? []), ...sceneRows.map((s) => s.location_id).filter(Boolean)])];
  const loc = locIds.length ? must<Row[]>(await db.from('project_locations').select('*').in('id', locIds)) : [];
  const byId = new Map(loc.map((l) => [l.id, l]));
  const named = (s: Row) => ({ ...s, location_name: s.location_id ? byId.get(s.location_id)?.name ?? null : null });
  const pick = (ids: string[]) => ids.map((id) => sceneRows.find((s) => s.id === id)).filter(Boolean).map(named);
  const places = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean).map((l) => ({ id: l.id, name: l.name }));
  return send(c, {
    day,
    locations: day.location_ids.map((lid: string) => byId.get(lid)).filter(Boolean),
    items: must<Row[]>(items),
    scenes: pick(day.scene_ids),
    calls,
    next_day: next ? { day: next, locations: places(next.location_ids), scenes: pick(next.scene_ids) } : null,
    elements: must<Row[]>(elems) ?? [],
  }, 200);
});

shootDays.openapi(createRoute({
  method: 'post', path: '/shoot-days/{id}/send', tags: sheetTags, security: secured,
  summary: 'Send the call sheet: makes the next version, which everyone called is asked to confirm',
  description: 'There is no email server: the app then opens the sender\'s own email app, or copies the message, to share the link.',
  request: { params: IdParam },
  responses: { 200: ok(ShootDay), 401: errors[401], 403: errors[403], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const r = await db.rpc('publish_call_sheet', { day: id });
  if (r.error) fail(r.error);
  return send(c, await oneDay(db, id), 200);
});

shootDays.openapi(createRoute({
  method: 'post', path: '/shoot-days/{id}/viewed', tags: sheetTags, security: secured,
  summary: 'Record that you opened the sent call sheet',
  request: { params: IdParam },
  responses: { 204: { description: 'Recorded' }, 400: errors[400], 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const r = await db.rpc('mark_call_sheet', { day: c.req.valid('param').id, confirm: false });
  if (r.error) fail(r.error);
  return c.body(null, 204);
});

shootDays.openapi(createRoute({
  method: 'post', path: '/shoot-days/{id}/confirm', tags: sheetTags, security: secured,
  summary: 'Confirm you got the latest call sheet',
  request: { params: IdParam },
  responses: { 204: { description: 'Confirmed' }, 400: errors[400], 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const r = await db.rpc('mark_call_sheet', { day: c.req.valid('param').id, confirm: true });
  if (r.error) fail(r.error);
  return c.body(null, 204);
});

shootDays.openapi(createRoute({
  method: 'get', path: '/call-sheet-links/{token}', tags: sheetTags,
  summary: 'A personal call sheet link: the sent call sheet, view only, with no sign-in',
  description: 'Each person called on a day has their own link token (ShootDayCall.link_token). Whoever has the link can read that day\'s '
    + 'sent call sheet and see which call is theirs (`me`); nothing can be changed through it. Opening it counts as that person viewing '
    + 'the sent version. Unknown links, and sheets not sent yet, give 404.',
  request: { params: TokenParam },
  responses: { 200: ok(LinkedCallSheet), 404: errors[404] },
}), async (c) => {
  const r = await anonClient(c).rpc('call_sheet_for_link', { token: c.req.valid('param').token });
  if (r.error) fail(r.error);
  if (!r.data) throw new HTTPException(404, { message: 'This call sheet link isn\'t working. It may not be sent yet, or you\'re no longer called on this day.' });
  c.header('Cache-Control', 'no-store');
  return send(c, r.data, 200);
});

shootDays.openapi(createRoute({
  method: 'post', path: '/call-sheet-links/{token}/confirm', tags: sheetTags,
  summary: 'Confirm, from a personal call sheet link, that its person got the sent version (no sign-in)',
  request: { params: TokenParam },
  responses: { 204: { description: 'Confirmed' }, 404: errors[404] },
}), async (c) => {
  const r = await anonClient(c).rpc('confirm_call_sheet_link', { token: c.req.valid('param').token });
  if (r.error) {
    if (r.error.code === 'P0002') throw new HTTPException(404, { message: 'This call sheet link isn\'t working. It may not be sent yet, or you\'re no longer called on this day.' });
    fail(r.error);
  }
  return c.body(null, 204);
});

shootDays.openapi(createRoute({
  method: 'post', path: '/shoot-days/{id}/share', tags: sheetTags, security: secured,
  summary: 'Turn the day\'s shared call sheet link on or off, make a new one, or choose whether it shows phones',
  description: 'The shared link is one view-only page of the whole sent call sheet, for anyone who has it, with no sign-in. '
    + 'It never shows emails; phone numbers only when `phones` is on. Crew on the project can change it.',
  request: { params: IdParam, ...body(ShareInput) },
  responses: { 200: ok(ShareResult), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const b = c.req.valid('json');
  const r = await db.rpc('share_call_sheet', { day: id, enabled: b.enabled, new_link: b.new_link ?? false, phones: b.phones ?? null });
  if (r.error) fail(r.error);
  const row = found(must<Row[]>(await db.from('shoot_days').select('project_id, share_phones').eq('id', id)));
  const tokens = must<Row[]>(await db.rpc('shoot_day_share_tokens', { pid: row.project_id }));
  return send(c, { share_token: tokens.find((t) => t.id === id)?.share_token ?? null, share_phones: row.share_phones }, 200);
});

shootDays.openapi(createRoute({
  method: 'get', path: '/shared-call-sheets/{token}', tags: sheetTags,
  summary: 'A shared call sheet link: the whole sent call sheet, view only, with no sign-in',
  description: 'Whoever has the link (ShootDay.share_token) can read the day\'s sent call sheet; nothing can be changed through it, '
    + 'and nobody is marked as viewing or confirming. No emails; phones only if the sharer chose. Unknown or turned-off links, '
    + 'and sheets not sent yet, give 404.',
  request: { params: TokenParam },
  responses: { 200: ok(SharedCallSheet), 404: errors[404] },
}), async (c) => {
  const r = await anonClient(c).rpc('call_sheet_for_share', { token: c.req.valid('param').token });
  if (r.error) fail(r.error);
  if (!r.data) throw new HTTPException(404, { message: 'This call sheet link isn\'t working. It may have been turned off or replaced with a new link.' });
  c.header('Cache-Control', 'no-store');
  return send(c, r.data, 200);
});

// ---- Weather ----------------------------------------------------------------

// Open-Meteo weather codes, in words.
const WEATHER: [number, string][] = [
  [0, 'Clear'], [1, 'Mostly clear'], [2, 'Partly cloudy'], [3, 'Overcast'], [45, 'Fog'], [48, 'Freezing fog'],
  [51, 'Light drizzle'], [53, 'Drizzle'], [55, 'Heavy drizzle'], [56, 'Freezing drizzle'], [57, 'Freezing drizzle'],
  [61, 'Light rain'], [63, 'Rain'], [65, 'Heavy rain'], [66, 'Freezing rain'], [67, 'Freezing rain'],
  [71, 'Light snow'], [73, 'Snow'], [75, 'Heavy snow'], [77, 'Snow grains'], [80, 'Light showers'], [81, 'Showers'],
  [82, 'Heavy showers'], [85, 'Snow showers'], [86, 'Heavy snow showers'], [95, 'Thunderstorms'], [96, 'Thunderstorms with hail'], [99, 'Thunderstorms with hail'],
];

/** Place names to try from an address: '112 Main St, Hudson, NY 12534' -> ['Hudson', ...]. */
function placeNames(address: string) {
  const parts = address.split(/[,\n]/).map((p) => p.replace(/\b\d{5}(-\d{4})?\b/g, '').replace(/\b[A-Z]{2}\b/g, '').trim()).filter(Boolean);
  const tries = parts.length > 1 ? [...parts.slice(1), parts[0]] : parts;
  return tries.filter((p) => !/^\d/.test(p) && p.length > 1);
}

async function getJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new HTTPException(502, { message: 'The weather service didn\'t answer. Try again, or type the weather in.' });
  return res.json();
}

shootDays.openapi(createRoute({
  method: 'post', path: '/shoot-days/{id}/weather', tags, security: secured,
  summary: 'Look up the forecast, sunrise and sunset for the day\'s main location and date',
  description: 'Uses Open-Meteo. Nothing is saved: the app puts the result in the day\'s form, and Save day stores it. '
    + 'Pass shoot_date and location_id to look up what the form shows before it is saved. Forecasts reach about 16 days ahead; for later dates, type the weather in.',
  request: { params: IdParam, body: { required: false, content: { 'application/json': { schema: WeatherLookup } } } },
  responses: { 200: ok(WeatherResult), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const ask = c.req.valid('json') ?? {};
  const saved = found(must<Row[]>(await db.from('shoot_days').select('id, project_id, shoot_date').eq('id', id)));
  const main = must<Row[]>(await db.from('shoot_day_locations').select('location_id').eq('shoot_day_id', id).order('sort_order').limit(1))[0];
  const day = { shoot_date: ask.shoot_date ?? saved.shoot_date, location_id: ask.location_id ?? main?.location_id ?? null };
  const loc = day.location_id
    ? must<Row[]>(await db.from('project_locations').select('address').eq('id', day.location_id).eq('project_id', saved.project_id))[0] : null;
  if (!loc?.address) return c.json({ error: 'Give the day a location with an address first.' }, 400);
  const daysAhead = Math.round((Date.parse(day.shoot_date) - Date.now()) / 864e5);
  if (daysAhead > 15) return c.json({ error: 'Forecasts only reach about 16 days ahead. Look it up closer to the day, or type it in.' }, 400);
  if (daysAhead < -1) return c.json({ error: 'That day has passed, so there is no forecast to look up.' }, 400);
  let place: Row = null;
  for (const name of placeNames(loc.address)) {
    const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(name)}`);
    if (g.results?.length) { place = g.results[0]; break; }
  }
  if (!place) return c.json({ error: `Couldn't find a town in "${loc.address}". Add the town to the location's address, or type the weather in.` }, 400);
  const f = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset`
    + `&temperature_unit=fahrenheit&timezone=auto&start_date=${day.shoot_date}&end_date=${day.shoot_date}`);
  const d = f.daily;
  if (!d?.time?.length) return c.json({ error: 'No forecast for that date yet. Try again closer to the day.' }, 400);
  const words = WEATHER.find(([code]) => code === d.weather_code[0])?.[1] ?? 'Forecast';
  const rain = d.precipitation_probability_max?.[0];
  const weather = `${words}, ${Math.round(d.temperature_2m_min[0])}°F to ${Math.round(d.temperature_2m_max[0])}°F${rain != null ? `, ${rain}% chance of rain` : ''}`;
  const sunrise = String(d.sunrise[0]).slice(11, 16), sunset = String(d.sunset[0]).slice(11, 16);
  return send(c, { weather, sunrise, sunset, place: [place.name, place.admin1].filter(Boolean).join(', ') }, 200);
});

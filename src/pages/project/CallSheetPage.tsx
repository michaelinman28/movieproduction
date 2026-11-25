import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Section } from '../../components/Section';
import { api, type CallSheet, type ShootDayCall } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { callSheetMailto, copyCallSheet } from '../../lib/callSheet';
import {
  SCENE_INT_EXT, SCENE_TIMES, SHOOT_ITEM_KINDS, clockLabel, displayName, errorText, labelOf, longDate, pagesLabel, shortDate,
} from '../../lib/format';
import { mapsLinkProps } from '../../lib/maps';
import { callStatus, departmentOf } from './ProjectShootDays';
import { useProject } from './ProjectLayout';

// Roles listed as key contacts at the top of the sheet, in this order.
const KEY_ROLES = ['Producer', 'Line Producer', 'Production Manager', 'Director', '1st Assistant Director', '2nd Assistant Director', 'Production Coordinator', 'Location Manager'];

const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;

/**
 * A shoot day's call sheet, built from the day: times, weather, location, the day's
 * scenes and breaks, cast and crew with their own calls, notes, and the next day.
 * Anyone on the project can send it (a new version); everyone called sees their own
 * call at the top and confirms. It prints cleanly.
 */
export function CallSheetPage() {
  const { dayId = '' } = useParams();
  const { project, projectId, roles } = useProject();
  const { session } = useAuth();
  const me = session?.user.id;
  const [sheet, setSheet] = useState<CallSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try { setSheet(await api.callSheet(dayId)); } catch (e) { setError(errorText(e)); }
  }, [dayId]);
  useEffect(() => { load(); }, [load]);

  const mine = sheet?.calls.find((c) => c.user_id === me) ?? null;
  // Opening a sent sheet you're called on counts as viewing it.
  useEffect(() => {
    if (sheet && mine && sheet.day.version && mine.viewed_version !== sheet.day.version) api.viewedCallSheet(dayId).then(load).catch(() => undefined);
  }, [sheet, mine, dayId, load]);

  const text = { projectName: project.name, url: window.location.href };

  async function send() {
    if (!sheet) return;
    const next = sheet.day.version + 1;
    if (sheet.day.version && !window.confirm(`Send version ${next}? Everyone called will be asked to confirm again.`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.sendCallSheet(dayId);
      await load();
      setJustSent(true);
      setNotice(`Version ${next} is ready. Now let people know: email everyone, or copy the message to send another way.`);
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  }

  async function confirm() {
    setBusy(true); setError(null);
    try { await api.confirmCallSheet(dayId); await load(); setNotice('Thanks, you\'re confirmed for this version.'); } catch (e) { setError(errorText(e)); }
    setBusy(false);
  }

  const roleName = useCallback((c: ShootDayCall) => roles.filter((r) => c.role_ids.includes(r.id)).map((r) => r.name).join(', '), [roles]);
  const groups = useMemo(() => {
    if (!sheet) return { cast: [] as ShootDayCall[], crew: [] as [string, ShootDayCall[]][], keys: [] as { role: string; c: ShootDayCall }[] };
    const cast = sheet.calls.filter((c) => c.character_name).sort((a, b) => (a.call_time ?? '').localeCompare(b.call_time ?? '') || displayName(a.profile).localeCompare(displayName(b.profile)));
    const byDept = new Map<string, ShootDayCall[]>();
    for (const c of sheet.calls.filter((x) => !x.character_name)) {
      const d = departmentOf(c.role_ids, roles) || 'Other';
      byDept.set(d, [...(byDept.get(d) ?? []), c]);
    }
    const order = ['Producing', 'Directing', 'Camera', 'Grip', 'Lighting', 'Sound', 'Art', 'Wardrobe', 'Locations', 'Cast', 'Casting', 'Writing', 'Post', 'Accounts', 'Other'];
    const rank = (d: string) => (order.includes(d) ? order.indexOf(d) : order.length);
    const crew = [...byDept.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
    const keys: { role: string; c: ShootDayCall }[] = [];
    for (const role of KEY_ROLES) {
      const r = roles.find((x) => x.name === role);
      if (!r) continue;
      for (const c of sheet.calls) if (c.role_ids.includes(r.id) && !keys.some((k) => k.c.user_id === c.user_id)) keys.push({ role, c });
    }
    return { cast, crew, keys };
  }, [sheet, roles]);

  if (error && !sheet) return <p className="error">{error} <Link to={`/projects/${projectId}/shoot-days`}>Back to shoot days</Link></p>;
  if (!sheet) return <p className="text-muted">Loading…</p>;
  const { day, location: loc } = sheet;
  const crewCall = clockLabel(day.crew_call);
  const callOf = (c: ShootDayCall) => clockLabel(c.call_time) || crewCall;
  const scenesTotal = sheet.scenes.reduce((n, s) => n + (s.pages_eighths ?? 0), 0);
  const status = (c: ShootDayCall) => callStatus(day, c);

  return (
    <div className="call-sheet flex flex-col gap-4">
      <p className="no-print text-sm"><Link to={`/projects/${projectId}/shoot-days`}>Shoot days</Link> / Call sheet</p>

      {mine && (
        <div className="no-print flex flex-col gap-2 rounded-lg border-2 border-accent bg-accent-soft p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-lg">
            Your call: <strong>{callOf(mine) || 'not set yet'}</strong>
            {mine.character_name && <span className="text-muted"> as {mine.character_name}</span>}
            {mine.pickup_time && <span className="text-muted">, pickup {clockLabel(mine.pickup_time)}</span>}
            {mine.note && <span className="block text-sm text-muted">{mine.note}</span>}
          </p>
          {day.version > 0 && (mine.confirmed_version === day.version
            ? <span className="font-semibold text-accent-strong">Confirmed version {day.version}</span>
            : <button className="btn" disabled={busy} onClick={confirm}>Confirm I got it</button>)}
        </div>
      )}

      <div className="no-print">
      <Section id="callSheet.send" title="Send" summary={day.version ? `Version ${day.version}, ${day.confirmed} of ${day.called} confirmed` : 'Not sent yet'}>
        <div className="no-print flex flex-col gap-2" data-pin-scope>
          <p className="m-0 text-sm">
            {day.version
              ? <>Version {day.version} was sent {day.sent_at ? new Date(day.sent_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}. Changes to the day reach people when you send a new version.</>
              : <>Check the sheet below, then send it. Everyone called gets asked to confirm.</>}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button className="btn" data-pin disabled={busy || !sheet.calls.length} onClick={send}>Send version {day.version + 1}</button>
            {day.version > 0 && <a className={`btn no-underline ${justSent ? '' : 'btn-secondary'}`} href={callSheetMailto(sheet, text)}>Email everyone</a>}
            {day.version > 0 && <button type="button" className="btn btn-secondary" onClick={async () => setCopied(await copyCallSheet(sheet, text))}>Copy message</button>}
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print</button>
          </div>
          {!sheet.calls.length && <p className="hint m-0">Call people on the day first (Shoot days page).</p>}
          {copied === true && <p className="hint m-0">Copied. Paste it into a text, chat or email.</p>}
          {copied === false && <p className="error m-0">Your browser didn't allow copying. Use Email everyone instead.</p>}
          {notice && <p className="notice m-0">{notice}</p>}
          {error && <p className="error m-0">{error}</p>}
          <p className="hint m-0">Email everyone opens your own email app with everyone called in Bcc. People without an account can read the email; signing in lets them confirm.</p>
        </div>
      </Section>
      </div>

      <article className="sheet card gap-4">
        <header className="flex flex-col gap-3 border-b border-line pb-3 md:flex-row md:justify-between">
          <div>
            <p className="m-0 text-sm text-muted">{project.company.name}</p>
            <h2 className="m-0 text-2xl">{project.name}</h2>
            <p className="m-0 text-lg font-semibold">Day {day.day_number} of {day.total_days}: {longDate(day.shoot_date)}</p>
            {day.title && <p className="m-0 text-muted">{day.title}</p>}
            <p className="m-0 text-sm text-muted">{day.version ? `Version ${day.version}` : 'Draft, not sent'}</p>
          </div>
          <dl className="sheet-times grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:min-w-64">
            <dt>Crew call</dt><dd className="text-lg font-bold">{crewCall || '—'}</dd>
            <dt>Shooting call</dt><dd>{clockLabel(day.shooting_call) || '—'}</dd>
            <dt>Lunch</dt><dd>{clockLabel(day.lunch) || '—'}</dd>
            <dt>Est. wrap</dt><dd>{clockLabel(day.wrap) || '—'}</dd>
          </dl>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <h3 className="sheet-h">Location</h3>
            {loc ? (
              <>
                <p className="m-0 font-semibold">{loc.name}</p>
                {loc.address && <p className="m-0"><a {...mapsLinkProps(loc.address)}>{loc.address}</a></p>}
                {loc.parking && <p className="m-0 text-sm"><span className="text-muted">Parking:</span> {loc.parking}</p>}
                {loc.contact_name && <p className="m-0 text-sm"><span className="text-muted">On site:</span> {loc.contact_name}{loc.contact_phone && <> <a href={tel(loc.contact_phone)}>{loc.contact_phone}</a></>}</p>}
              </>
            ) : <p className="m-0 text-muted">No location set</p>}
          </div>
          <div>
            <h3 className="sheet-h">Nearest hospital</h3>
            {loc?.nearest_hospital
              ? <p className="m-0"><a {...mapsLinkProps(loc.nearest_hospital)}>{loc.nearest_hospital}</a></p>
              : <p className="m-0 text-muted">Not set (add it to the location)</p>}
            <h3 className="sheet-h mt-3">Weather</h3>
            <p className="m-0">{day.weather || <span className="text-muted">Not set</span>}</p>
            {(day.sunrise || day.sunset) && <p className="m-0 text-sm">Sunrise {clockLabel(day.sunrise) || '—'}, sunset {clockLabel(day.sunset) || '—'}</p>}
          </div>
          <div>
            <h3 className="sheet-h">Key contacts</h3>
            {groups.keys.length ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                {groups.keys.map(({ role, c }) => (
                  <li key={c.user_id}><span className="text-muted">{role}:</span> {displayName(c.profile)}{c.profile.phone && <> <a href={tel(c.profile.phone)}>{c.profile.phone}</a></>}</li>
                ))}
              </ul>
            ) : <p className="m-0 text-sm text-muted">Give people roles like Producer or 1st Assistant Director to list them here.</p>}
          </div>
        </div>

        <Section id="callSheet.scenes" title="Scenes" summary={sheet.scenes.length ? `${sheet.scenes.length}, ${pagesLabel(scenesTotal)} pages` : undefined}>
          <div className="sheet-table">
            <table>
              <thead><tr><th>Time</th><th>Scene</th><th>Set</th><th>I/E, D/N</th><th>Pages</th><th>Cast</th><th>Notes</th></tr></thead>
              <tbody>
                {sheet.items.map((i) => {
                  const time = clockLabel(i.at_time);
                  if (i.kind !== 'scene') {
                    return <tr key={i.id} className="sheet-break"><td>{time}</td><td colSpan={6}><strong>{labelOf(SHOOT_ITEM_KINDS, i.kind)}</strong>{i.label ? `: ${i.label}` : ''}</td></tr>;
                  }
                  const s = sheet.scenes.find((x) => x.id === i.scene_id);
                  if (!s) return null;
                  return (
                    <tr key={i.id}>
                      <td>{time}</td>
                      <td className="font-semibold">{s.number}</td>
                      <td>{s.set_name}{s.synopsis && <span className="block text-xs text-muted">{s.synopsis}</span>}</td>
                      <td>{[s.int_ext && labelOf(SCENE_INT_EXT, s.int_ext), s.time_of_day && labelOf(SCENE_TIMES, s.time_of_day)].filter(Boolean).join(' / ')}</td>
                      <td>{pagesLabel(s.pages_eighths)}</td>
                      <td>{s.characters}</td>
                      <td className="text-xs">{s.needs}</td>
                    </tr>
                  );
                })}
                {!sheet.items.length && <tr><td colSpan={7} className="text-muted">Nothing scheduled yet</td></tr>}
              </tbody>
              {sheet.scenes.length > 0 && <tfoot><tr><td colSpan={4}>Total</td><td>{pagesLabel(scenesTotal)}</td><td colSpan={2} /></tr></tfoot>}
            </table>
          </div>
        </Section>

        <Section id="callSheet.cast" title="Cast" summary={groups.cast.length ? String(groups.cast.length) : undefined}>
          <div className="sheet-table">
            <table>
              <thead><tr><th>Name</th><th>Character</th><th>Pickup</th><th>Makeup</th><th>On set</th><th>Note</th><th className="no-print">Call sheet</th></tr></thead>
              <tbody>
                {groups.cast.map((c) => (
                  <tr key={c.user_id} className={c.user_id === me ? 'sheet-me' : ''}>
                    <td>{displayName(c.profile)}</td><td>{c.character_name}</td><td>{clockLabel(c.pickup_time)}</td><td>{clockLabel(c.makeup_time)}</td>
                    <td className="font-semibold">{callOf(c)}</td><td>{c.note}</td><td className="no-print">{status(c)}</td>
                  </tr>
                ))}
                {!groups.cast.length && <tr><td colSpan={7} className="text-muted">No cast called. Give actors their character on the Shoot days page.</td></tr>}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="callSheet.crew" title="Crew" summary={String(sheet.calls.length - groups.cast.length)}>
          <div className="sheet-table">
            <table>
              <thead><tr><th>Role</th><th>Name</th><th>Call</th><th>Phone</th><th>Note</th><th className="no-print">Call sheet</th></tr></thead>
              {groups.crew.map(([dept, list]) => (
                <tbody key={dept}>
                  <tr className="sheet-dept"><td colSpan={6}>{dept}</td></tr>
                  {list.map((c) => (
                    <tr key={c.user_id} className={c.user_id === me ? 'sheet-me' : ''}>
                      <td>{roleName(c)}</td><td>{displayName(c.profile)}</td><td className="font-semibold">{callOf(c)}</td>
                      <td>{c.profile.phone && <a href={tel(c.profile.phone)}>{c.profile.phone}</a>}</td><td>{c.note}</td><td className="no-print">{status(c)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
              {!groups.crew.length && <tbody><tr><td colSpan={6} className="text-muted">No crew called yet</td></tr></tbody>}
            </table>
          </div>
        </Section>

        {day.notes && (
          <Section id="callSheet.notes" title="Notes">
            <p className="m-0 whitespace-pre-line">{day.notes}</p>
          </Section>
        )}

        <Section id="callSheet.next" title="Advance schedule" summary={sheet.next_day ? shortDate(sheet.next_day.day.shoot_date) : 'Last day'}>
          {sheet.next_day ? (
            <div className="flex flex-col gap-1">
              <p className="m-0 font-semibold">Day {sheet.next_day.day.day_number}: {longDate(sheet.next_day.day.shoot_date)}{sheet.next_day.day.crew_call ? `, crew call ${clockLabel(sheet.next_day.day.crew_call)}` : ''}</p>
              {sheet.next_day.scenes.length
                ? <ul className="m-0 pl-5 text-sm">{sheet.next_day.scenes.map((s) => <li key={s.id}>Scene {s.number}{s.set_name ? ` ${s.set_name}` : ''}{s.pages_eighths != null ? `, ${pagesLabel(s.pages_eighths)} pg` : ''}</li>)}</ul>
                : <p className="m-0 text-sm text-muted">No scenes scheduled yet</p>}
            </div>
          ) : <p className="m-0 text-muted">This is the last shoot day scheduled.</p>}
        </Section>
      </article>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CallSheetDocument, type SheetData, type SheetLinks } from '../../components/CallSheetDocument';
import { itemPath } from '../../lib/links';
import { Section } from '../../components/Section';
import { api, type CallSheet } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { callSheetMailto, copyCallSheet, personalLink, personalMailto, personalSms, sharedLink, sharedMailto, sharedSms } from '../../lib/callSheet';
import { displayName, errorText } from '../../lib/format';
import { callStatus } from './ProjectShootDays';
import { useProject } from './ProjectLayout';

/**
 * A shoot day's call sheet, built from the day: times, weather, location, the day's
 * scenes and breaks, cast and crew with their own calls, notes, and the next day.
 * Anyone on the project can send it (a new version); everyone called sees their own
 * call at the top and confirms. Each person also has a private, view-only link to the
 * sheet (Personal links). Print gives the same design laid out for paper.
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
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setSheet(await api.callSheet(dayId)); } catch (e) { setError(errorText(e)); }
  }, [dayId]);
  useEffect(() => { load(); }, [load]);
  // Each opening of the call sheet page goes in the activity log.
  useEffect(() => { api.openedCallSheet(dayId).catch(() => undefined); }, [dayId]);

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

  const data = useMemo<SheetData | null>(() => sheet && {
    project: { name: project.name, company_name: project.company.name },
    day: sheet.day, location: sheet.location, items: sheet.items, scenes: sheet.scenes, calls: sheet.calls,
    roles: roles.map((r) => ({ id: r.id, name: r.name, department: r.department, sort_order: r.sort_order })),
    next_day: sheet.next_day,
  }, [sheet, project, roles]);

  async function copyLink(userId: string, token: string) {
    try { await navigator.clipboard.writeText(personalLink(token)); setCopiedLink(userId); } catch { setCopiedLink(null); setError('Your browser didn\'t allow copying. Open the link and copy it from the address bar.'); }
  }

  /** Turn the shared link on or off, make a new one, or show or hide phones; then reload the sheet. */
  async function share(b: { enabled: boolean; new_link?: boolean; phones?: boolean }, note: string | null) {
    setSharing(true); setError(null); setShareNote(null);
    try {
      const r = await api.shareCallSheet(dayId, b);
      setSheet((s) => (s ? { ...s, day: { ...s.day, ...r } } : s));
      setShareNote(note);
    } catch (e) { setError(errorText(e)); }
    setSharing(false);
  }

  async function copyShared(token: string) {
    try { await navigator.clipboard.writeText(sharedLink(token)); setShareNote('Link copied. Paste it into a text, chat or email.'); } catch { setError('Your browser didn\'t allow copying. Open the link and copy it from the address bar.'); }
  }

  const links: SheetLinks | undefined = sheet ? {
    scene: (id) => itemPath.scene(projectId, id),
    person: (userId) => itemPath.teamMember(projectId, userId),
    location: sheet.day.location_id ? itemPath.location(projectId, sheet.day.location_id) : null,
    nextDay: sheet.next_day ? itemPath.callSheet(projectId, sheet.next_day.day.id) : null,
  } : undefined;

  if (error && !sheet) return <p className="error">{error} <Link to={`/projects/${projectId}/shoot-days`}>Back to shoot days</Link></p>;
  if (!sheet) return <p className="text-muted">Loading…</p>;
  const { day } = sheet;
  const people = [...sheet.calls].sort((a, b) => displayName(a.profile).localeCompare(displayName(b.profile)));

  return (
    <div className="call-sheet cs-shared flex flex-col gap-4" data-page-label={`Day ${day.day_number} call sheet`}>
      <p className="no-print m-0 text-sm">
        <Link to={`/projects/${projectId}/shoot-days`}>Shoot days</Link>
        {' / '}<Link to={itemPath.shootDay(projectId, day.id)} title="Open this day's form on the Shoot days page">Day {day.day_number}</Link> / Call sheet
      </p>

      {mine && day.version > 0 && (
        <div className="no-print flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0">You're called on this day. Version {day.version} was sent{day.sent_at ? ` ${new Date(day.sent_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}.</p>
          {mine.confirmed_version === day.version
            ? <span className="font-semibold text-accent-strong">Confirmed version {day.version}</span>
            : <button className="btn" disabled={busy} onClick={confirm}>Confirm I got it</button>}
        </div>
      )}

      <div className="no-print flex flex-col gap-4">
      <Section id="callSheet.send" title="Send" summary={day.version ? `Version ${day.version}, ${day.confirmed} of ${day.called} confirmed` : 'Not sent yet'}>
        <div className="flex flex-col gap-2" data-pin-scope>
          <p className="m-0 text-sm">
            {day.version
              ? <>Version {day.version} was sent {day.sent_at ? new Date(day.sent_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}. Changes to the day reach people when you send a new version.</>
              : <>Check the sheet below, then send it. Everyone called gets asked to confirm.</>}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button className="btn" data-pin disabled={busy || !sheet.calls.length} onClick={send}>Send version {day.version + 1}</button>
            {day.version > 0 && <a className={`btn no-underline ${justSent ? '' : 'btn-secondary'}`} href={callSheetMailto(sheet, text)}>Email everyone</a>}
            {day.version > 0 && <button type="button" className="btn btn-secondary" onClick={async () => setCopied(await copyCallSheet(sheet, text))}>Copy message</button>}
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print or save as PDF</button>
          </div>
          {!sheet.calls.length && <p className="hint m-0">Call people on the day first (Shoot days page).</p>}
          {copied === true && <p className="hint m-0">Copied. Paste it into a text, chat or email.</p>}
          {copied === false && <p className="error m-0">Your browser didn't allow copying. Use Email everyone instead.</p>}
          {notice && <p className="notice m-0">{notice}</p>}
          {error && <p className="error m-0">{error}</p>}
          <p className="hint m-0">Email everyone opens your own email app with everyone called in Bcc and a link to this page, which needs a sign-in. For a view-only call sheet that needs no sign-in, use the Shared link (one page for anyone) or Personal links (each person's own, with Confirm) below.</p>
        </div>
      </Section>

      <Section id="callSheet.shared" title="Shared link" summary={!day.version ? 'After sending' : day.share_token ? (day.share_phones ? 'On, with phones' : 'On') : 'Off'}>
        {day.version ? (
          <div className="flex flex-col gap-2">
            <p className="hint m-0">One view-only page of the whole call sheet, the same design as the PDF, for anyone you send it to: no sign-in needed. It never shows emails, and shows phone numbers only if you tick the box. It always shows the latest version sent.</p>
            {day.share_token ? (
              <>
                <input className="field text-sm" readOnly value={sharedLink(day.share_token)} aria-label="Shared call sheet link" onFocus={(e) => e.currentTarget.select()} />
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <a className="btn btn-secondary no-underline sm:w-auto" href={sharedLink(day.share_token)} target="_blank" rel="noreferrer">Open</a>
                  <button type="button" className="btn btn-secondary sm:w-auto" onClick={() => copyShared(day.share_token!)}>Copy link</button>
                  <a className="btn btn-secondary no-underline sm:w-auto" href={sharedMailto(sheet, day.share_token, text)}>Email</a>
                  <a className="btn btn-secondary no-underline sm:w-auto" href={sharedSms(sheet, day.share_token, text)}>Text</a>
                </div>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" checked={day.share_phones} disabled={sharing}
                    onChange={(e) => share({ enabled: true, phones: e.target.checked }, e.target.checked ? 'Phone numbers now show on the shared page.' : 'Phone numbers are now hidden on the shared page.')} />
                  <span>Show phone numbers (cast, crew and the location's on-site contact)</span>
                </label>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <button type="button" className="btn btn-secondary sm:w-auto" disabled={sharing}
                    onClick={() => { if (window.confirm('Make a new link? The current link stops working for everyone who has it.')) share({ enabled: true, new_link: true }, 'New link made. The old one no longer works.'); }}>Make a new link</button>
                  <button type="button" className="btn btn-secondary sm:w-auto" disabled={sharing}
                    onClick={() => { if (window.confirm('Turn off the shared link? It stops working for everyone who has it.')) share({ enabled: false }, 'The shared link is off.'); }}>Turn off</button>
                </div>
              </>
            ) : (
              <button type="button" className="btn sm:w-auto sm:self-start" disabled={sharing} onClick={() => share({ enabled: true }, 'The shared link is on. Copy it, or email or text it.')}>Turn on shared link</button>
            )}
            {shareNote && <p className="notice m-0">{shareNote}</p>}
          </div>
        ) : <p className="hint m-0">Send the call sheet first. Then you can turn on one link to the whole sheet to send to anyone.</p>}
      </Section>

      <Section id="callSheet.links" title="Personal links" summary={day.version ? `${people.length} people` : 'After sending'}>
        {day.version ? (
          <div className="flex flex-col gap-2">
            <p className="hint m-0">Each person's own call sheet page: view only, with their call at the top, and no sign-in needed. Anyone with the link can read it, so send it only to that person. Opening it counts as viewed.</p>
            <ul className="m-0 flex list-none flex-col p-0">
              {people.map((c) => (
                <li key={c.user_id} className="flex flex-col gap-2 border-b border-line py-2 last:border-b-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 sm:flex-1">
                    <p className="m-0 font-medium"><Link to={itemPath.teamMember(projectId, c.user_id)} title={`Open ${displayName(c.profile)} on the Team page`}>{displayName(c.profile)}</Link></p>
                    <p className="m-0 text-sm text-muted">{callStatus(day, c)}{copiedLink === c.user_id ? ' · Link copied' : ''}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <a className="btn btn-secondary no-underline sm:w-auto" href={personalLink(c.link_token)} target="_blank" rel="noreferrer">Open</a>
                    <button type="button" className="btn btn-secondary sm:w-auto" onClick={() => copyLink(c.user_id, c.link_token)}>Copy link</button>
                    {c.profile.email && <a className="btn btn-secondary no-underline sm:w-auto" href={personalMailto(sheet, c, text)}>Email</a>}
                    {c.profile.phone && <a className="btn btn-secondary no-underline sm:w-auto" href={personalSms(sheet, c, text)}>Text</a>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="hint m-0">Send the call sheet first. Then each person gets their own link here to email, text or copy.</p>}
      </Section>
      </div>

      {data && <CallSheetDocument sheet={data} me={me} sectionPrefix="callSheet" status={(id) => { const c = sheet.calls.find((x) => x.user_id === id); return c ? callStatus(day, c) : ''; }}
        versionNote={day.version ? `Version ${day.version}` : 'Draft, not sent'} links={links} />}
    </div>
  );
}

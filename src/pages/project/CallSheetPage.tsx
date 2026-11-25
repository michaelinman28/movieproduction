import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CallSheetDocument, type SheetData } from '../../components/CallSheetDocument';
import { Section } from '../../components/Section';
import { api, type CallSheet } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { callSheetMailto, copyCallSheet, personalLink, personalMailto, personalSms } from '../../lib/callSheet';
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

  const data = useMemo<SheetData | null>(() => sheet && {
    project: { name: project.name, company_name: project.company.name },
    day: sheet.day, location: sheet.location, items: sheet.items, scenes: sheet.scenes, calls: sheet.calls,
    roles: roles.map((r) => ({ id: r.id, name: r.name, department: r.department, sort_order: r.sort_order })),
    next_day: sheet.next_day,
  }, [sheet, project, roles]);

  async function copyLink(userId: string, token: string) {
    try { await navigator.clipboard.writeText(personalLink(token)); setCopiedLink(userId); } catch { setCopiedLink(null); setError('Your browser didn\'t allow copying. Open the link and copy it from the address bar.'); }
  }

  if (error && !sheet) return <p className="error">{error} <Link to={`/projects/${projectId}/shoot-days`}>Back to shoot days</Link></p>;
  if (!sheet) return <p className="text-muted">Loading…</p>;
  const { day } = sheet;
  const people = [...sheet.calls].sort((a, b) => displayName(a.profile).localeCompare(displayName(b.profile)));

  return (
    <div className="call-sheet cs-shared flex flex-col gap-4">
      <p className="no-print m-0 text-sm"><Link to={`/projects/${projectId}/shoot-days`}>Shoot days</Link> / Call sheet</p>

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
          <p className="hint m-0">Email everyone opens your own email app with everyone called in Bcc and a link to this page, which needs a sign-in. To give each person their own view-only call sheet that needs no sign-in, use Personal links below.</p>
        </div>
      </Section>

      <Section id="callSheet.links" title="Personal links" summary={day.version ? `${people.length} people` : 'After sending'}>
        {day.version ? (
          <div className="flex flex-col gap-2">
            <p className="hint m-0">Each person's own call sheet page: view only, with their call at the top, and no sign-in needed. Anyone with the link can read it, so send it only to that person. Opening it counts as viewed.</p>
            <ul className="m-0 flex list-none flex-col p-0">
              {people.map((c) => (
                <li key={c.user_id} className="flex flex-col gap-2 border-b border-line py-2 last:border-b-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 sm:flex-1">
                    <p className="m-0 font-medium">{displayName(c.profile)}</p>
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
        versionNote={day.version ? `Version ${day.version}` : 'Draft, not sent'} />}
    </div>
  );
}

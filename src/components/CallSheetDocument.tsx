import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LinkedCallSheet, SheetElement } from '../lib/api';
import { SCENE_INT_EXT, SCENE_TIMES, SHOOT_ITEM_KINDS, castLabel, clockLabel, labelOf, longDate, pagesLabel, shortDate } from '../lib/format';
import { mapsLinkProps } from '../lib/maps';
import { Section } from './Section';

/** What the call sheet shows. A personal link gets exactly this; the project's call sheet page maps its data to it. */
export type SheetData = Omit<LinkedCallSheet, 'me' | 'confirmed' | 'view'>;
type SheetCall = SheetData['calls'][number];

// Roles listed as key contacts near the top, in this order.
const KEY_ROLES = ['Producer', 'Line Producer', 'Production Manager', 'Director', '1st Assistant Director', '2nd Assistant Director', 'Production Coordinator', 'Location Manager'];
const DEPARTMENTS = ['Producing', 'Directing', 'Camera', 'Grip', 'Lighting', 'Sound', 'Art', 'Wardrobe', 'Locations', 'Cast', 'Casting', 'Writing', 'Post', 'Accounts', 'Other'];

const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;
const nameOf = (c: SheetCall) => c.profile.full_name?.trim() || 'Unknown';

function Phone({ phone }: { phone: string | null | undefined }) {
  return phone ? <a className="cs-phone" href={tel(phone)}>{phone}</a> : null;
}

/**
 * Where the call sheet's items link to on the project's call sheet page: each scene,
 * person, the location and the next day open on their own pages. A personal link page
 * (no sign-in, outside the app) passes none, so it shows plain text.
 */
export interface SheetLinks {
  scene: (id: string) => string;
  person: (userId: string) => string;
  /** The day's location. */
  location: string | null;
  /** The next shoot day's call sheet. */
  nextDay: string | null;
  element: (id: string) => string;
}

/** Text that links to an item's page when there's somewhere to go; plain text otherwise. */
function To({ to, title, children }: { to?: string | null; title?: string; children: ReactNode }) {
  return to ? <Link to={to} title={title} className="cs-link">{children}</Link> : <>{children}</>;
}

/** A labelled time, or nothing when it isn't set. */
function TimeChip({ label, time, strong }: { label: string; time: string | null | undefined; strong?: boolean }) {
  const t = clockLabel(time);
  if (!t) return null;
  return <span className={`cs-chip ${strong ? 'cs-chip-strong' : ''}`}><span>{label}</span> {t}</span>;
}

function Card({ title, tone, children }: { title: string; tone?: 'alert'; children: ReactNode }) {
  return (
    <div className={`cs-card ${tone === 'alert' ? 'cs-card-alert' : ''}`}>
      <h3 className="cs-card-h">{title}</h3>
      {children}
    </div>
  );
}

/**
 * A designed, read-only call sheet: a header band with the day and crew call, the
 * reader's own call, the day's times, location, weather, hospital and key contacts,
 * then the schedule, cast, crew, notes and the next day. The same layout prints to a
 * clean one- or two-page PDF (see the .cs rules in styles.css). Used by the project's
 * call sheet page and by each person's private link.
 */
export function CallSheetDocument({ sheet, me, own, sectionPrefix, status, versionNote, youAction, links }: {
  sheet: SheetData;
  /** The person reading it: their call is shown at the top and their rows are marked. */
  me?: string | null;
  /** Only the reader's own call sheet ("My call"): no key contacts, cast or crew lists. */
  own?: boolean;
  /** Section ids, so each page remembers its own opened and closed sections. */
  sectionPrefix: string;
  /** Each person's call sheet status (on the project's page only; not printed). */
  status?: (userId: string) => string;
  /** Shown under the header, e.g. "Draft, not sent". */
  versionNote?: string;
  /** Shown in the reader's "Your call" box, e.g. a Confirm button. */
  youAction?: ReactNode;
  /** Links from each item to its own page (the project's call sheet page only). */
  links?: SheetLinks;
}) {
  const { day, location: loc, project } = sheet;
  const roleById = new Map(sheet.roles.map((r) => [r.id, r]));
  const rolesOf = (c: SheetCall) => c.role_ids.map((id) => roleById.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const roleNames = (c: SheetCall) => rolesOf(c).map((r) => r.name).join(', ');
  const department = (c: SheetCall) => rolesOf(c).find((r) => r.department)?.department || 'Other';
  const crewCall = clockLabel(day.crew_call);
  const callOf = (c: SheetCall) => clockLabel(c.call_time) || crewCall;
  const byName = (a: SheetCall, b: SheetCall) => nameOf(a).localeCompare(nameOf(b));

  const cast = sheet.calls.filter((c) => castLabel(c)).sort((a, b) => (a.call_time ?? '').localeCompare(b.call_time ?? '') || byName(a, b));
  const depts = new Map<string, SheetCall[]>();
  for (const c of sheet.calls.filter((x) => !castLabel(x))) depts.set(department(c), [...(depts.get(department(c)) ?? []), c]);
  const rank = (d: string) => (DEPARTMENTS.includes(d) ? DEPARTMENTS.indexOf(d) : DEPARTMENTS.length);
  const crew = [...depts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0])).map(([d, list]) => [d, list.sort(byName)] as const);
  const keys: { role: string; c: SheetCall }[] = [];
  for (const role of KEY_ROLES) {
    for (const c of sheet.calls) if (rolesOf(c).some((r) => r.name === role) && !keys.some((k) => k.c.user_id === c.user_id)) keys.push({ role, c });
  }
  const mine = me ? sheet.calls.find((c) => c.user_id === me) ?? null : null;
  // Dietary needs for catering: everyone's on the project's sheet, only the reader's own on a personal link, none on the shared link.
  const food = sheet.calls.filter((c) => c.dietary?.needs).sort((a, b) => Number(Boolean(b.dietary?.allergy)) - Number(Boolean(a.dietary?.allergy)) || byName(a, b));
  const allergies = food.filter((c) => c.dietary?.allergy).length;
  const totalPages = sheet.scenes.reduce((n, s) => n + (s.pages_eighths ?? 0), 0);
  const sceneLine = (s: { int_ext: SheetData['scenes'][number]['int_ext']; time_of_day: SheetData['scenes'][number]['time_of_day'] }) =>
    [s.int_ext && labelOf(SCENE_INT_EXT, s.int_ext), s.time_of_day && labelOf(SCENE_TIMES, s.time_of_day)].filter(Boolean) as string[];
  const isMe = (c: SheetCall) => c.user_id === me;
  // The day's elements by category (in the company's order, as sent); the reader's own character's first in each.
  const elements = sheet.elements ?? [];
  const isMine = (e: SheetElement) => Boolean(me && e.character?.actor_id === me);
  const elementGroups: [string, SheetElement[]][] = [];
  for (const e of elements) {
    const cat = e.category || 'Other';
    const g = elementGroups.find(([c]) => c === cat);
    if (g) g[1].push(e); else elementGroups.push([cat, [e]]);
  }
  const elementsIn = (sceneId: string) => elements.filter((e) => e.scenes.some((s) => s.scene_id === sceneId));
  for (const [, list] of elementGroups) list.sort((a, b) => Number(isMine(b)) - Number(isMine(a)));
  // The day's other times, leaving out any that aren't set.
  const times = ([
    ['Shooting call', day.shooting_call], ['Lunch', day.lunch], ['Est. wrap', day.wrap], ['Sunrise', day.sunrise], ['Sunset', day.sunset],
  ] as const).filter(([, t]) => t);

  const person = (c: SheetCall, sub: ReactNode, times: ReactNode) => (
    <li key={c.user_id} className={`cs-person ${isMe(c) ? 'cs-me' : ''}`}>
      <div className="cs-person-who">
        <p className="cs-person-name">
          <To to={links?.person(c.user_id)} title={`Open ${nameOf(c)} on the Team page`}>{nameOf(c)}</To>{c.profile.nickname && <span className="cs-nick"> “{c.profile.nickname}”</span>}
          {isMe(c) && <span className="cs-you-badge">You</span>}
        </p>
        {sub}
        {c.note && <p className="cs-person-note">{c.note}</p>}
      </div>
      <div className="cs-person-times">
        {times}
        {status && <span className="cs-status no-print">{status(c.user_id)}</span>}
      </div>
    </li>
  );

  return (
    <article className="cs">
      <header className="cs-hero">
        <div className="cs-hero-main">
          <p className="cs-eyebrow">{project.company_name} · Call sheet</p>
          <h1 className="cs-title">{project.name}</h1>
          <p className="cs-date">
            <span className="cs-day">Day {day.day_number} of {day.total_days}</span>
            <span>{longDate(day.shoot_date)}</span>
          </p>
          {day.title && <p className="cs-subtitle">{day.title}</p>}
        </div>
        <div className="cs-hero-call">
          <span className="cs-hero-label">Crew call</span>
          <strong className="cs-hero-time">{crewCall || 'TBD'}</strong>
          <span className="cs-hero-version">{versionNote ?? (day.version ? `Version ${day.version}` : 'Draft')}</span>
        </div>
      </header>

      {own && !mine && <p className="cs-you cs-muted">You're not called on this day.</p>}

      {mine && (
        <section className="cs-you" aria-label="Your call">
          <div>
            <p className="cs-you-label">Your call</p>
            <p className="cs-you-time">{callOf(mine) || 'Not set yet'}</p>
          </div>
          <div className="cs-you-details">
            <p className="cs-you-name">{nameOf(mine)}{castLabel(mine) ? <> as <strong>{castLabel(mine)}</strong></> : roleNames(mine) ? <span className="cs-muted"> · {roleNames(mine)}</span> : null}</p>
            <div className="cs-chips">
              <TimeChip label="Pickup" time={mine.pickup_time} />
              <TimeChip label="Makeup" time={mine.makeup_time} />
              {loc && <span className="cs-chip"><span>At</span> {loc.name}</span>}
            </div>
            {mine.note && <p className="cs-you-note">{mine.note}</p>}
          </div>
          {youAction && <div className="cs-you-action">{youAction}</div>}
        </section>
      )}

      {times.length > 0 && (
        <dl className="cs-times">
          {times.map(([label, t]) => <div key={label} className="cs-time"><dt>{label}</dt><dd>{clockLabel(t)}</dd></div>)}
        </dl>
      )}

      <div className={`cs-info ${own ? 'cs-info-3' : ''}`}>
        <Card title="Location">
          {loc ? (
            <>
              <p className="cs-strong"><To to={links?.location} title={`Open ${loc.name} on the Locations page`}>{loc.name}</To></p>
              {loc.address && <p><a {...mapsLinkProps(loc.address)}>{loc.address}</a></p>}
              {loc.parking && <p className="cs-small"><span className="cs-muted">Parking:</span> {loc.parking}</p>}
              {loc.contact_name && <p className="cs-small"><span className="cs-muted">On site:</span> {loc.contact_name} <Phone phone={loc.contact_phone} /></p>}
            </>
          ) : <p className="cs-muted">To be confirmed</p>}
        </Card>
        <Card title="Weather">
          <p>{day.weather || <span className="cs-muted">Not set</span>}</p>
          {(day.sunrise || day.sunset) && <p className="cs-small cs-muted">Sunrise {clockLabel(day.sunrise) || '—'} · Sunset {clockLabel(day.sunset) || '—'}</p>}
        </Card>
        <Card title="Nearest hospital" tone="alert">
          <ul className="cs-keys">
            {loc?.nearest_hospital ? (() => {
              // "WakeMed Cary Hospital, 1900 Kildaire Farm Rd, Cary, NC" -> name, then the address.
              const [name, ...rest] = loc.nearest_hospital.split(',');
              return (
                <li>
                  <span className="cs-muted">Hospital</span>
                  <span>{rest.length ? name.trim() : ''}</span>
                  <a className="cs-addr" {...mapsLinkProps(loc.nearest_hospital)}>{rest.length ? rest.join(',').trim() : name}</a>
                </li>
              );
            })() : <li><span className="cs-muted">Hospital</span><span>Not set</span></li>}
            <li><span className="cs-muted">Emergency</span><span>Police, fire, ambulance</span><a className="cs-phone" href="tel:911">911</a></li>
          </ul>
        </Card>
        {!own && <Card title="Key contacts">
          {keys.length ? (
            <ul className="cs-keys">
              {keys.map(({ role, c }) => (
                <li key={c.user_id}><span className="cs-muted">{role}</span><span><To to={links?.person(c.user_id)} title={`Open ${nameOf(c)} on the Team page`}>{nameOf(c)}</To></span><Phone phone={c.profile.phone} /></li>
              ))}
            </ul>
          ) : <p className="cs-muted cs-small">None listed</p>}
        </Card>}
      </div>

      <div className="cs-body">
        <Section id={`${sectionPrefix}.schedule`} title="Schedule" summary={sheet.scenes.length ? `${sheet.scenes.length} scenes · ${pagesLabel(totalPages)} pages` : undefined}>
          {sheet.items.length ? (
            <ol className="cs-schedule">
              {sheet.items.map((i) => {
                const time = clockLabel(i.at_time);
                if (i.kind !== 'scene') {
                  return (
                    <li key={i.id} className={`cs-row cs-row-break cs-row-${i.kind}`}>
                      <span className="cs-row-time">{time}</span>
                      <div className="cs-row-body"><strong>{labelOf(SHOOT_ITEM_KINDS, i.kind)}</strong>{i.label ? <span> · {i.label}</span> : null}</div>
                    </li>
                  );
                }
                const s = sheet.scenes.find((x) => x.id === i.scene_id);
                if (!s) return null;
                return (
                  <li key={i.id} className="cs-row">
                    <span className="cs-row-time">{time}</span>
                    <div className="cs-row-body">
                      <div className="cs-row-head">
                        <To to={links?.scene(s.id)} title={`Open scene ${s.number} on the Scenes page`}><span className="cs-scene-no">Sc {s.number}</span></To>
                        <span className="cs-row-set"><To to={links?.scene(s.id)} title={`Open scene ${s.number} on the Scenes page`}>{s.set_name || 'Scene'}</To></span>
                        {sceneLine(s).map((t) => <span key={t} className="cs-pill">{t}</span>)}
                        {s.pages_eighths != null && <span className="cs-pages">{pagesLabel(s.pages_eighths)} pg</span>}
                      </div>
                      {s.synopsis && <p className="cs-row-text">{s.synopsis}</p>}
                      {(s.characters || s.needs || elementsIn(s.id).length > 0) && (
                        <p className="cs-row-meta">
                          {s.characters && <span><b>Cast</b> {s.characters}</span>}
                          {elementsIn(s.id).length > 0 && <span><b>Elements</b> {elementsIn(s.id).map((e) => e.name).join(', ')}</span>}
                          {s.needs && <span><b>Other needs</b> {s.needs}</span>}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : <p className="cs-muted">Nothing scheduled yet</p>}
        </Section>

        {elements.length > 0 && (
          <Section id={`${sectionPrefix}.elements`} title="Elements" summary={`${elements.length} for today's scenes`}>
            <div className="cs-depts">
              {elementGroups.map(([cat, list]) => (
                <div key={cat} className="cs-dept">
                  <h4 className="cs-dept-h">{cat}</h4>
                  <ul className="cs-els">
                    {list.map((e) => (
                      <li key={e.id} className={isMine(e) ? 'cs-me' : ''}>
                        <span>
                          <span className="cs-el-name"><To to={links?.element(e.id)} title={`Open ${e.name} on the Elements page`}>{e.name}</To></span>
                          {e.quantity != null && e.quantity > 1 && <span className="cs-muted"> × {e.quantity}</span>}
                          {isMine(e) && <span className="cs-you-badge">Yours</span>}
                        </span>
                        <span className="cs-el-meta">
                          {[e.character && `${e.character.cast_number != null ? `${e.character.cast_number}. ` : ''}${e.character.name}`,
                            e.scenes.map((s) => `Sc ${s.number}${s.note ? `: ${s.note}` : ''}`).join('; ')].filter(Boolean).join(' · ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        )}

        {!own && <Section id={`${sectionPrefix}.cast`} title="Cast" summary={cast.length ? String(cast.length) : undefined}>
          {cast.length ? (
            <ul className="cs-people">
              {cast.map((c) => person(c,
                <p className="cs-person-sub">as <strong>{castLabel(c)}</strong></p>,
                <><TimeChip label="Pickup" time={c.pickup_time} /><TimeChip label="Makeup" time={c.makeup_time} /><span className="cs-chip cs-chip-strong"><span>On set</span> {callOf(c) || '—'}</span></>))}
            </ul>
          ) : <p className="cs-muted">No cast called</p>}
        </Section>}

        {!own && <Section id={`${sectionPrefix}.crew`} title="Crew" summary={String(sheet.calls.length - cast.length)}>
          {crew.length ? (
            <div className="cs-depts">
              {crew.map(([dept, list]) => (
                <div key={dept} className="cs-dept">
                  <h4 className="cs-dept-h">{dept}</h4>
                  <ul className="cs-people">
                    {list.map((c) => person(c,
                      <p className="cs-person-sub">{roleNames(c) || 'Crew'}{c.profile.phone && <> · <Phone phone={c.profile.phone} /></>}</p>,
                      <span className="cs-chip cs-chip-strong"><span>Call</span> {callOf(c) || '—'}</span>))}
                  </ul>
                </div>
              ))}
            </div>
          ) : <p className="cs-muted">No crew called yet</p>}
        </Section>}

        {food.length > 0 && (
          <Section id={`${sectionPrefix}.dietary`} title={own ? 'Your dietary needs' : 'Dietary needs'}
            summary={`${food.length} ${food.length === 1 ? 'person' : 'people'}${allergies ? `, ${allergies} ${allergies === 1 ? 'allergy' : 'allergies'}` : ''}`}>
            <ul className="cs-food">
              {food.map((c) => (
                <li key={c.user_id} className={c.dietary?.allergy ? 'cs-food-allergy' : ''}>
                  <span className="cs-food-who">{nameOf(c)}</span>
                  <span>{c.dietary?.allergy && <strong>Allergy: </strong>}{c.dietary?.needs}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {day.notes && (
          <Section id={`${sectionPrefix}.notes`} title="Notes">
            <p className="cs-notes">{day.notes}</p>
          </Section>
        )}

        <Section id={`${sectionPrefix}.next`} title="Advance schedule" summary={sheet.next_day ? shortDate(sheet.next_day.day.shoot_date) : 'Last day'}>
          {sheet.next_day ? (
            <div className="cs-next">
              <p className="cs-strong">
                <To to={links?.nextDay} title="Open the next day's call sheet">Day {sheet.next_day.day.day_number} · {longDate(sheet.next_day.day.shoot_date)}</To>
                {sheet.next_day.day.crew_call && <span className="cs-muted"> · crew call {clockLabel(sheet.next_day.day.crew_call)}</span>}
              </p>
              {sheet.next_day.scenes.length ? (
                <ul className="cs-next-list">
                  {sheet.next_day.scenes.map((s) => (
                    <li key={s.id}>
                      <To to={links?.scene(s.id)} title={`Open scene ${s.number} on the Scenes page`}><span className="cs-scene-no">Sc {s.number}</span> {s.set_name}</To>
                      {sceneLine(s).length > 0 && <span className="cs-muted"> · {sceneLine(s).join(' ')}</span>}
                      {s.pages_eighths != null && <span className="cs-muted"> · {pagesLabel(s.pages_eighths)} pg</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="cs-muted cs-small">No scenes scheduled yet</p>}
            </div>
          ) : <p className="cs-muted">This is the last shoot day scheduled.</p>}
        </Section>
      </div>

      <footer className="cs-footer">
        <span>{project.name} · Day {day.day_number} · {longDate(day.shoot_date)}{day.version ? ` · Version ${day.version}` : ''}</span>
        <span>Confidential: for cast and crew only</span>
      </footer>
    </article>
  );
}

import type { ReactNode } from 'react';
import type { SheetElement } from '../lib/api';
import { SHOOT_ITEM_KINDS, clockLabel, labelOf, longDate, pagesLabel, shortDate } from '../lib/format';
import type { SheetData } from './CallSheetDocument';

type SheetCall = SheetData['calls'][number];
type SheetScene = SheetData['scenes'][number];

/** What the one-page sheet needs, worked out once by CallSheetDocument for both layouts. */
export interface OnePageParts {
  sheet: SheetData;
  /** Only the reader's own call ("My call"): no key contacts, cast or crew lists. */
  own?: boolean;
  /** The reader's own call, shown in the header (not on the project's own page when printed). */
  mine: SheetCall | null;
  versionNote?: string;
  hospitals: { text: string; places: string[] }[];
  keys: { role: string; c: SheetCall }[];
  cast: SheetCall[];
  crew: (readonly [string, SheetCall[]])[];
  food: SheetCall[];
  elementGroups: [string, SheetElement[]][];
  totalPages: number;
  nameOf: (c: SheetCall) => string;
  callOf: (c: SheetCall) => string;
  roleNames: (c: SheetCall) => string;
  castRank: (c: SheetCall) => number | null;
  castLabel: (c: SheetCall) => string;
  /** A scene's characters in cast-number order. */
  sceneChars: (text: string | null) => string[];
  numberOf: Map<string, number>;
  sceneLine: (s: SheetScene) => string[];
  placeOf: (s: { location_name?: string | null }) => string | null;
}

const short = (t: string | null | undefined) => clockLabel(t) || '—';

/**
 * The call sheet on one US Letter page, for printing only: the day's times, places,
 * hospital and contacts across the top, then the schedule, cast and crew as compact
 * tables, and the elements, notes and next day along the bottom. A project chooses it
 * (or the modern layout, or both) under Call sheet print on its details.
 */
export function CallSheetOnePage({ parts, variant = 'one_page', modernTop }: {
  parts: OnePageParts;
  /** one_page: the whole day on one page. modern: the modern layout's top with these tables below, over as many pages as it takes. */
  variant?: 'one_page' | 'modern';
  /** The modern layout's header band, your call, times and cards. */
  modernTop?: ReactNode;
}) {
  const { sheet, own, mine, hospitals, keys, cast, crew, food, elementGroups, totalPages, nameOf, callOf, roleNames, castRank, castLabel, sceneChars, numberOf, sceneLine, placeOf } = parts;
  const { day, locations, project } = sheet;
  const times = ([
    ['Shooting', day.shooting_call], ['Lunch', day.lunch], ['Est. wrap', day.wrap],
  ] as const);
  // A scene's cast as cast numbers ("1, 3, 6"), with names for anyone without one.
  const castNos = (text: string | null) => sceneChars(text).map((n) => numberOf.get(n.toLowerCase())?.toString() ?? n).join(', ');
  const crewCount = sheet.calls.length - cast.length;
  // The crew in two side-by-side halves, departments kept whole, split where the rows (a heading counts as one) are closest to even.
  const rowsOf = (list: SheetCall[]) => list.length + 1;
  const totalRows = crew.reduce((n, [, list]) => n + rowsOf(list), 0);
  let split = 0;
  for (let n = 0; split < crew.length && n + rowsOf(crew[split][1]) / 2 <= totalRows / 2; split++) n += rowsOf(crew[split][1]);
  const crewHalves = [crew.slice(0, Math.max(split, 1)), crew.slice(Math.max(split, 1))].filter((h) => h.length);

  const head = (
    <>
      <header className="cs1-head">
        <div className="cs1-title">
          <p className="cs1-eyebrow">{project.company_name} · Call sheet</p>
          <h1>{project.name}</h1>
          <p className="cs1-date"><b>Day {day.day_number} of {day.total_days}</b> · {longDate(day.shoot_date)}</p>
          {day.title && <p className="cs1-sub">{day.title}</p>}
          {day.note && <p className="cs1-note">{day.note}</p>}
        </div>
        <div className="cs1-call">
          <span>Crew call</span>
          <strong>{clockLabel(day.crew_call) || 'TBD'}</strong>
          <em>{parts.versionNote ?? (day.version ? `Version ${day.version}` : 'Draft')}</em>
        </div>
        <dl className="cs1-times">
          {times.map(([label, t]) => <div key={label}><dt>{label}</dt><dd>{short(t)}</dd></div>)}
        </dl>
        <div className="cs1-weather">
          <span className="cs1-h">Weather</span>
          <p>{day.weather || 'Not set'}</p>
          {(day.sunrise || day.sunset) && <p className="cs1-muted">Sunrise {short(day.sunrise)} · Sunset {short(day.sunset)}</p>}
        </div>
      </header>

      {mine && (
        <p className="cs1-you">
          <span>Your call</span> <b>{callOf(mine) || 'Not set yet'}</b>
          {mine.pickup_time && <> · Pickup {clockLabel(mine.pickup_time)}</>}
          {mine.makeup_time && <> · Makeup {clockLabel(mine.makeup_time)}</>}
          <> · {nameOf(mine)}{castLabel(mine) ? ` as ${castLabel(mine)}` : roleNames(mine) ? `, ${roleNames(mine)}` : ''}</>
          {mine.note && <> · {mine.note}</>}
        </p>
      )}

      <section className={`cs1-info ${own ? 'cs1-info-2' : ''}`}>
        <div>
          <h2 className="cs1-h">{locations.length > 1 ? `Locations (${locations.length})` : 'Location'}</h2>
          {locations.length ? locations.map((l, i) => (
            <p key={`${l.name}-${i}`} className="cs1-place">
              {locations.length > 1 && <span className="cs1-no">{i + 1}</span>}<b>{l.name}</b>
              {l.address && <><br />{l.address}</>}
              {l.parking && <><br /><span className="cs1-muted">Parking:</span> {l.parking}</>}
              {l.contact_name && <><br /><span className="cs1-muted">On site:</span> {l.contact_name}{l.contact_phone ? ` ${l.contact_phone}` : ''}</>}
            </p>
          )) : <p className="cs1-muted">To be confirmed</p>}
        </div>
        <div className="cs1-alert">
          <h2 className="cs1-h">Nearest hospital</h2>
          {hospitals.length ? hospitals.map((h) => (
            <p key={h.text}>
              {(hospitals.length > 1 || locations.length > 1) && <span className="cs1-muted">Near {h.places.join(', ')}: </span>}{h.text}
            </p>
          )) : <p className="cs1-muted">Not set</p>}
          <p><b>Emergency: 911</b></p>
        </div>
        {!own && (
          <div>
            <h2 className="cs1-h">Key contacts</h2>
            {keys.length ? (
              <table className="cs1-keys"><tbody>
                {keys.map(({ role, c }) => <tr key={c.user_id}><td className="cs1-muted">{role}</td><td>{nameOf(c)}</td><td className="cs1-num">{c.profile.phone ?? ''}</td></tr>)}
              </tbody></table>
            ) : <p className="cs1-muted">None listed</p>}
          </div>
        )}
      </section>

    </>
  );
  const body = (
    <div className="cs1-body">
      <section>
        <h2 className="cs1-bar">Schedule<span>{sheet.scenes.length} {sheet.scenes.length === 1 ? 'scene' : 'scenes'} · {pagesLabel(totalPages)} pages</span></h2>
        {sheet.items.length ? (
          <table className="cs1-table cs1-schedule">
            <thead><tr><th>Time</th><th>Sc</th><th>Set and description</th><th>I/E · Time</th><th>Cast</th><th className="cs1-num">Pages</th><th>Location</th></tr></thead>
            <tbody>
              {sheet.items.map((i) => {
                if (i.kind !== 'scene') {
                  return (
                    <tr key={i.id} className={`cs1-break cs1-break-${i.kind}`}>
                      <td>{clockLabel(i.at_time)}</td>
                      <td colSpan={6}><b>{labelOf(SHOOT_ITEM_KINDS, i.kind)}</b>{i.label ? ` · ${i.label}` : ''}</td>
                    </tr>
                  );
                }
                const s = sheet.scenes.find((x) => x.id === i.scene_id);
                if (!s) return null;
                const els = sheet.elements?.filter((e) => e.scenes.some((x) => x.scene_id === s.id)).map((e) => e.name) ?? [];
                return (
                  <tr key={i.id}>
                    <td>{clockLabel(i.at_time)}</td>
                    <td><b>{s.number}</b></td>
                    <td>
                      <b>{s.set_name || 'Scene'}</b>
                      {s.synopsis && <span className="cs1-syn">{s.synopsis}</span>}
                      {(els.length > 0 || s.needs) && <span className="cs1-syn cs1-muted">{[els.length ? `Elements: ${els.join(', ')}` : '', s.needs ? `Needs: ${s.needs}` : ''].filter(Boolean).join(' · ')}</span>}
                    </td>
                    <td>{sceneLine(s).join(' · ')}</td>
                    <td>{castNos(s.characters)}</td>
                    <td className="cs1-num">{s.pages_eighths != null ? pagesLabel(s.pages_eighths) : ''}</td>
                    <td>{placeOf(s) ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="cs1-muted">Nothing scheduled yet</p>}
      </section>

      {!own && (
        <section>
          <h2 className="cs1-bar">Cast<span>{cast.length}</span></h2>
          {cast.length ? (
            <table className="cs1-table cs1-cast">
              <thead><tr><th>#</th><th>Cast</th><th>Character</th><th className="cs1-num">Pickup</th><th className="cs1-num">Makeup</th><th className="cs1-num">On set</th><th>Notes</th></tr></thead>
              <tbody>
                {cast.map((c) => (
                  <tr key={c.user_id}>
                    <td><b>{castRank(c) ?? ''}</b></td>
                    <td>{nameOf(c)}</td>
                    <td>{castLabel(c).replace(/ \(#\d+\)/g, '')}</td>
                    <td className="cs1-num">{clockLabel(c.pickup_time)}</td>
                    <td className="cs1-num">{clockLabel(c.makeup_time)}</td>
                    <td className="cs1-num"><b>{callOf(c) || '—'}</b></td>
                    <td className="cs1-muted">{c.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="cs1-muted">No cast called</p>}
        </section>
      )}

      {!own && (
        <section>
          <h2 className="cs1-bar">Crew<span>{crewCount}</span></h2>
          {crew.length ? (
            <div className="cs1-crew-cols">
              {crewHalves.map((half, k) => (
                <table key={k} className="cs1-table cs1-crew">
                  <colgroup><col className="cs1-w-role" /><col className="cs1-w-name" /><col className="cs1-w-phone" /><col className="cs1-w-call" /></colgroup>
                  <tbody>
                    {half.map(([dept, list]) => [
                      <tr key={dept} className="cs1-dept"><td colSpan={4}>{dept}</td></tr>,
                      ...list.map((c) => (
                        <tr key={c.user_id}>
                          <td>{roleNames(c) || 'Crew'}</td>
                          <td>{nameOf(c)}</td>
                          <td className="cs1-num">{c.profile.phone ?? ''}</td>
                          <td className="cs1-num"><b>{callOf(c) || '—'}</b></td>
                        </tr>
                      )),
                    ])}
                  </tbody>
                </table>
              ))}
            </div>
          ) : <p className="cs1-muted">No crew called yet</p>}
        </section>
      )}

      <div className="cs1-bottom">
        {elementGroups.length > 0 && (
          <section>
            <h2 className="cs1-bar">Elements</h2>
            {elementGroups.map(([cat, list]) => (
              <p key={cat} className="cs1-line"><b>{cat}:</b> {list.map((e) => `${e.name}${e.quantity != null && e.quantity > 1 ? ` ×${e.quantity}` : ''} (Sc ${e.scenes.map((s) => s.number).join(', ')})`).join('; ')}</p>
            ))}
          </section>
        )}
        {(day.notes || food.length > 0) && (
          <section>
            <h2 className="cs1-bar">Notes</h2>
            {day.notes && <p className="cs1-line cs1-pre">{day.notes}</p>}
            {food.length > 0 && (
              <p className="cs1-line"><b>{own ? 'Your dietary needs' : 'Dietary'}:</b> {food.map((c) => `${nameOf(c)}: ${c.dietary?.allergy ? 'ALLERGY ' : ''}${c.dietary?.needs}`).join('; ')}</p>
            )}
          </section>
        )}
        <section>
          <h2 className="cs1-bar">Advance schedule{sheet.next_day && <span>{shortDate(sheet.next_day.day.shoot_date)}</span>}</h2>
          {sheet.next_day ? (
            <>
              <p className="cs1-line">
                <b>Day {sheet.next_day.day.day_number} · {longDate(sheet.next_day.day.shoot_date)}</b>
                {sheet.next_day.day.crew_call && ` · crew call ${clockLabel(sheet.next_day.day.crew_call)}`}
                {sheet.next_day.locations.length > 0 && ` · at ${sheet.next_day.locations.map((l) => l.name).join(', then ')}`}
              </p>
              {sheet.next_day.scenes.length ? (
                <p className="cs1-line">{sheet.next_day.scenes.map((s) => `Sc ${s.number} ${s.set_name ?? ''}${s.pages_eighths != null ? ` (${pagesLabel(s.pages_eighths)} pg)` : ''}`).join(' · ')}</p>
              ) : <p className="cs1-line cs1-muted">No scenes scheduled yet</p>}
            </>
          ) : <p className="cs1-line cs1-muted">This is the last shoot day scheduled.</p>}
        </section>
      </div>

    </div>
  );
  const footer = (
      <footer className="cs1-foot">
        <span>{project.name} · Day {day.day_number} · {longDate(day.shoot_date)}{day.version ? ` · Version ${day.version}` : ''}</span>
        <span>Confidential: for cast and crew only</span>
      </footer>
  );

  if (variant === 'modern') {
    // The modern layout's own top (header band, times and cards), then the same schedule,
    // cast, crew and notes as the one-page sheet at a larger size. The table's header and
    // footer rows repeat on every page, so each page keeps its top and bottom space.
    return (
      <article className="cs1 cs1-modern" aria-hidden="true">
        <table className="cs1-pages">
          <thead><tr><td><div className="cs1-space-top" /></td></tr></thead>
          <tfoot><tr><td><div className="cs1-space-bottom" /></td></tr></tfoot>
          <tbody><tr><td>
            <div className="cs cs1-modern-top">{modernTop}</div>
            {body}
          </td></tr></tbody>
        </table>
        {footer}
      </article>
    );
  }
  return (
    <article className="cs1 cs1-one" aria-hidden="true">
      {head}
      {body}
      {footer}
    </article>
  );
}

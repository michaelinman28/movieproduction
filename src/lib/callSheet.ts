/**
 * The call sheet as plain text, to send from the sender's own email app (mailto:)
 * or copy into a text or chat, with a link to the full sheet where people confirm.
 * There's no email server, the same way invites and task summaries work.
 */
import type { CallSheet, ShootDayCall } from './api';
import { SCENE_INT_EXT, SCENE_TIMES, SHOOT_ITEM_KINDS, clockLabel, labelOf, longDate, pagesLabel } from './format';

/** " at Diner" or " at Diner, then Park" (the day's locations in order), or nothing. */
function placeNames(sheet: CallSheet) {
  const names = sheet.locations.map((l) => l.name);
  return names.length ? ` at ${names.join(', then ')}` : '';
}

/** The scene's location, when it has one. */
function scenePlace(sheet: CallSheet, s: { location_id: string | null; location_name?: string | null }) {
  const named = s.location_name?.trim();
  if (named) return named;
  return (s.location_id && sheet.locations.find((l) => l.id === s.location_id)?.name) || '';
}

export interface SheetText { projectName: string; url: string }

export function callSheetSubject(sheet: CallSheet, t: SheetText) {
  const d = sheet.day;
  return `Call sheet v${Math.max(d.version, 1)}: ${t.projectName}, day ${d.day_number} of ${d.total_days} (${longDate(d.shoot_date)})`;
}

export function callSheetBody(sheet: CallSheet, t: SheetText) {
  const d = sheet.day;
  const lines: string[] = [];
  const add = (label: string, v: string | null | undefined) => { if (v) lines.push(`${label}: ${v}`); };
  lines.push(`${t.projectName}: day ${d.day_number} of ${d.total_days}, ${longDate(d.shoot_date)}${d.title ? ` (${d.title})` : ''}`, '');
  lines.push('Open the call sheet to see your own call time and confirm:', t.url, '');
  add('General crew call', clockLabel(d.crew_call));
  add('Shooting call', clockLabel(d.shooting_call));
  add('Lunch', clockLabel(d.lunch));
  add('Estimated wrap', clockLabel(d.wrap));
  add('Weather', d.weather);
  if (d.sunrise || d.sunset) add('Sunrise / sunset', `${clockLabel(d.sunrise) || '?'} / ${clockLabel(d.sunset) || '?'}`);
  const many = sheet.locations.length > 1;
  sheet.locations.forEach((loc, i) => {
    lines.push('');
    add(many ? `Location ${i + 1}` : 'Location', loc.name);
    add('Address', loc.address);
    add('Parking', loc.parking);
    add('Nearest hospital', loc.nearest_hospital);
  });
  if (sheet.items.length) {
    lines.push('', 'Schedule:');
    for (const i of sheet.items) {
      const time = i.at_time ? `${clockLabel(i.at_time)}  ` : '';
      if (i.kind === 'scene') {
        const s = sheet.scenes.find((x) => x.id === i.scene_id);
        if (!s) continue;
        const ie = [s.int_ext && labelOf(SCENE_INT_EXT, s.int_ext), s.time_of_day && labelOf(SCENE_TIMES, s.time_of_day)].filter(Boolean).join(' ');
        const place = scenePlace(sheet, s);
        lines.push(`- ${time}Scene ${s.number}${s.set_name ? ` ${s.set_name}` : ''}${place ? ` at ${place}` : ''}${ie ? ` (${ie})` : ''}${s.pages_eighths != null ? `, ${pagesLabel(s.pages_eighths)} pg` : ''}${s.characters ? `, ${s.characters}` : ''}`);
      } else {
        lines.push(`- ${time}${labelOf(SHOOT_ITEM_KINDS, i.kind)}${i.label ? `: ${i.label}` : ''}`);
      }
    }
  }
  if (sheet.elements?.length) {
    lines.push('', 'Elements:');
    for (const e of sheet.elements) {
      const scenes = e.scenes.map((s) => s.number).join(', ');
      lines.push(`- ${e.category ? `${e.category}: ` : ''}${e.name}${e.quantity && e.quantity > 1 ? ` x${e.quantity}` : ''}${e.character ? ` (${e.character.name})` : ''}${scenes ? `, sc ${scenes}` : ''}`);
    }
  }
  if (d.notes) lines.push('', 'Notes:', d.notes);
  return lines.join('\n');
}

/** Opens the sender's email app with everyone called in Bcc. */
export function callSheetMailto(sheet: CallSheet, t: SheetText) {
  const emails = [...new Set(sheet.calls.map((c) => c.profile.email).filter(Boolean))] as string[];
  return `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(callSheetSubject(sheet, t))}&body=${encodeURIComponent(callSheetBody(sheet, t))}`;
}

export async function copyCallSheet(sheet: CallSheet, t: SheetText) {
  try { await navigator.clipboard.writeText(`${callSheetSubject(sheet, t)}\n\n${callSheetBody(sheet, t)}`); return true; } catch { return false; }
}

// ---- Personal links -----------------------------------------------------------

/** The address of a person's own view-only call sheet page. No sign-in needed. */
export function personalLink(token: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}sheet/${token}`;
}

function personalText(sheet: CallSheet, c: ShootDayCall, t: SheetText) {
  const d = sheet.day;
  const first = (c.profile.nickname || c.profile.full_name || '').trim().split(/\s+/)[0];
  const call = clockLabel(c.call_time) || clockLabel(d.crew_call);
  return [
    `${first ? `Hi ${first}, here` : 'Here'}'s your call sheet for ${t.projectName}, day ${d.day_number} of ${d.total_days} (${longDate(d.shoot_date)}).`,
    call ? `Your call: ${call}${placeNames(sheet)}.` : '',
    '',
    'Everything for the day is on your personal call sheet:',
    personalLink(c.link_token),
  ].filter((l, i) => l || i === 2).join('\n');
}

/** An email to one person with their own link, from the sender's email app. */
export function personalMailto(sheet: CallSheet, c: ShootDayCall, t: SheetText) {
  return `mailto:${encodeURIComponent(c.profile.email ?? '')}?subject=${encodeURIComponent(callSheetSubject(sheet, t))}&body=${encodeURIComponent(personalText(sheet, c, t))}`;
}

/** A text message to one person with their own link. */
export function personalSms(sheet: CallSheet, c: ShootDayCall, t: SheetText) {
  return `sms:${(c.profile.phone ?? '').replace(/[^\d+]/g, '')}?body=${encodeURIComponent(personalText(sheet, c, t))}`;
}

// ---- The shared link (one for the whole day, for anyone) ----------------------

/** The address of a day's shared, view-only call sheet page. No sign-in needed. */
export function sharedLink(token: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}call-sheet/${token}`;
}

function sharedText(sheet: CallSheet, token: string, t: SheetText) {
  const d = sheet.day;
  const call = clockLabel(d.crew_call);
  return [
    `Here's the call sheet for ${t.projectName}, day ${d.day_number} of ${d.total_days} (${longDate(d.shoot_date)}).`,
    call ? `Crew call: ${call}${placeNames(sheet)}.` : '',
    '',
    'The whole call sheet:',
    sharedLink(token),
  ].filter((l, i) => l || i === 2).join('\n');
}

/** An email with the shared link, from the sender's email app; they pick who it goes to. */
export function sharedMailto(sheet: CallSheet, token: string, t: SheetText) {
  return `mailto:?subject=${encodeURIComponent(callSheetSubject(sheet, t))}&body=${encodeURIComponent(sharedText(sheet, token, t))}`;
}

/** A text message with the shared link; they pick who it goes to. */
export function sharedSms(sheet: CallSheet, token: string, t: SheetText) {
  return `sms:?&body=${encodeURIComponent(sharedText(sheet, token, t))}`;
}

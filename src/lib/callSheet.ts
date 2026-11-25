/**
 * The call sheet as plain text, to send from the sender's own email app (mailto:)
 * or copy into a text or chat, with a link to the full sheet where people confirm.
 * There's no email server, the same way invites and task summaries work.
 */
import type { CallSheet } from './api';
import { SCENE_INT_EXT, SCENE_TIMES, SHOOT_ITEM_KINDS, clockLabel, labelOf, longDate, pagesLabel } from './format';

export interface SheetText { projectName: string; url: string }

export function callSheetSubject(sheet: CallSheet, t: SheetText) {
  const d = sheet.day;
  return `Call sheet v${Math.max(d.version, 1)}: ${t.projectName}, day ${d.day_number} of ${d.total_days} (${longDate(d.shoot_date)})`;
}

export function callSheetBody(sheet: CallSheet, t: SheetText) {
  const d = sheet.day;
  const loc = sheet.location;
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
  if (loc) {
    lines.push('');
    add('Location', loc.name);
    add('Address', loc.address);
    add('Parking', loc.parking);
    add('Nearest hospital', loc.nearest_hospital);
  }
  if (sheet.items.length) {
    lines.push('', 'Schedule:');
    for (const i of sheet.items) {
      const time = i.at_time ? `${clockLabel(i.at_time)}  ` : '';
      if (i.kind === 'scene') {
        const s = sheet.scenes.find((x) => x.id === i.scene_id);
        if (!s) continue;
        const ie = [s.int_ext && labelOf(SCENE_INT_EXT, s.int_ext), s.time_of_day && labelOf(SCENE_TIMES, s.time_of_day)].filter(Boolean).join(' ');
        lines.push(`- ${time}Scene ${s.number}${s.set_name ? ` ${s.set_name}` : ''}${ie ? ` (${ie})` : ''}${s.pages_eighths != null ? `, ${pagesLabel(s.pages_eighths)} pg` : ''}${s.characters ? `, ${s.characters}` : ''}`);
      } else {
        lines.push(`- ${time}${labelOf(SHOOT_ITEM_KINDS, i.kind)}${i.label ? `: ${i.label}` : ''}`);
      }
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

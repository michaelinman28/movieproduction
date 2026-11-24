/**
 * Which columns a person has hidden on each table, kept for the browser session
 * (sessionStorage), so moving between pages keeps their view. Keyed by the table's
 * `stateId`, e.g. "project.tasks". Maps column id to hidden, so columns added later
 * show by default.
 */
const key = (stateId: string) => `mp-grid-cols:${stateId}`;

export function readHiddenColumns(stateId: string): Record<string, boolean> | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(key(stateId)) ?? 'null');
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

export function saveHiddenColumns(stateId: string, cols: { id: string; hidden?: boolean }[]) {
  try {
    if (cols.every((c) => !c.hidden)) sessionStorage.removeItem(key(stateId));
    else sessionStorage.setItem(key(stateId), JSON.stringify(Object.fromEntries(cols.map((c) => [c.id, !!c.hidden]))));
  } catch { /* storage unavailable: the choice lasts until the page is left */ }
}

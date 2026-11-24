/**
 * How a person has set up each table: which columns show, their widths and order,
 * and the sort. Kept for the browser session (sessionStorage), so moving between
 * pages or reloading keeps their view. Keyed by the table's `stateId`, e.g.
 * "project.tasks". Columns added later show at their default place and width.
 */
export interface GridView {
  /** Column ids, left to right. */
  order: string[];
  cols: Record<string, { hidden: boolean; width: number; flex: number }>;
  /** The tree / group column's size. */
  group?: { width: number; flex: number };
  sorts: { id: string; dir: 'asc' | 'desc' }[];
}

const key = (stateId: string) => `mp-grid-view:${stateId}`;

export function readGridView(stateId: string): GridView | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(key(stateId)) ?? 'null');
    return v && typeof v === 'object' && Array.isArray(v.order) && v.cols ? v : null;
  } catch { return null; }
}

export function saveGridView(stateId: string, view: GridView) {
  try { sessionStorage.setItem(key(stateId), JSON.stringify(view)); } catch { /* storage unavailable: the view lasts until the page is left */ }
}

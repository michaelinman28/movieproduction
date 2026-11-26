import { useTheme } from '../lib/theme';

/** What a server-paged table asks for: the grid's filters, sort and quick search. */
export interface GridQuery {
  /** lattice-grid filter models by column id, e.g. { who: { type: 'set', values: ['Ana'] } }. */
  filters: Record<string, { type: string; values?: string[]; op?: string; value?: unknown; value2?: unknown }>;
  sorts: { id: string; dir: 'asc' | 'desc' }[];
  quick: string;
}

/** Paging for a table whose rows come from the server one page at a time (see useServerPages). */
export interface ServerPaging {
  page: number;
  pageSize: number;
  /** Rows matching the filters, on every page. */
  total: number;
  loading?: boolean;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onQuery: (q: GridQuery) => void;
}

const SIZES = [25, 50, 100, 250];
/** The pager shows once this many rows match. */
const SHOW_FROM = 25;
const fmt = new Intl.NumberFormat();

/** The pager under a server-paged table, shown once 25 or more rows match. */
export function ServerPager({ page, pageSize, total, loading, onPage, onPageSize }: ServerPaging) {
  const { theme } = useTheme();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  // Shown once 25 or more rows match (Michael, 2026-11-26); fewer fit without paging.
  if (total < SHOW_FROM) return null;
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min(total, (page + 1) * pageSize);
  const btn = (text: string, title: string, p: number, off: boolean) => (
    <button type="button" className="lg-btn lg-btn-sm" title={title} aria-label={title} disabled={off || loading} onClick={() => onPage(p)}>{text}</button>
  );
  // Two rows on phones: rows per page and the count, then the page buttons and
  // "Page x of y". From sm: up they share one row.
  return (
    <div className={`lg-root lg-theme-${theme} lg-pager server-pager`} style={{ height: 'auto', minHeight: 0, marginTop: 4 }}>
      <div className="server-pager-row">
        <label className="flex items-center gap-2">
          Rows per page
          <select aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(+e.target.value)}>
            {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span>{fmt.format(from)}–{fmt.format(to)} of {fmt.format(total)}</span>
      </div>
      <div className="server-pager-row">
        {btn('«', 'First page', 0, page === 0)}
        {btn('‹', 'Previous page', page - 1, page === 0)}
        <span className="whitespace-nowrap">Page {page + 1} of {pages}</span>
        {btn('›', 'Next page', page + 1, page >= pages - 1)}
        {btn('»', 'Last page', pages - 1, page >= pages - 1)}
      </div>
    </div>
  );
}

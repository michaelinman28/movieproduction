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
const fmt = new Intl.NumberFormat();

/** The pager under a server-paged table; looks like lattice-grid's own pager. */
export function ServerPager({ page, pageSize, total, loading, onPage, onPageSize }: ServerPaging) {
  const { theme } = useTheme();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (!total) return null;
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min(total, (page + 1) * pageSize);
  const btn = (text: string, title: string, p: number, off: boolean) => (
    <button type="button" className="lg-btn lg-btn-sm" title={title} aria-label={title} disabled={off || loading} onClick={() => onPage(p)}>{text}</button>
  );
  return (
    <div className={`lg-root lg-theme-${theme} lg-pager`} style={{ flexDirection: 'row', height: 'auto', minHeight: 0, marginTop: 4 }}>
      <span>Rows per page</span>
      <select aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(+e.target.value)}>
        {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <span>{fmt.format(from)}–{fmt.format(to)} of {fmt.format(total)}</span>
      {btn('«', 'First page', 0, page === 0)}
      {btn('‹', 'Previous page', page - 1, page === 0)}
      <span>Page {page + 1} of {pages}</span>
      {btn('›', 'Next page', page + 1, page >= pages - 1)}
      {btn('»', 'Last page', pages - 1, page >= pages - 1)}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GridQuery, ServerPaging } from '../components/ServerPager';
import { PAGE_SIZE, readGridView, saveGridView } from './gridView';
import { errorText } from './format';

export interface PageRequest { offset: number; limit: number; query: GridQuery }

/**
 * Loads a server-paged table one page at a time (see `paging` on LatticeGrid). `fetch`
 * gets the page wanted and the grid's filters, sort and quick search, and returns that
 * page's items with the total matching on every page. Rows per page are kept with the
 * table's view (`stateId`). A filter, sort or search change goes back to page 1.
 */
export function useServerPages<T>(stateId: string, fetch: (r: PageRequest) => Promise<{ items: T[]; total: number }>, initial?: Partial<GridQuery>) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(() => readGridView(stateId)?.pageSize ?? PAGE_SIZE);
  const [query, setQuery] = useState<GridQuery>({ filters: {}, sorts: [], quick: '', ...initial });
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = useRef(0);
  const queryRef = useRef(query);

  const load = useCallback(async () => {
    const n = ++ask.current;
    setLoading(true);
    try {
      const r = await fetch({ offset: page * pageSize, limit: pageSize, query });
      if (n !== ask.current) return; // a newer request is on its way
      setItems(r.items); setTotal(r.total); setError(null);
      // Fewer rows than the page asked for (some were removed): show the last page.
      if (!r.items.length && page > 0 && r.total > 0) setPage(Math.max(0, Math.ceil(r.total / pageSize) - 1));
    } catch (e) {
      if (n === ask.current) setError(errorText(e));
    }
    if (n === ask.current) { setLoading(false); setLoaded(true); }
  }, [fetch, page, pageSize, query]);
  useEffect(() => { load(); }, [load]);

  const paging: ServerPaging = {
    page, pageSize, total, loading,
    onPage: setPage,
    onPageSize: (size) => {
      setPageSize(size); setPage(0);
      const v = readGridView(stateId);
      saveGridView(stateId, { order: [], cols: {}, sorts: [], ...v, pageSize: size });
    },
    onQuery: (q) => {
      if (JSON.stringify(queryRef.current) === JSON.stringify(q)) return;
      queryRef.current = q;
      setQuery(q);
      setPage(0);
    },
  };
  return { items, total, loaded, loading, error, paging, reload: load };
}

/** The values ticked in a set (dropdown) filter, or undefined when the column isn't filtered. */
export const setValues = (q: GridQuery, col: string) => {
  const f = q.filters[col];
  return f?.type === 'set' ? f.values ?? [] : undefined;
};

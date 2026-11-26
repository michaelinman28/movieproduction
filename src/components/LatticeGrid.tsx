import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { tableDate } from '../lib/format';
import { useNavigate } from 'react-router-dom';
import { PickManyMenu, type PickManyOpen } from './PickManyMenu';
import { useTheme } from '../lib/theme';
import { confirmDiscard } from '../lib/unsaved';
import { isItemLink, linkOut } from '../lib/backLink';
import { mapsUrl, openMaps } from '../lib/maps';
import { PAGE_SIZE, readGridView, saveGridView } from '../lib/gridView';
import { ServerPager, type ServerPaging } from './ServerPager';
import { ColumnChooser, type ChooserColumn } from './ColumnChooser';
import '../vendor/lattice-grid/lattice-grid.js';
import '../vendor/lattice-grid/lattice-grid.css';
import type {
  LatticeGridInstance,
  LatticeGridOptions,
} from '../vendor/lattice-grid/lattice-grid';

type Handlers = Record<string, (payload: any) => void>;

/**
 * A column whose cell holds several picks from a list (e.g. the characters someone
 * plays): add `pickMany` to the column (and leave `editable` off). One click, or Enter,
 * opens a dropdown of tick boxes; the cell saves when it closes, through
 * `cellValueChanged` with `newValue` set to the picked ids. The column gets a dropdown
 * filter of each name (its value should be the names, comma-separated).
 */
export interface PickMany<Row> {
  choices: (row: Row) => { id: string; name: string }[];
  selected: (row: Row) => string[];
  editable?: boolean | ((row: Row) => boolean);
}

interface Props<Row> {
  /**
   * Names this table (e.g. "project.tasks") so the person's view of it (columns shown
   * with the Columns button, widths, order, sort) is kept for the rest of their browser
   * session, across pages.
   */
  stateId: string;
  /** Grid options. The grid is rebuilt when this object changes, so memoize it. */
  options: LatticeGridOptions<Row>;
  /** Rows to show. Updating this prop calls setRows without rebuilding the grid. */
  rows: Row[];
  /** Grid events, e.g. { cellValueChanged: (e) => ... }. */
  on?: Handlers;
  /** Gives access to the grid instance for API calls. */
  onReady?: (grid: LatticeGridInstance<Row>) => void;
  height?: number | string;
  className?: string;
  /**
   * Selects this row and scrolls it into view once it's in `rows`; used after adding
   * something, so the new row is highlighted while its form opens. Change `n` to show
   * the same row again.
   */
  reveal?: { id: string; n: number } | null;
  /**
   * For a table whose rows the server pages, sorts and filters (logs that keep growing,
   * such as the activity log). `rows` is then just the current page; the grid's own
   * filtering and paging are off, and filter, sort and quick search changes go to
   * `paging.onQuery`. See ServerPaging.
   */
  paging?: ServerPaging;
}

/** Whether the main pointer is a finger (iPad, phone) rather than a mouse. */
const touchScreen = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;
const TOUCH_SIZES = { rowHeight: 44, headerHeight: 44, groupHeaderHeight: 36, floatingFilterHeight: 48 };
const TOUCH = typeof window !== 'undefined' && touchScreen();
/** A table row's height: 34px with a mouse, 44px on a touch screen. */
export const ROW_H = TOUCH ? TOUCH_SIZES.rowHeight : 34;

/**
 * A table's height for `rows` rows: `chrome` px for its toolbar and header rows (as
 * measured with a mouse), then a row height each, up to `max` (also taller on touch
 * screens, where rows and headers are bigger).
 */
export function gridHeight(chrome: number, rows: number, max: number) {
  const extra = TOUCH ? 20 : 0;
  const cap = TOUCH ? Math.round(max * 1.25) : max;
  return Math.min(chrome + extra + rows * ROW_H, cap);
}

// lattice-grid's own CSS sets min-height: 240px; match it so the box doesn't overflow.
const MIN_GRID_HEIGHT = 240;

/** React wrapper around Michael's lattice-grid library. */
export function LatticeGrid<Row>({ stateId, options, rows, on, onReady, height = 480, className, reveal, paging }: Props<Row>) {
  const pagingRef = useRef(paging);
  pagingRef.current = paging;
  const server = !!paging;
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<LatticeGridInstance<Row> | null>(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const handlersRef = useRef<Handlers | undefined>(on);
  handlersRef.current = on;
  const stateIdRef = useRef(stateId);
  stateIdRef.current = stateId;
  // The table's own columns (not the tree or tick-box columns) for the Columns button.
  const [chooser, setChooser] = useState<ChooserColumn[]>([]);
  // The open pick-many dropdown, if any.
  const [picker, setPicker] = useState<PickManyOpen | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const savedView = readGridView(stateIdRef.current);
    const grid = new window.LatticeGrid<Row>(containerRef.current, {
      theme: themeRef.current,
      // Only tables paged by the server (`paging`: activity log, Project notes) page;
      // every other table shows all its rows in one scrolling list (see ARCHITECTURE.md).
      // A table can still turn on lattice-grid's own pager with `pagination: true`.
      pagination: false,
      pageSize: savedView?.pageSize ?? PAGE_SIZE,
      serverSide: server,
      // Touch screens (iPad, phones) get rows and header rows tall enough to tap (44px);
      // a mouse keeps the compact sizes. The matching CSS is in styles.css (pointer: coarse).
      ...(touchScreen() ? TOUCH_SIZES : {}),
      ...options,
      // A pick-list column (editor: 'select') filters by ticking values from a dropdown
      // list instead of typing, unless the column sets its own filter.
      // A pick-many column filters by each name in it.
      // Date columns show dates as 'Mar 12, 2027' (the value, filters and editor stay ISO).
      columns: (options.columns as { editor?: string; filter?: unknown; pickMany?: unknown; filterSplit?: string; type?: string; format?: unknown }[] | undefined)?.map((c) =>
        c.type === 'date' && !c.format ? { ...c, format: (v: unknown) => (v ? tableDate(String(v)) : '') } : c).map((c) =>
        c.pickMany && c.filter === undefined ? { ...c, filter: 'set', filterSplit: c.filterSplit ?? ',' }
          : c.editor === 'select' && c.filter === undefined ? { ...c, filter: 'set' } : c) as LatticeGridOptions<Row>['columns'],
      rows: rowsRef.current,
    });
    gridRef.current = grid;

    // Forward events through a ref so handler changes don't rebuild the grid.
    const forwarders: Handlers = {};
    for (const name of Object.keys(handlersRef.current ?? {})) {
      forwarders[name] = (payload) => handlersRef.current?.[name]?.(payload);
      grid.on(name, forwarders[name]);
    }

    // A pick-list editor saves as soon as something is picked, instead of waiting
    // for Enter or for focus to move away.
    const container = containerRef.current;
    const onChange = (e: Event) => {
      const t = e.target as HTMLElement;
      const g = grid as unknown as { editing?: { input?: unknown } | null; stopEdit?: (commit: boolean) => boolean };
      if (t.tagName === 'SELECT' && t.classList.contains('lg-editor') && g.editing?.input === t) g.stopEdit?.(true);
    };
    container.addEventListener('change', onChange);

    // A click on a pick-list cell (editor: 'select') opens its list straight away;
    // keyboard movement only focuses the cell. `visible`, `display`, `_isEditable`,
    // `editing` and `startEdit` are lattice-grid internals outside its type declarations.
    let clickedAt = 0;
    const onPointer = () => { clickedAt = Date.now(); };
    container.addEventListener('pointerdown', onPointer, true);

    // Pick-many cells (see PickMany) open a dropdown of tick boxes on a click or Enter.
    // `display`, `visible`, `focus` and `_cellEl` are lattice-grid internals.
    const gp = grid as unknown as {
      display?: { node?: { data?: Row } }[]; visible?: { id: string; def?: { pickMany?: PickMany<Row> } }[];
      focus?: { r: number; c: number } | null; _cellEl?: (r: number, c: number) => HTMLElement | null;
    };
    const openPickMany = (r: number, c: number) => {
      const col = gp.visible?.[c];
      const pm = col?.def?.pickMany;
      const row = gp.display?.[r]?.node?.data;
      if (!pm || row === undefined) return false;
      if (!(typeof pm.editable === 'function' ? pm.editable(row) : pm.editable ?? true)) return false;
      const cell = gp._cellEl?.(r, c);
      if (!cell) return false;
      const selected = pm.selected(row);
      setPicker({
        rect: cell.getBoundingClientRect(), choices: pm.choices(row), selected,
        done: (ids) => {
          setPicker(null);
          (grid as unknown as { viewport?: HTMLElement }).viewport?.focus({ preventScroll: true });
          if (ids && (ids.length !== selected.length || ids.some((id) => !selected.includes(id)))) {
            handlersRef.current?.cellValueChanged?.({ data: row, column: col!.id, oldValue: selected, newValue: ids });
          }
        },
      });
      return true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || (e.target as HTMLElement).closest('.lg-editor')) return;
      const f = gp.focus;
      if (f && openPickMany(f.r, f.c)) { e.preventDefault(); e.stopPropagation(); }
    };
    container.addEventListener('keydown', onKey, true);
    grid.on('rangeChanged', (r: { r1: number; r2: number; c1: number; c2: number }) => {
      const g = grid as unknown as {
        display?: unknown[]; visible?: { def?: { editor?: string } }[];
        _isEditable?: (col: unknown, entry: unknown) => boolean;
        startEdit?: (r: number, c: number) => boolean; editing?: { input?: HTMLSelectElement } | null;
      };
      const col = g.visible?.[r.c1];
      if (r.r1 === r.r2 && r.c1 === r.c2 && Date.now() - clickedAt <= 400 && openPickMany(r.r1, r.c1)) { clickedAt = 0; return; }
      if (r.r1 !== r.r2 || r.c1 !== r.c2 || col?.def?.editor !== 'select' || Date.now() - clickedAt > 400) return;
      if (!g._isEditable?.(col, g.display?.[r.r1])) return;
      clickedAt = 0;
      // Wait for the grid to finish handling the click, which redraws the row.
      setTimeout(() => {
        if (g.editing || !g.startEdit?.(r.r1, r.c1)) return;
        const input = (g as { editing?: { input?: HTMLSelectElement } | null }).editing?.input;
        try { (input as HTMLSelectElement & { showPicker?: () => void })?.showPicker?.(); } catch { /* not supported; the list is focused */ }
      }, 0);
    });

    // Phones: no pinned (frozen) columns, so the whole table scrolls sideways together
    // and the first column doesn't take up the narrow screen. Larger screens keep them.
    // `cols`, the special columns and `_afterModelChange` are lattice-grid internals.
    const phone = window.matchMedia('(max-width: 639px)');
    const gi = grid as unknown as {
      cols?: { pinned?: string | null }[]; _groupCol?: { pinned?: string | null }; _selCol?: { pinned?: string | null };
      _dragCol?: { pinned?: string | null }; _afterModelChange?: () => void;
    };
    const ownPin = new Map<object, string | null | undefined>();
    const applyPins = () => {
      for (const c of [...(gi.cols ?? []), gi._groupCol, gi._selCol, gi._dragCol]) {
        if (!c) continue;
        if (!ownPin.has(c)) ownPin.set(c, c.pinned);
        c.pinned = phone.matches ? null : ownPin.get(c) ?? null;
      }
      gi._afterModelChange?.();
    };
    // The view the person set up earlier this session: columns shown, widths, order
    // and sort. Saved whenever any of them changes, including through lattice-grid's
    // own menu (Hide column, Reset columns, Autosize). `cols`, `sorts`, `_groupCol`,
    // `refresh` and the wrapped methods are lattice-grid internals.
    type Col = { id: string; header?: string; hidden?: boolean; width: number; flex: number; special?: string };
    const gc = grid as unknown as {
      cols: Col[]; sorts: { id: string; dir: 'asc' | 'desc' }[]; _groupCol?: { width: number; flex: number };
      colMap: Map<string, Col>; refresh: () => void;
      setColumnVisible: (id: string, visible: boolean) => void; resetColumns: () => void;
      autoSizeColumn: (id: string, skipRender?: boolean) => void; autoSizeAll: () => void;
    };
    const userCols = () => gc.cols.filter((c) => !c.special);
    const sync = () => setChooser(userCols().map((c) => ({
      id: c.id, hidden: !!c.hidden,
      header: c.header || c.id.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()),
    })));
    const remember = () => {
      // Keep what's saved for columns this view doesn't have (e.g. the Task column,
      // which only the flat task views show), so switching views doesn't lose it.
      const before = readGridView(stateIdRef.current);
      const ids = gc.cols.map((c) => c.id);
      const order = [...ids];
      (before?.order ?? []).forEach((id, i, all) => {
        if (order.includes(id)) return;
        const prev = i > 0 ? order.indexOf(all[i - 1]) : -1;
        order.splice(prev + 1, 0, id);
      });
      saveGridView(stateIdRef.current, {
        order,
        cols: { ...before?.cols, ...Object.fromEntries(gc.cols.map((c) => [c.id, { hidden: !!c.hidden, width: c.width, flex: c.flex }])) },
        group: gc._groupCol ? { width: gc._groupCol.width, flex: gc._groupCol.flex } : undefined,
        sorts: gc.sorts.map((x) => ({ id: x.id, dir: x.dir })),
        // A server-paged table's rows per page are saved by useServerPages.
        pageSize: server ? before?.pageSize : (grid as unknown as { o: { pageSize: number } }).o.pageSize,
      });
      sync();
    };
    const saved = savedView;
    if (saved) {
      // Saved order, then each column the saved view doesn't know (one added since, or
      // one only some views have, like the Task column outside the task tree) goes back
      // next to its default neighbour, so it isn't pushed to the end.
      const byId = new Map(gc.cols.map((c) => [c.id, c]));
      const order = saved.order.filter((id) => byId.has(id));
      gc.cols.forEach((c, i) => {
        if (order.includes(c.id)) return;
        const before = i > 0 ? order.indexOf(gc.cols[i - 1].id) : -1;
        order.splice(before + 1, 0, c.id);
      });
      gc.cols.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
      for (const c of gc.cols) {
        const v = saved.cols[c.id];
        if (v) { c.hidden = v.hidden; c.width = v.width; c.flex = v.flex; }
      }
      const cols = userCols();
      if (cols.length && cols.every((c) => c.hidden)) cols[0].hidden = false;
      if (saved.group && gc._groupCol) Object.assign(gc._groupCol, saved.group);
      gc.sorts = (saved.sorts ?? []).filter((x) => gc.colMap.has(x.id) || x.id === '__group');
      gc.refresh();
    }
    for (const name of ['columnResized', 'columnMoved', 'sortChanged', 'paginationChanged']) grid.on(name, () => remember());

    // Server-paged tables: hand filter, sort and quick search changes to the page.
    // `quickFilter` is a lattice-grid internal.
    const query = () => pagingRef.current?.onQuery({
      filters: grid.getFilterModel?.() ?? {}, sorts: gc.sorts.map((x) => ({ id: x.id, dir: x.dir })),
      quick: (grid as unknown as { quickFilter?: string }).quickFilter ?? '',
    });
    if (server) { grid.on('filterChanged', query); grid.on('sortChanged', query); query(); }
    const setVisible = gc.setColumnVisible.bind(grid);
    gc.setColumnVisible = (id, visible) => { setVisible(id, visible); remember(); };
    const reset = gc.resetColumns.bind(grid);
    gc.resetColumns = () => { reset(); if (phone.matches) applyPins(); remember(); };
    const autoSize = gc.autoSizeColumn.bind(grid);
    gc.autoSizeColumn = (id, skipRender) => { autoSize(id, skipRender); if (!skipRender) remember(); };
    const autoSizeAll = gc.autoSizeAll.bind(grid);
    gc.autoSizeAll = () => { autoSizeAll(); remember(); };
    sync();

    if (phone.matches) applyPins();
    phone.addEventListener('change', applyPins);

    onReady?.(grid);
    return () => {
      phone.removeEventListener('change', applyPins);
      container.removeEventListener('change', onChange);
      container.removeEventListener('pointerdown', onPointer, true);
      container.removeEventListener('keydown', onKey, true);
      setPicker(null);
      grid.destroy();
      gridRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  useEffect(() => {
    gridRef.current?.setRows(rows);
  }, [rows]);

  // Highlight a newly added row. `nodeById`, `display`, `visible`, `selected`,
  // `_setRange` and `_renderRows` are lattice-grid internals outside its type declarations.
  const revealed = useRef<{ id: string; n: number } | null>(null);
  useEffect(() => {
    const g = gridRef.current as unknown as {
      nodeById?: Map<string, { id: string; data?: unknown }>; display?: { node?: { data?: unknown } }[]; visible?: { special?: string }[];
      selected?: Set<string>; o?: { selection?: string };
      _setRange?: (a: { r: number; c: number }, b: { r: number; c: number }) => void;
      ensureVisible?: (r: number, c: number) => void; _renderRows?: () => void;
    } | null;
    if (!g || !reveal || revealed.current === reveal) return;
    const node = g.nodeById?.get(String(reveal.id));
    if (!node) return; // not loaded yet; tries again when rows change
    revealed.current = reveal;
    if (g.o?.selection === 'single' && g.selected) { g.selected.clear(); g.selected.add(node.id); }
    // In tree mode the display wraps rows in tree nodes, so match on the row itself.
    // Paged: go to the page the row is on first. `allDisplay`, `pageOfDisplayIndex`,
    // `page` and `setPage` are lattice-grid internals (pageOfDisplayIndex is a local patch).
    const gp = g as unknown as { allDisplay?: { node?: { data?: unknown } }[]; page?: number; pageOfDisplayIndex?: (i: number) => number; setPage?: (p: number) => void; o?: { pagination?: boolean } };
    const match = (e: { node?: { data?: unknown } }) => e.node === node || (e.node?.data !== undefined && e.node.data === node.data);
    if (gp.o?.pagination && gp.allDisplay && gp.pageOfDisplayIndex) {
      const i = gp.allDisplay.findIndex(match);
      const p = i >= 0 ? gp.pageOfDisplayIndex(i) : gp.page;
      if (p !== undefined && p !== gp.page) gp.setPage?.(p);
    }
    const r = g.display?.findIndex(match) ?? -1;
    const c = Math.max(0, g.visible?.findIndex((col) => !col.special || col.special === 'group') ?? 0);
    if (r >= 0) { g._setRange?.({ r, c }, { r, c }); g.ensureVisible?.(r, c); } else g._renderRows?.();
  }, [rows, reveal]);

  const columnApi = () => gridRef.current as unknown as { setColumnVisible: (id: string, visible: boolean) => void } | null;

  // Follow the app's light/dark switch.
  useEffect(() => {
    if (!options.theme) gridRef.current?.setTheme(theme);
  }, [theme, options.theme]);

  // Cells can render <a data-to="/path"> links (see gridLink); route them in-app.
  // The grid redraws cells on mousedown, so act on mousedown before it does.
  const navigate = useNavigate();
  function onMouseDown(e: MouseEvent<HTMLDivElement>) {
    // Map links (see gridMapLink) open the device's maps app.
    const m = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-map]');
    if (m && e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      openMaps(m.dataset.map!);
      return;
    }
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-to]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!confirmDiscard()) return;
    const to = a.dataset.to!;
    // Item links remember where they were followed from ("Back to …", src/lib/backLink.ts).
    if (isItemLink(to)) linkOut(navigate, to, a); else navigate(to);
  }
  function onClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('a[data-map]')) { e.preventDefault(); return; }
    if ((e.target as HTMLElement).closest('a[data-to]') && !(e.metaKey || e.ctrlKey || e.shiftKey)) e.preventDefault();
  }

  return (
    <div className="flex flex-col">
      <ColumnChooser columns={chooser}
        onToggle={(id, visible) => columnApi()?.setColumnVisible(id, visible)}
        onShowAll={() => chooser.filter((c) => c.hidden).forEach((c) => columnApi()?.setColumnVisible(c.id, true))} />
      <div ref={containerRef} className={className}
        style={{ height: typeof height === 'number' ? Math.max(height, MIN_GRID_HEIGHT) : height }}
        onMouseDownCapture={onMouseDown} onClick={onClick} />
      {paging && <ServerPager {...paging} />}
      {picker && <PickManyMenu {...picker} />}
    </div>
  );
}

/** A cell link for a column's render option: { render: ({ data }) => gridLink(data.name, `/x/${data.id}`) }. */
export function gridLink(text: string, to: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = appPath(to);
  a.dataset.to = to;
  a.textContent = text;
  a.className = 'grid-link';
  return a;
}

/** A cell link that opens an address in the device's maps app. */
export function gridMapLink(text: string, address: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = mapsUrl(address);
  a.dataset.map = address;
  a.textContent = text;
  a.className = 'grid-link';
  a.title = `Open ${address} in maps`;
  return a;
}

/** Escapes text for a cell render that returns HTML. */
export const gridEsc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const appPath = (to: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + to;

/** Cell HTML for a link to an item's home page (see itemPath in src/lib/links.ts). */
export const gridLinkHtml = (text: string, to: string, title?: string) =>
  `<a class="grid-link" href="${gridEsc(appPath(to))}" data-to="${gridEsc(to)}"${title ? ` title="${gridEsc(title)}"` : ''}>${gridEsc(text)}</a>`;

/** Cell HTML for a list of items (e.g. a day's scenes), each linking to its home page. */
export const gridLinkList = (items: { text: string; to: string; title?: string }[]) =>
  items.map((i) => gridLinkHtml(i.text, i.to, i.title)).join(', ');

const OPEN_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M6 3h7v7M13 3 4 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Cell HTML for a pick-list column: the value with a caret, so it reads as a dropdown.
 * When the value is another item (a location, a person, a category), pass `open` to add
 * a small open button that goes to that item's home page; a click elsewhere in the cell
 * still opens the list.
 */
export const gridDropdown = (html: string, open?: { to: string; title: string } | null) =>
  `<span class="cell-dd"><span class="cell-dd-value">${html}</span>${open
    ? `<a class="cell-open" href="${gridEsc(appPath(open.to))}" data-to="${gridEsc(open.to)}" title="${gridEsc(open.title)}" aria-label="${gridEsc(open.title)}">${OPEN_ICON}</a>`
    : ''}<span class="cell-dd-caret">▾</span></span>`;

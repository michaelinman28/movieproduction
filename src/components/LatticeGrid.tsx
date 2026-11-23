import { useEffect, useRef, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { confirmDiscard } from '../lib/unsaved';
import '../vendor/lattice-grid/lattice-grid.js';
import '../vendor/lattice-grid/lattice-grid.css';
import type {
  LatticeGridInstance,
  LatticeGridOptions,
} from '../vendor/lattice-grid/lattice-grid';

type Handlers = Record<string, (payload: any) => void>;

interface Props<Row> {
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
}

// lattice-grid's own CSS sets min-height: 240px; match it so the box doesn't overflow.
const MIN_GRID_HEIGHT = 240;

/** React wrapper around Michael's lattice-grid library. */
export function LatticeGrid<Row>({ options, rows, on, onReady, height = 480, className }: Props<Row>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<LatticeGridInstance<Row> | null>(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const handlersRef = useRef<Handlers | undefined>(on);
  handlersRef.current = on;

  useEffect(() => {
    if (!containerRef.current) return;
    const grid = new window.LatticeGrid<Row>(containerRef.current, {
      theme: themeRef.current,
      ...options,
      // A pick-list column (editor: 'select') filters by ticking values from a dropdown
      // list instead of typing, unless the column sets its own filter.
      columns: (options.columns as { editor?: string; filter?: unknown }[] | undefined)?.map((c) =>
        c.editor === 'select' && c.filter === undefined ? { ...c, filter: 'set' } : c) as LatticeGridOptions<Row>['columns'],
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
    grid.on('rangeChanged', (r: { r1: number; r2: number; c1: number; c2: number }) => {
      const g = grid as unknown as {
        display?: unknown[]; visible?: { def?: { editor?: string } }[];
        _isEditable?: (col: unknown, entry: unknown) => boolean;
        startEdit?: (r: number, c: number) => boolean; editing?: { input?: HTMLSelectElement } | null;
      };
      const col = g.visible?.[r.c1];
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

    onReady?.(grid);
    return () => {
      container.removeEventListener('change', onChange);
      container.removeEventListener('pointerdown', onPointer, true);
      grid.destroy();
      gridRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  useEffect(() => {
    gridRef.current?.setRows(rows);
  }, [rows]);

  // Follow the app's light/dark switch.
  useEffect(() => {
    if (!options.theme) gridRef.current?.setTheme(theme);
  }, [theme, options.theme]);

  // Cells can render <a data-to="/path"> links (see gridLink); route them in-app.
  // The grid redraws cells on mousedown, so act on mousedown before it does.
  const navigate = useNavigate();
  function onMouseDown(e: MouseEvent<HTMLDivElement>) {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-to]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (confirmDiscard()) navigate(a.dataset.to!);
  }
  function onClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('a[data-to]') && !(e.metaKey || e.ctrlKey || e.shiftKey)) e.preventDefault();
  }

  return (
    <div ref={containerRef} className={className}
      style={{ height: typeof height === 'number' ? Math.max(height, MIN_GRID_HEIGHT) : height }}
      onMouseDownCapture={onMouseDown} onClick={onClick} />
  );
}

/** A cell link for a column's render option: { render: ({ data }) => gridLink(data.name, `/x/${data.id}`) }. */
export function gridLink(text: string, to: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = import.meta.env.BASE_URL.replace(/\/$/, '') + to;
  a.dataset.to = to;
  a.textContent = text;
  a.className = 'grid-link';
  return a;
}

/** Escapes text for a cell render that returns HTML. */
export const gridEsc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Cell HTML for a pick-list column: the value with a caret, so it reads as a dropdown. */
export const gridDropdown = (html: string) =>
  `<span class="cell-dd"><span class="cell-dd-value">${html}</span><span class="cell-dd-caret">▾</span></span>`;

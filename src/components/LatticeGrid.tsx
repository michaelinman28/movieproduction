import { useEffect, useRef, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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

function prefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

/** React wrapper around Michael's lattice-grid library. */
export function LatticeGrid<Row>({ options, rows, on, onReady, height = 480, className }: Props<Row>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<LatticeGridInstance<Row> | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const handlersRef = useRef<Handlers | undefined>(on);
  handlersRef.current = on;

  useEffect(() => {
    if (!containerRef.current) return;
    const grid = new window.LatticeGrid<Row>(containerRef.current, {
      theme: prefersDark() ? 'dark' : 'light',
      ...options,
      rows: rowsRef.current,
    });
    gridRef.current = grid;

    // Forward events through a ref so handler changes don't rebuild the grid.
    const forwarders: Handlers = {};
    for (const name of Object.keys(handlersRef.current ?? {})) {
      forwarders[name] = (payload) => handlersRef.current?.[name]?.(payload);
      grid.on(name, forwarders[name]);
    }

    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onScheme = (e: MediaQueryListEvent) => grid.setTheme(e.matches ? 'dark' : 'light');
    if (!options.theme) media?.addEventListener('change', onScheme);

    onReady?.(grid);
    return () => {
      media?.removeEventListener('change', onScheme);
      grid.destroy();
      gridRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  useEffect(() => {
    gridRef.current?.setRows(rows);
  }, [rows]);

  // Cells can render <a data-to="/path"> links (see gridLink); route them in-app.
  // The grid redraws cells on mousedown, so act on mousedown before it does.
  const navigate = useNavigate();
  function onMouseDown(e: MouseEvent<HTMLDivElement>) {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-to]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    navigate(a.dataset.to!);
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

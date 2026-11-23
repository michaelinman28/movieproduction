import { useEffect, useRef } from 'react';
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

  return <div ref={containerRef} className={className} style={{ height }} />;
}

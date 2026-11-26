// Minimal type declarations for the vendored lattice-grid library.

export interface LatticeColumn<Row = any> {
  field?: keyof Row & string | string;
  header?: string;
  type?: 'text' | 'number' | 'date' | 'boolean' | string;
  width?: number;
  children?: LatticeColumn<Row>[];
  [option: string]: unknown;
}

export interface LatticeGridOptions<Row = any> {
  columns: LatticeColumn<Row>[];
  rows?: Row[];
  rowId?: (row: Row) => string | number;
  treeData?: boolean;
  getTreePath?: (row: Row) => string[];
  theme?: 'light' | 'dark';
  [option: string]: unknown;
}

export interface LatticeGridInstance<Row = any> {
  setRows(rows: Row[]): void;
  getRows(): Row[];
  addRows(rows: Row[]): void;
  removeRows(ids: Array<string | number> | ((row: Row) => boolean)): void;
  updateRows(partials: Partial<Row>[]): void;
  refresh(): void;
  getSelectedRows(): Row[];
  setTheme(theme: 'light' | 'dark'): void;
  setQuickFilter(text: string): void;
  getFilterModel(): Record<string, any>;
  on(event: string, handler: (payload: any) => void): void;
  off(event: string, handler: (payload: any) => void): void;
  destroy(): void;
}

export interface LatticeGridConstructor {
  new <Row = any>(target: string | HTMLElement, options: LatticeGridOptions<Row>): LatticeGridInstance<Row>;
  version: string;
}

declare global {
  interface Window {
    LatticeGrid: LatticeGridConstructor;
  }
}

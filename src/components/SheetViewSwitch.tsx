import { useState } from 'react';
import type { SheetData } from './CallSheetDocument';

/** How a person sees call sheets on a project (the API's ProjectView). */
export type SheetViewer = 'crew' | 'cast' | 'both';
/** What's showing: the reader's own call, or the whole day. */
export type SheetMode = 'mine' | 'full';

const KEY = 'mp-call-sheet-view';

/**
 * Cast only always see their own call; crew see the full sheet; people who are both
 * switch between the two, starting on My call. The last choice is kept on this device.
 */
export function useSheetMode(viewer: SheetViewer): [SheetMode, (m: SheetMode) => void] {
  const [chosen, setChosen] = useState<SheetMode>(() => {
    try { return localStorage.getItem(KEY) === 'full' ? 'full' : 'mine'; } catch { return 'mine'; }
  });
  const choose = (m: SheetMode) => {
    setChosen(m);
    try { localStorage.setItem(KEY, m); } catch { /* the choice just isn't kept */ }
  };
  const mode: SheetMode = viewer === 'cast' ? 'mine' : viewer === 'crew' ? 'full' : chosen;
  return [mode, choose];
}

/** The sheet with only the reader's own call (and so only their own dietary needs). */
export function ownSheet<T extends SheetData>(sheet: T, me: string | null | undefined): T {
  return { ...sheet, calls: sheet.calls.filter((c) => c.user_id === me) };
}

/** The My call / Full sheet switch, for people who are both cast and crew. */
export function SheetViewSwitch({ mode, onChange }: { mode: SheetMode; onChange: (m: SheetMode) => void }) {
  return (
    <div className="no-print flex rounded-md border border-line bg-surface p-0.5 sm:self-start" role="radiogroup" aria-label="Call sheet view">
      {([['mine', 'My call'], ['full', 'Full sheet']] as const).map(([m, label]) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m}
          className={`min-h-11 flex-1 rounded px-4 text-sm font-medium sm:flex-none ${mode === m ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-accent-soft'}`}
          onClick={() => onChange(m)}>{label}</button>
      ))}
    </div>
  );
}

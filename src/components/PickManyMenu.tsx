import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

export interface PickManyOpen {
  /** The cell's place on screen, to open under (or above) it. */
  rect: DOMRect;
  choices: { id: string; name: string }[];
  selected: string[];
  /** Called once when it closes: the picked ids, or null when cancelled. */
  done: (ids: string[] | null) => void;
}

/**
 * The dropdown of tick boxes for a table cell that holds several picks (LatticeGrid's
 * `pickMany` columns). Ticks are kept until it closes: Done, Enter, a click outside or
 * scrolling saves; Escape cancels.
 */
export function PickManyMenu({ rect, choices, selected, done }: PickManyOpen) {
  const [picked, setPicked] = useState(selected);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const boxRef = useRef<HTMLDivElement>(null);
  const closed = useRef(false);
  const close = (save: boolean) => {
    if (closed.current) return;
    closed.current = true;
    done(save ? pickedRef.current : null);
  };

  useEffect(() => {
    boxRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    const outside = (e: Event) => { if (!boxRef.current?.contains(e.target as Node)) close(true); };
    const scrolled = (e: Event) => { if (!boxRef.current?.contains(e.target as Node)) close(true); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', () => close(true), { once: true });
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', scrolled, true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const gap = 4;
  const below = window.innerHeight - rect.bottom - gap * 2;
  const above = rect.top - gap * 2;
  const up = below < 200 && above > below;
  const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 16);
  const style: CSSProperties = {
    position: 'fixed', left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width,
    ...(up ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    maxHeight: Math.min(320, Math.max(up ? above : below, 140)),
  };

  return createPortal(
    <div ref={boxRef} className="tag-menu flex flex-col" style={style} role="dialog" aria-label="Pick one or more"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
        else if (e.key === 'Enter') { e.preventDefault(); close(true); }
      }}>
      <div className="min-h-0 flex-1 overflow-auto">
        {choices.length ? choices.map((c) => (
          <label key={c.id} className="check tag-option min-h-11">
            <input type="checkbox" checked={picked.includes(c.id)}
              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((id) => id !== c.id)))} />
            {c.name}
          </label>
        )) : <p className="hint p-2">Nothing to pick yet.</p>}
      </div>
      <div className="flex gap-2 border-t border-line p-1 pt-2">
        <button type="button" className="btn flex-1" onClick={() => close(true)}>Done</button>
        <button type="button" className="btn btn-secondary" onClick={() => close(false)}>Cancel</button>
      </div>
    </div>,
    document.body,
  );
}

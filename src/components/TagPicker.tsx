import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { TaskTag } from '../lib/api';

/**
 * Pick tags from the company's list, or type a new one and press Enter to create it.
 * Suggestions show as soon as the field is focused, in every browser, and narrow as you
 * type, with a "Create" choice when no tag has that exact name.
 *
 * The list is placed against the screen (position: fixed) rather than the field's box,
 * so a side panel that scrolls can't clip it, and it opens upwards when there's more
 * room above the field than below.
 */
export function TagPicker({ tags, selected, onChange, onCreate, disabled }: {
  tags: TaskTag[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onCreate: (name: string) => Promise<TaskTag | null>;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null);

  const chosen = selected.map((id) => tags.find((t) => t.id === id)).filter(Boolean) as TaskTag[];
  const q = text.trim().toLowerCase();
  const exact = tags.find((t) => t.name.toLowerCase() === q);
  const suggestions = useMemo(
    () => tags.filter((t) => !selected.includes(t.id) && (!q || t.name.toLowerCase().includes(q))).slice(0, 8),
    [tags, selected, q],
  );
  // The choices under the field: matching tags, then "Create" when nothing matches exactly.
  const options: { label: string; tag?: TaskTag }[] = [
    ...suggestions.map((t) => ({ label: t.name, tag: t })),
    ...(q && !exact ? [{ label: `Create "${text.trim()}"` }] : []),
  ];

  const showing = open && options.length > 0;
  // Keep the list next to the field while it's open, through scrolling and resizing.
  useEffect(() => {
    if (!showing) return;
    const update = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const gap = 4;
      const below = window.innerHeight - r.bottom - gap * 2;
      const above = r.top - gap * 2;
      const up = below < 160 && above > below;
      setPlace({
        position: 'fixed', left: r.left, width: r.width,
        ...(up ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
        maxHeight: Math.min(256, Math.max(up ? above : below, 96)),
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [showing]);

  async function pick(i: number) {
    const o = options[i];
    if (!o) return;
    setText('');
    setActive(0);
    if (o.tag) { onChange([...selected, o.tag.id]); return; }
    const made = await onCreate(text.trim());
    if (made && !selected.includes(made.id)) onChange([...selected, made.id]);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (!q) return;
      if (exact) {
        setText('');
        if (!selected.includes(exact.id)) onChange([...selected, exact.id]);
      } else pick(active);
    } else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Backspace' && !text && chosen.length) onChange(selected.slice(0, -1));
  }

  return (
    <div className="flex flex-col gap-2">
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags on this task">
          {chosen.map((t) => (
            <li key={t.id} className="tag-chip">
              {t.name}
              {!disabled && (
                <button type="button" aria-label={`Remove ${t.name}`} onClick={() => onChange(selected.filter((id) => id !== t.id))}>×</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="relative">
          <input
            ref={inputRef}
            className="field" placeholder="Add a tag…" value={text} maxLength={40}
            role="combobox" aria-expanded={open && options.length > 0} aria-controls={listId} aria-label="Add a tag"
            onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKey}
          />
          {showing && place && (
            <ul id={listId} role="listbox" className="tag-menu" style={place}>
              {options.map((o, i) => (
                <li key={o.label} role="option" aria-selected={i === active}
                  className={i === active ? 'tag-option tag-option-active' : 'tag-option'}
                  onMouseDown={(e) => { e.preventDefault(); pick(i); }}
                  onMouseEnter={() => setActive(i)}>
                  {o.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

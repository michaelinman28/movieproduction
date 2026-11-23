import { useEffect, useState, type FormEvent } from 'react';
import { useUnsaved } from '../lib/unsaved';

/** A one-field form for renaming the selected item (a category, a tag…). */
export function RenameForm({ label, value, maxLength, onSave }: {
  label: string; value: string; maxLength: number; onSave: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(value);
  useEffect(() => setName(value), [value]);
  useUnsaved(name.trim() !== value);
  function submit(e: FormEvent) {
    e.preventDefault();
    const v = name.trim();
    if (v && v !== value) onSave(v);
  }
  return (
    <form className="form-row" onSubmit={submit}>
      <input className="field" aria-label={label} value={name} maxLength={maxLength} required onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="btn btn-secondary" disabled={!name.trim() || name.trim() === value}>Save</button>
    </form>
  );
}

import { useEffect, useId } from 'react';

// Forms hold changes until Save. Forms with unsaved changes register here, so moving
// to another item or page can ask before throwing the changes away.
const dirty = new Set<string>();

/** Marks the calling form as having unsaved changes while `on` is true. */
export function useUnsaved(on: boolean) {
  const key = useId();
  useEffect(() => {
    if (on) dirty.add(key); else dirty.delete(key);
    return () => { dirty.delete(key); };
  }, [key, on]);
}

export const hasUnsaved = () => dirty.size > 0;

/** True when it's fine to move on: nothing unsaved, or the person agrees to discard it. */
export function confirmDiscard() {
  if (!dirty.size) return true;
  if (!window.confirm('You have changes you haven\'t saved. Discard them?')) return false;
  dirty.clear();
  return true;
}

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Keeps one action button in reach while scrolling.
 *
 * Mark a button with `data-pin` (or `data-pin="2"` to take priority, like a form's
 * Save over the section's Add). When a marked button scrolls up past the top while
 * the section or panel it belongs to (`data-pin-scope`) is still on screen, a copy of
 * it is pinned under the header. A priority button (an open form's Save) is pinned as
 * soon as it is enabled, wherever it is, so it replaces the section's Add right away.
 * Only one button is pinned at a time: the highest priority, then the one nearest the top. The copy clicks the real button, and
 * mirrors its label and whether it is disabled.
 */
export function PinnedAction() {
  const [pin, setPin] = useState<{ label: string; disabled: boolean; className: string; top: number } | null>(null);
  const target = useRef<HTMLButtonElement | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const header = document.querySelector('body header');
      const top = header ? header.getBoundingClientRect().bottom : 0;
      const bottom = window.innerHeight;
      let best: { el: HTMLButtonElement; prio: number; dist: number } | null = null;
      for (const el of document.querySelectorAll<HTMLButtonElement>('main button[data-pin]')) {
        // Hidden or disabled buttons (a Save with nothing to save) aren't worth the space.
        if (!el.offsetParent || el.disabled) continue;
        const scope = el.closest<HTMLElement>('[data-pin-scope]');
        const s = scope?.getBoundingClientRect();
        // The section must still fill some of the screen below the header.
        if (s && (s.bottom < top + 48 || s.top > bottom - 48)) continue;
        const prio = Number(el.dataset.pin) || 1;
        const r = el.getBoundingClientRect();
        // An open form's Save (priority 2) takes the spot as soon as there's something to
        // save, wherever it is, so the pinned button always says Save while changes wait.
        if (prio < 2) {
          // An ordinary button pins once it has scrolled up past the top of the screen
          // (or of its scrolling panel).
          const box = scope && scope.scrollHeight > scope.clientHeight + 1 ? s! : null;
          const visTop = Math.max(top, box ? box.top : top);
          if (r.top >= visTop) continue;
        }
        const dist = Math.abs(r.top - top);
        if (!best || prio > best.prio || (prio === best.prio && dist < best.dist)) best = { el, prio, dist };
      }
      target.current = best?.el ?? null;
      const next = best ? { label: best.el.textContent?.trim() ?? '', disabled: best.el.disabled, className: best.el.className, top } : null;
      setPin((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    // Capture catches scrolling inside panels too. Clicks and typing can show, hide or
    // enable buttons, so check again after them.
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    document.addEventListener('click', schedule, true);
    document.addEventListener('input', schedule, true);
    document.addEventListener('change', schedule, true);
    const observer = new MutationObserver(schedule);
    const main = document.querySelector('main');
    if (main) observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    schedule();
    return () => {
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('click', schedule, true);
      document.removeEventListener('input', schedule, true);
      document.removeEventListener('change', schedule, true);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  function click() {
    const el = target.current;
    if (!el) return;
    // A form that still needs filling in (e.g. an empty "New task" name) scrolls to
    // the field and says what's missing, instead of submitting.
    if (el.type === 'submit' && el.form && !el.form.checkValidity()) {
      el.form.reportValidity();
      return;
    }
    el.click();
  }

  if (!pin) return null;
  return (
    <div className="pinned-action" style={{ top: pin.top }}>
      <div className="mx-auto flex w-full max-w-screen-2xl justify-end px-4">
        <button type="button" className={`${pin.className} w-full sm:w-auto`} disabled={pin.disabled} onClick={click}>
          {pin.label}
        </button>
      </div>
    </div>
  );
}

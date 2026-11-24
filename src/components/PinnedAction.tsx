import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Keeps one action button in reach while scrolling.
 *
 * Mark a button with `data-pin` (or `data-pin="2"` to take priority, like a form's
 * Save over the section's Add). When a marked button scrolls up past the top while
 * the section or panel it belongs to (`data-pin-scope`) is still on screen, a copy of
 * it is pinned under the header. A priority button (an open form's Save) is pinned for as
 * long as its form is open, wherever the form is on the page, disabled until there's
 * something to save; it replaces the section's Add. The same on every page.
 * Only one button is pinned at a time: the highest priority, then the one nearest the top. The copy clicks the real button, and
 * mirrors its label and whether it is disabled.
 *
 * While a button is pinned, a spacer of the bar's height sits in the page above `main`,
 * so the bar never covers the top of the page. When the bar appears or goes away while
 * scrolled down, the page scrolls by the same amount, so what's on screen stays put.
 */
export function PinnedAction() {
  const [pin, setPin] = useState<{ label: string; disabled: boolean; className: string; top: number } | null>(null);
  const target = useRef<HTMLButtonElement | null>(null);
  const { pathname } = useLocation();
  const bar = useRef<HTMLDivElement | null>(null);
  const [space, setSpace] = useState(0);
  const shown = useRef(0);

  // Keep the spacer the bar's height, and keep the view still when it changes.
  useLayoutEffect(() => {
    const h = pin && bar.current ? bar.current.offsetHeight : 0;
    const delta = h - shown.current;
    if (!delta) return;
    shown.current = h;
    setSpace(h);
    if (window.scrollY > 0) window.scrollBy(0, delta);
  }, [pin]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const header = document.querySelector('body header');
      const top = header ? header.getBoundingClientRect().bottom : 0;
      const bottom = window.innerHeight;
      let best: { el: HTMLButtonElement; prio: number; dist: number } | null = null;
      for (const el of document.querySelectorAll<HTMLButtonElement>('main button[data-pin]')) {
        // Hidden buttons (a form that isn't open) never pin.
        if (!el.offsetParent) continue;
        const prio = Number(el.dataset.pin) || 1;
        const scope = el.closest<HTMLElement>('[data-pin-scope]');
        const s = scope?.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        // An open form's Save (priority 2) always takes the spot, disabled or not and
        // wherever the form is, so Save is always at the top while a form is open.
        if (prio < 2) {
          // A disabled ordinary button isn't worth the space.
          if (el.disabled) continue;
          // The section must still fill some of the screen below the header.
          if (s && (s.bottom < top + 48 || s.top > bottom - 48)) continue;
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

  return (
    <>
      <div aria-hidden="true" style={{ height: space }} />
      {pin && (
    <div ref={bar} className="pinned-action" style={{ top: pin.top }}>
      <div className="mx-auto flex w-full max-w-screen-2xl justify-end px-4">
        <button type="button" className={`${pin.className} w-full sm:w-auto`} disabled={pin.disabled} onClick={click}>
          {pin.label}
        </button>
      </div>
    </div>
      )}
    </>
  );
}

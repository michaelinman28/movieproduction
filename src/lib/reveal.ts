/**
 * After adding something, its form opens; bring it into view. On a phone (one column)
 * the form sits below the table, so scroll down to its top; on wider screens it's beside
 * the table, so scroll only as far as needed. Panels mark themselves with data-form-for="<id>".
 */
export function scrollToForm(id: string) {
  setTimeout(() => {
    const el = document.querySelector(`[data-form-for="${CSS.escape(id)}"]`);
    if (!el) return;
    const wide = window.matchMedia('(min-width: 1024px)').matches;
    el.scrollIntoView({ behavior: 'smooth', block: wide ? 'nearest' : 'start' });
  }, 150);
}

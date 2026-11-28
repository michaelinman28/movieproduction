/** The address of a help page, e.g. helpUrl('getting-started/your-call-sheet-link'). */
export const helpUrl = (page = '') => `${import.meta.env.BASE_URL}help${page ? `/${page}` : ''}`;

/**
 * The header's Help link: a ? icon, with the word Help from small tablets up. It opens
 * Help in a new tab, so a form being filled in here is never lost.
 */
export function HelpLink({ page = '' }: { page?: string }) {
  return (
    <a
      href={helpUrl(page)} target="_blank" rel="noopener"
      title="Help (opens in a new tab)" aria-label="Help (opens in a new tab)"
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-1 text-sm text-muted no-underline hover:bg-accent-soft hover:text-fg sm:px-2"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.4-2.6 4" />
        <path d="M12 17.2h.01" />
      </svg>
      <span className="hidden sm:inline">Help</span>
    </a>
  );
}

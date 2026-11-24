import { useId, useState, type ReactNode } from 'react';

// '1' closed, '0' opened by hand; nothing stored means the section's default.
const read = (key: string, byDefault: boolean) => {
  try { const v = localStorage.getItem(key); return v === '1' ? true : v === '0' ? false : byDefault; } catch { return byDefault; }
};
const write = (key: string, collapsed: boolean, byDefault: boolean) => {
  try {
    if (collapsed === byDefault) localStorage.removeItem(key);
    else localStorage.setItem(key, collapsed ? '1' : '0');
  } catch { /* storage unavailable */ }
};

/**
 * A page section whose heading opens and closes it. Whether it's closed is
 * remembered on this device, per `id` (e.g. "project.tasks").
 */
export function Section({ id, title, summary, children, level = 'h2', bodyClassName = '', defaultCollapsed = false }: {
  id: string; title: string; summary?: ReactNode; children: ReactNode;
  /** Start closed until the person opens it (e.g. long lists in a form). */
  defaultCollapsed?: boolean;
  /** h2 for page sections, h4 for smaller sections such as those in a side panel. */
  level?: 'h2' | 'h4';
  bodyClassName?: string;
}) {
  const Heading = level;
  const key = `mp-collapsed:${id}`;
  const [collapsed, setCollapsed] = useState(() => read(key, defaultCollapsed));
  const bodyId = useId();
  const toggle = () => { setCollapsed(!collapsed); write(key, !collapsed, defaultCollapsed); };

  return (
    <section className="flex flex-col" data-pin-scope>
      <Heading className="m-0">
        <button type="button" className={`section-toggle ${level === 'h4' ? 'section-toggle-sm' : ''}`} aria-expanded={!collapsed} aria-controls={bodyId} onClick={toggle}>
          <span className={`section-chevron ${collapsed ? '' : 'section-chevron-open'}`} aria-hidden="true">▸</span>
          <span>{title}</span>
          {summary != null && <span className="section-summary">{summary}</span>}
        </button>
      </Heading>
      {!collapsed && <div id={bodyId} className={`mt-2 ${bodyClassName}`}>{children}</div>}
    </section>
  );
}

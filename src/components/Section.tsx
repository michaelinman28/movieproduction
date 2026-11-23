import { useId, useState, type ReactNode } from 'react';

const read = (key: string) => {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
};
const write = (key: string, collapsed: boolean) => {
  try { if (collapsed) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch { /* storage unavailable */ }
};

/**
 * A page section whose heading opens and closes it. Whether it's closed is
 * remembered on this device, per `id` (e.g. "project.tasks").
 */
export function Section({ id, title, summary, children, level = 'h2', bodyClassName = '' }: {
  id: string; title: string; summary?: ReactNode; children: ReactNode;
  /** h2 for page sections, h4 for smaller sections such as those in a side panel. */
  level?: 'h2' | 'h4';
  bodyClassName?: string;
}) {
  const Heading = level;
  const key = `mp-collapsed:${id}`;
  const [collapsed, setCollapsed] = useState(() => read(key));
  const bodyId = useId();
  const toggle = () => { setCollapsed(!collapsed); write(key, !collapsed); };

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

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
export function Section({ id, title, summary, children }: {
  id: string; title: string; summary?: ReactNode; children: ReactNode;
}) {
  const key = `mp-collapsed:${id}`;
  const [collapsed, setCollapsed] = useState(() => read(key));
  const bodyId = useId();
  const toggle = () => { setCollapsed(!collapsed); write(key, !collapsed); };

  return (
    <section className="flex flex-col">
      <h2 className="m-0">
        <button type="button" className="section-toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={toggle}>
          <span className={`section-chevron ${collapsed ? '' : 'section-chevron-open'}`} aria-hidden="true">▸</span>
          <span>{title}</span>
          {summary != null && <span className="section-summary">{summary}</span>}
        </button>
      </h2>
      {!collapsed && <div id={bodyId} className="mt-2">{children}</div>}
    </section>
  );
}

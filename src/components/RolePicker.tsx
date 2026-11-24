import type { Role } from '../lib/database.types';
import { Section } from './Section';

interface Props {
  roles: Role[];
  selected: Set<string>;
  onToggle: (roleId: string, on: boolean) => void;
  disabled?: boolean;
  /** Where the groups remember being opened or closed, e.g. "company.person.roles". */
  id: string;
}

/**
 * Checkboxes for every role, in groups: one per department of the standard roles,
 * and the company's custom roles. Each group opens and closes; groups with a ticked
 * role start open, the rest start closed, and the heading says how many are ticked.
 * Groups are stepped in under the heading the picker sits in, and roles under their
 * group, with a guide line, so the levels read as nested.
 */
export function RolePicker({ roles, selected, onToggle, disabled, id }: Props) {
  const groups = new Map<string, Role[]>();
  for (const r of roles) {
    const key = r.company_id ? 'Custom roles' : r.department || 'Other';
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <div className="ml-1.5 flex flex-col gap-1 border-l border-line pl-3 sm:pl-4">
      {[...groups].map(([group, list]) => {
        const ticked = list.filter((r) => selected.has(r.id)).length;
        return (
          <Section key={group} id={`${id}.${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} title={group} level="h4"
            defaultCollapsed={ticked === 0} summary={ticked ? `${ticked} of ${list.length}` : String(list.length)} bodyClassName="ml-1.5 flex flex-col border-l border-line pl-3 sm:pl-4">
            {list.map((r) => (
              <label key={r.id} className="check">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  disabled={disabled}
                  onChange={(e) => onToggle(r.id, e.target.checked)}
                />
                {r.name}
              </label>
            ))}
          </Section>
        );
      })}
    </div>
  );
}

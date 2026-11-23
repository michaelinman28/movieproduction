import type { Role } from '../lib/database.types';

interface Props {
  roles: Role[];
  selected: Set<string>;
  onToggle: (roleId: string, on: boolean) => void;
  disabled?: boolean;
}

/** Checkboxes for every role, grouped by department. */
export function RolePicker({ roles, selected, onToggle, disabled }: Props) {
  const groups = new Map<string, Role[]>();
  for (const r of roles) {
    const key = r.company_id ? 'Custom' : r.department || 'Other';
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <div className="role-picker">
      {[...groups].map(([dept, list]) => (
        <fieldset key={dept}>
          <legend>{dept}</legend>
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
        </fieldset>
      ))}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RenameForm } from '../components/RenameForm';
import { confirmDiscard } from '../lib/unsaved';
import { scrollToForm, useOpenFromLink } from '../lib/reveal';
import { LatticeGrid } from '../components/LatticeGrid';
import { Section } from '../components/Section';
import { api, type Company, type TaskCategory, type TaskTag } from '../lib/api';
import { errorText } from '../lib/format';

interface LabelRow { id: string; name: string; tasks: number }

const plural = (n: number) => `${n} task${n === 1 ? '' : 's'}`;

/** Company task categories (admins set the list and its order) and task tags. */
export function TaskSettingsPage() {
  const { companyId = '' } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selTag, setSelTag] = useState<string | null>(null);
  const [revealCat, setRevealCat] = useState<{ id: string; n: number } | null>(null);
  const [revealTag, setRevealTag] = useState<{ id: string; n: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, cats, tg] = await Promise.all([api.company(companyId), api.taskCategories(companyId), api.taskTags(companyId)]);
      setCompany(c);
      setCategories(cats);
      setTags(tg);
    } catch (e) { setError(errorText(e)); }
    setLoaded(true);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    setNotice(null);
    try { await fn(); } catch (e) { setError(errorText(e)); await load(); return false; }
    if (ok) setNotice(ok);
    await load();
    return true;
  };

  const isAdmin = Boolean(company?.is_admin);
  const catRows = useMemo<LabelRow[]>(() => categories.map(({ id, name, tasks }) => ({ id, name, tasks })), [categories]);
  const tagRows = useMemo<LabelRow[]>(() => tags.map(({ id, name, tasks }) => ({ id, name, tasks })), [tags]);

  const catOptions = useMemo(() => ({
    rowId: (r: LabelRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true, readOnly: !isAdmin,
    // Drag the handle (or Alt + arrow keys) to change the order people see in the picker.
    rowReorder: isAdmin,
    emptyMessage: 'No categories yet',
    columns: [
      { field: 'name', header: 'Category', width: 240, editable: true, sortable: false },
      { field: 'tasks', header: 'Tasks', type: 'number', width: 90, sortable: false },
    ],
  }), [isAdmin]);

  const tagOptions = useMemo(() => ({
    rowId: (r: LabelRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true, readOnly: !isAdmin,
    emptyMessage: 'No tags yet. People add them while tagging tasks.',
    columns: [
      { field: 'name', header: 'Tag', width: 240, editable: true },
      { field: 'tasks', header: 'Tasks', type: 'number', width: 90 },
    ],
  }), [isAdmin]);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name || !confirmDiscard()) return;
    let id = '';
    if (await run(async () => { id = (await api.createTaskCategory(companyId, name)).id; }, `Added the ${name} category.`)) {
      setNewCategory('');
      setSelCat(id); setRevealCat({ id, n: Date.now() }); scrollToForm(id);
    }
  }

  async function addTag(e: FormEvent) {
    e.preventDefault();
    const name = newTag.trim();
    if (!name || !confirmDiscard()) return;
    let id = '';
    if (await run(async () => { id = (await api.createTaskTag(companyId, name)).id; }, `Added the ${name} tag.`)) {
      setNewTag('');
      setSelTag(id); setRevealTag({ id, n: Date.now() }); scrollToForm(id);
    }
  }

  async function reorder(e: { ids: string[]; toIndex: number }) {
    // Work out the new order and save the sort positions that changed.
    const ids = categories.map((c) => c.id).filter((id) => !e.ids.includes(id));
    ids.splice(e.toIndex, 0, ...e.ids);
    const changes = ids.map((id, i) => ({ id, sort_order: i + 1 }))
      .filter(({ id, sort_order }) => categories.find((c) => c.id === id)?.sort_order !== sort_order);
    await run(() => Promise.all(changes.map((c) => api.updateTaskCategory(c.id, { sort_order: c.sort_order }))));
  }

  // A link from elsewhere (?open=<id>, e.g. a task's category) opens that category or tag.
  useOpenFromLink((id) => categories.some((c) => c.id === id) || tags.some((t) => t.id === id), (id) => {
    if (categories.some((c) => c.id === id)) { setSelCat(id); setRevealCat({ id, n: Date.now() }); }
    else { setSelTag(id); setRevealTag({ id, n: Date.now() }); }
    scrollToForm(id);
  });

  const selectedCat = categories.find((c) => c.id === selCat) ?? null;
  const selectedTag = tags.find((t) => t.id === selTag) ?? null;

  async function deleteCategory(c: TaskCategory) {
    const msg = c.tasks ? `Delete ${c.name}? ${plural(c.tasks)} will have no category.` : `Delete ${c.name}?`;
    if (window.confirm(msg) && await run(() => api.deleteTaskCategory(c.id), `Deleted the ${c.name} category.`)) setSelCat(null);
  }
  async function deleteTag(t: TaskTag) {
    const msg = t.tasks ? `Delete the ${t.name} tag? It comes off ${plural(t.tasks)}.` : `Delete the ${t.name} tag?`;
    if (window.confirm(msg) && await run(() => api.deleteTaskTag(t.id), `Deleted the ${t.name} tag.`)) setSelTag(null);
  }

  if (!loaded) return <p className="text-muted">Loading…</p>;
  if (!company) return <p>{error ?? "That company doesn't exist or you don't have access."} <Link to="/">Back to companies</Link></p>;

  return (
    <section className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        <Link to="/">Companies</Link> / <Link to={`/companies/${companyId}`}>{company.name}</Link> / Task categories and tags
      </p>
      <header>
        <h1>Task categories and tags</h1>
        <p className="mt-1 text-muted">
          These are shared by every project in {company.name}. Each task can have one category from the list, and any number of tags.
        </p>
      </header>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section id="settings.categories" title="Categories" summary={categories.length} bodyClassName="flex flex-col gap-2">
          <p className="hint">
            {isAdmin
              ? 'Double-click a name to rename it, or select it to edit it below. Drag the handle on the left to change the order people see.'
              : 'Only admins can change the categories.'}
          </p>
          {isAdmin && (
            <form className="form-row" onSubmit={addCategory}>
              <input className="field" placeholder="New category, e.g. Stunts" value={newCategory} maxLength={60}
                onChange={(e) => setNewCategory(e.target.value)} required />
              <button type="submit" className="btn" data-pin>Add category</button>
            </form>
          )}
          <LatticeGrid stateId="taskSettings.categories" options={catOptions} rows={catRows} height={Math.min(80 + catRows.length * 34, 480)} reveal={revealCat}
            on={{
              cellValueChanged: (e: { data: LabelRow; newValue: unknown }) =>
                run(() => api.updateTaskCategory(e.data.id, { name: String(e.newValue ?? '').trim() })),
              rowsReordered: reorder,
              selectionChanged: (rows: LabelRow[]) => setSelCat(rows[0]?.id ?? null),
            }} />
          {isAdmin && selectedCat && (
            <div className="card gap-2" data-form-for={selectedCat.id} data-form-label={selectedCat.name}>
              <span className="hint">{selectedCat.name}: used by {plural(selectedCat.tasks)}.</span>
              <RenameForm key={selectedCat.id} label="Category name" value={selectedCat.name} maxLength={60}
                onSave={(name) => run(() => api.updateTaskCategory(selectedCat.id, { name }), `Renamed to ${name}.`)} />
              <button className="btn btn-danger sm:self-start" onClick={() => deleteCategory(selectedCat)}>Delete category</button>
            </div>
          )}
        </Section>

        <Section id="settings.tags" title="Tags" summary={tags.length} bodyClassName="flex flex-col gap-2">
          <p className="hint">
            Anyone in the company can add tags while editing a task.
            {isAdmin ? ' Double-click a tag to rename it, or select it to rename or delete it below.' : ''}
          </p>
          <form className="form-row" onSubmit={addTag}>
            <input className="field" placeholder="New tag, e.g. night shoot" value={newTag} maxLength={40}
              onChange={(e) => setNewTag(e.target.value)} required />
            <button type="submit" className="btn btn-secondary" data-pin>Add tag</button>
          </form>
          <LatticeGrid stateId="taskSettings.tags" options={tagOptions} rows={tagRows} height={Math.min(80 + tagRows.length * 34, 480)} reveal={revealTag}
            on={{
              cellValueChanged: (e: { data: LabelRow; newValue: unknown }) =>
                run(() => api.updateTaskTag(e.data.id, String(e.newValue ?? '').trim())),
              selectionChanged: (rows: LabelRow[]) => setSelTag(rows[0]?.id ?? null),
            }} />
          {isAdmin && selectedTag && (
            <div className="card gap-2" data-form-for={selectedTag.id} data-form-label={selectedTag.name}>
              <span className="hint">{selectedTag.name}: used by {plural(selectedTag.tasks)}.</span>
              <RenameForm key={selectedTag.id} label="Tag name" value={selectedTag.name} maxLength={40}
                onSave={(name) => run(() => api.updateTaskTag(selectedTag.id, name), `Renamed to ${name}.`)} />
              <button className="btn btn-danger sm:self-start" onClick={() => deleteTag(selectedTag)}>Delete tag</button>
            </div>
          )}
        </Section>
      </div>
    </section>
  );
}

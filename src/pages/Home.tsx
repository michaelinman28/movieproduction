import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LatticeGrid, gridLink } from '../components/LatticeGrid';
import { api } from '../lib/api';
import { errorText } from '../lib/format';

interface CompanyRow { id: string; name: string; description: string; role: string; created_at: string }

const isAdminRow = (r: CompanyRow) => r.role === 'Admin';

export function Home() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.companies();
      setCompanies(list.map((x) => ({
        id: x.id, name: x.name, description: x.description ?? '',
        role: x.is_admin ? 'Admin' : 'Member', created_at: x.created_at.slice(0, 10),
      })));
    } catch (e) { setError(errorText(e)); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createCompany(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = await api.createCompany({ name: name.trim() });
      navigate(`/companies/${c.id}`);
    } catch (err) { setError(errorText(err)); setBusy(false); }
  }

  const options = useMemo(() => ({
    rowId: (r: CompanyRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    emptyMessage: 'You are not in any companies yet',
    // Admins edit the name and description in place, so the link has a column of its own.
    columns: [
      { field: 'open', header: '', width: 80, sortable: false, filter: false, render: ({ data }: { data: CompanyRow }) => gridLink('Open', `/companies/${data.id}`) },
      { field: 'name', header: 'Company', width: 240, editable: isAdminRow },
      { field: 'role', header: 'You are', width: 110 },
      { field: 'description', header: 'Description', width: 360, editable: isAdminRow, editor: 'textarea' },
      { field: 'created_at', header: 'Created', type: 'date', width: 130 },
    ],
  }), []);

  async function saveCell(e: { data: CompanyRow; column: string; newValue: unknown }) {
    const v = String(e.newValue ?? '').trim();
    setError(null);
    try {
      if (e.column === 'name' && v) await api.updateCompany(e.data.id, { name: v });
      else if (e.column === 'description') await api.updateCompany(e.data.id, { description: v || null });
    } catch (err) { setError(errorText(err)); }
    await load();
  }

  return (
    <section className="flex flex-col gap-5">
      <h1>Your production companies</h1>
      <form className="form-row" onSubmit={createCompany}>
        <input className="field" placeholder="New company name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit" className="btn shrink-0" disabled={busy}>Create company</button>
      </form>
      {error && <p className="error">{error}</p>}
      {companies.some(isAdminRow) && <p className="hint">Double-click the name or description of a company you're an admin of to change it.</p>}
      <LatticeGrid options={options} rows={companies} height={Math.min(80 + companies.length * 34, 400)}
        on={{ cellValueChanged: saveCell }} />
      <p className="hint">
        Waiting to be added to a company? Ask its admin to add you with the email you signed up with.
        You can add your phone number on <Link to="/profile">your profile</Link>.
      </p>
    </section>
  );
}

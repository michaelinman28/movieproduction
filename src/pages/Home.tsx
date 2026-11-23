import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LatticeGrid, gridLink } from '../components/LatticeGrid';
import { api } from '../lib/api';
import { errorText } from '../lib/format';

interface CompanyRow { id: string; name: string; description: string; role: string; created_at: string }

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
    toolbar: false, groupPanel: false, statusBar: false, readOnly: true,
    emptyMessage: 'You are not in any companies yet',
    columns: [
      { field: 'name', header: 'Company', width: 260, render: ({ data }: { data: CompanyRow }) => gridLink(data.name, `/companies/${data.id}`) },
      { field: 'role', header: 'You are', width: 110 },
      { field: 'description', header: 'Description', width: 360 },
      { field: 'created_at', header: 'Created', type: 'date', width: 130 },
    ],
  }), []);

  return (
    <section className="stack">
      <h1>Your production companies</h1>
      <form className="inline" onSubmit={createCompany}>
        <input placeholder="New company name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit" disabled={busy}>Create company</button>
      </form>
      {error && <p className="error">{error}</p>}
      <LatticeGrid options={options} rows={companies} height={Math.min(80 + companies.length * 34, 400)} />
      <p className="muted small">
        Waiting to be added to a company? Ask its admin to add you with the email you signed up with.
        You can add your phone number on <Link to="/profile">your profile</Link>.
      </p>
    </section>
  );
}

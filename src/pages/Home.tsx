import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LatticeGrid, gridLink } from '../components/LatticeGrid';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import type { Company } from '../lib/database.types';

interface CompanyRow { id: string; name: string; description: string; role: string; created_at: string }

export function Home() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, m] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('company_members').select('company_id, is_admin').eq('user_id', session?.user.id ?? ''),
    ]);
    if (c.error || m.error) return setError((c.error || m.error)!.message);
    const admin = new Map((m.data ?? []).map((x) => [x.company_id, x.is_admin]));
    setCompanies(((c.data ?? []) as Company[]).map((x) => ({
      id: x.id, name: x.name, description: x.description ?? '',
      role: admin.get(x.id) ? 'Admin' : 'Member', created_at: x.created_at.slice(0, 10),
    })));
  }, [session]);

  useEffect(() => { load(); }, [load]);

  async function createCompany(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.from('companies').insert({ name: name.trim() }).select('id').single();
    setBusy(false);
    if (error) return setError(error.message);
    navigate(`/companies/${data.id}`);
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
        You can add your phone number on <Link to="/profile" >your profile</Link>.
      </p>
    </section>
  );
}

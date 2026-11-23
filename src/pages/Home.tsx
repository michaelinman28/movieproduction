import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { LatticeGrid } from '../components/LatticeGrid';
import { supabase } from '../lib/supabase';
import type { Company } from '../lib/database.types';

interface CompanyRow { id: string; name: string; description: string; created_at: string }

export function Home() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('companies').select('*').order('name');
    if (error) return setError(error.message);
    setCompanies(
      ((data ?? []) as Company[]).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? '',
        created_at: c.created_at.slice(0, 10),
      })),
    );
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createCompany(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('companies').insert({ name: name.trim() });
    setBusy(false);
    if (error) return setError(error.message);
    setName('');
    load();
  }

  const options = useMemo(
    () => ({
      rowId: (r: CompanyRow) => r.id,
      toolbar: false,
      groupPanel: false,
      columns: [
        { field: 'name', header: 'Company', width: 260 },
        { field: 'description', header: 'Description', width: 360 },
        { field: 'created_at', header: 'Created', type: 'date', width: 140 },
      ],
    }),
    [],
  );

  return (
    <section>
      <h2>Your production companies</h2>
      <form className="inline" onSubmit={createCompany}>
        <input placeholder="New company name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit" disabled={busy}>Create company</button>
      </form>
      {error && <p className="error">{error}</p>}
      <LatticeGrid options={options} rows={companies} height={360} />
    </section>
  );
}

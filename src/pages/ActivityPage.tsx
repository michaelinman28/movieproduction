import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ActivityLog } from '../components/ActivityLog';
import { api, type Company, type Project } from '../lib/api';
import { errorText } from '../lib/format';

/** The company's activity log (audit trail), for its admins. */
export function ActivityPage() {
  const { companyId = '' } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api.company(companyId), api.projects(companyId)])
      .then(([c, p]) => { setCompany(c); setProjects(p); }, (e) => setError(errorText(e)))
      .finally(() => setLoaded(true));
  }, [companyId]);

  if (!loaded) return <p className="text-muted">Loading…</p>;
  if (!company) return <p>{error ?? "That company doesn't exist or you aren't in it."} <Link to="/">Back to companies</Link></p>;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">
          <Link to="/">Companies</Link> / <Link to={`/companies/${companyId}`}>{company.name}</Link> / Activity
        </p>
        <h1>Activity</h1>
      </div>
      {company.is_admin
        ? <ActivityLog companyId={companyId} projects={projects} />
        : <p>Only company admins can see the activity log.</p>}
    </section>
  );
}

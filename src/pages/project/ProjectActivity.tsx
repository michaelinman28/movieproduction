import { ActivityLog } from '../../components/ActivityLog';
import { useProject } from './ProjectLayout';

/** The project's activity log (audit trail), for company admins. */
export function ProjectActivity() {
  const { project, projectId, isAdmin } = useProject();
  if (!isAdmin) return <p>Only company admins can see the activity log.</p>;
  return <ActivityLog companyId={project.company_id} projectId={projectId} />;
}

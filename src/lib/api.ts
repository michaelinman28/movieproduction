// Client for the Movie Production API (supabase/functions/api). The app reads and
// writes all data through the API; Supabase is used here only to keep the user
// signed in and supply their access token.
import { supabase } from './supabase';
import type { ProjectStatus, Role } from './database.types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8787';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(`Can't reach the API at ${BASE}. Is it running?`, 0);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`, res.status);
  return json as T;
}

export interface Profile { id: string; full_name: string | null; email: string | null; phone: string | null }
export interface Company { id: string; name: string; description: string | null; created_by: string; created_at: string; is_admin: boolean }
export interface CompanyMember { user_id: string; is_admin: boolean; title: string | null; joined_at: string; profile: Profile; role_ids: string[] }
export interface Project {
  id: string; company_id: string; name: string; logline: string | null; description: string | null;
  status: ProjectStatus; start_date: string | null; end_date: string | null; created_by: string; created_at: string;
}
export interface ProjectDetail extends Project { company: { id: string; name: string }; can_manage: boolean }
export interface ProjectMember { user_id: string; joined_at: string; profile: Profile; role_ids: string[] }
export type ProjectInput = Partial<Pick<Project, 'name' | 'logline' | 'description' | 'status' | 'start_date' | 'end_date'>>;

const enc = encodeURIComponent;

export const api = {
  me: () => call<Profile>('GET', '/me'),
  updateMe: (b: { full_name?: string; phone?: string | null }) => call<Profile>('PATCH', '/me', b),

  companies: () => call<Company[]>('GET', '/companies'),
  createCompany: (b: { name: string; description?: string | null }) => call<Company>('POST', '/companies', b),
  company: (id: string) => call<Company>('GET', `/companies/${enc(id)}`),
  updateCompany: (id: string, b: { name?: string; description?: string | null }) => call<Company>('PATCH', `/companies/${enc(id)}`, b),
  deleteCompany: (id: string) => call<void>('DELETE', `/companies/${enc(id)}`),
  roles: (companyId: string) => call<Role[]>('GET', `/companies/${enc(companyId)}/roles`),

  members: (companyId: string) => call<CompanyMember[]>('GET', `/companies/${enc(companyId)}/members`),
  addMember: (companyId: string, b: { email: string; is_admin?: boolean; title?: string | null }) =>
    call<{ result: 'added' | 'already_member' }>('POST', `/companies/${enc(companyId)}/members`, b),
  updateMember: (companyId: string, userId: string, b: { is_admin?: boolean; title?: string | null }) =>
    call<unknown>('PATCH', `/companies/${enc(companyId)}/members/${enc(userId)}`, b),
  removeMember: (companyId: string, userId: string) => call<void>('DELETE', `/companies/${enc(companyId)}/members/${enc(userId)}`),
  setMemberRoles: (companyId: string, userId: string, roleIds: string[]) =>
    call<unknown>('PUT', `/companies/${enc(companyId)}/members/${enc(userId)}/roles`, { role_ids: roleIds }),

  projects: (companyId: string) => call<Project[]>('GET', `/companies/${enc(companyId)}/projects`),
  createProject: (companyId: string, b: ProjectInput & { name: string }) => call<Project>('POST', `/companies/${enc(companyId)}/projects`, b),
  project: (id: string) => call<ProjectDetail>('GET', `/projects/${enc(id)}`),
  updateProject: (id: string, b: ProjectInput) => call<Project>('PATCH', `/projects/${enc(id)}`, b),
  deleteProject: (id: string) => call<void>('DELETE', `/projects/${enc(id)}`),

  team: (projectId: string) => call<ProjectMember[]>('GET', `/projects/${enc(projectId)}/members`),
  assign: (projectId: string, userId: string) => call<unknown>('POST', `/projects/${enc(projectId)}/members`, { user_id: userId }),
  unassign: (projectId: string, userId: string) => call<void>('DELETE', `/projects/${enc(projectId)}/members/${enc(userId)}`),
  setTeamRoles: (projectId: string, userId: string, roleIds: string[]) =>
    call<unknown>('PUT', `/projects/${enc(projectId)}/members/${enc(userId)}/roles`, { role_ids: roleIds }),
};

export const API_BASE = BASE;

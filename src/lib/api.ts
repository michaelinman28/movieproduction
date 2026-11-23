// Client for the Movie Production API (supabase/functions/api). The app reads and
// writes all data through the API; Supabase is used here only to keep the user
// signed in and supply their access token.
import { supabase } from './supabase';
import type { DayPart, ProjectStatus, Role, Task as TaskRow, TaskPriority, TaskStatus } from './database.types';

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
export interface RoleWithUsage extends Role { is_custom: boolean; people: number }
export type RoleInput = { name?: string; department?: string | null; description?: string | null };
export interface CompanyMember { user_id: string; is_admin: boolean; title: string | null; joined_at: string; profile: Profile; role_ids: string[] }
export interface Project {
  id: string; company_id: string; name: string; logline: string | null; description: string | null;
  status: ProjectStatus; start_date: string | null; end_date: string | null; created_by: string; created_at: string;
}
export interface ProjectDetail extends Project { company: { id: string; name: string }; can_manage: boolean }
export interface ProjectMember { user_id: string; joined_at: string; profile: Profile; role_ids: string[] }
export type ProjectInput = Partial<Pick<Project, 'name' | 'logline' | 'description' | 'status' | 'start_date' | 'end_date'>>;

export type { DayPart, TaskPriority, TaskStatus };
export interface Task extends TaskRow { tag_ids: string[] }
export interface TaskCategory { id: string; company_id: string; name: string; sort_order: number; tasks: number }
export interface TaskTag { id: string; company_id: string; name: string; tasks: number }
export type TaskInput = Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assignee_id' | 'due_date' | 'due_part' | 'due_time' | 'parent_id' | 'sort_order' | 'category_id' | 'tag_ids'>>;

export interface TaskNote { id: string; task_id: string; author_id: string; author: Profile; body: string; created_at: string; updated_at: string }

const enc = encodeURIComponent;

export const api = {
  me: () => call<Profile>('GET', '/me'),
  updateMe: (b: { full_name?: string; phone?: string | null }) => call<Profile>('PATCH', '/me', b),

  companies: () => call<Company[]>('GET', '/companies'),
  createCompany: (b: { name: string; description?: string | null }) => call<Company>('POST', '/companies', b),
  company: (id: string) => call<Company>('GET', `/companies/${enc(id)}`),
  updateCompany: (id: string, b: { name?: string; description?: string | null }) => call<Company>('PATCH', `/companies/${enc(id)}`, b),
  deleteCompany: (id: string) => call<void>('DELETE', `/companies/${enc(id)}`),
  roles: (companyId: string) => call<RoleWithUsage[]>('GET', `/companies/${enc(companyId)}/roles`),
  createRole: (companyId: string, b: RoleInput & { name: string }) => call<RoleWithUsage>('POST', `/companies/${enc(companyId)}/roles`, b),
  updateRole: (id: string, b: RoleInput) => call<Role>('PATCH', `/roles/${enc(id)}`, b),
  deleteRole: (id: string) => call<void>('DELETE', `/roles/${enc(id)}`),

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

  tasks: (projectId: string) => call<Task[]>('GET', `/projects/${enc(projectId)}/tasks`),
  createTask: (projectId: string, b: TaskInput & { title: string }) => call<Task>('POST', `/projects/${enc(projectId)}/tasks`, b),
  updateTask: (id: string, b: TaskInput) => call<Task>('PATCH', `/tasks/${enc(id)}`, b),
  deleteTask: (id: string) => call<void>('DELETE', `/tasks/${enc(id)}`),
  taskCategories: (companyId: string) => call<TaskCategory[]>('GET', `/companies/${enc(companyId)}/task-categories`),
  createTaskCategory: (companyId: string, name: string) => call<TaskCategory>('POST', `/companies/${enc(companyId)}/task-categories`, { name }),
  updateTaskCategory: (id: string, b: { name?: string; sort_order?: number }) => call<TaskCategory>('PATCH', `/task-categories/${enc(id)}`, b),
  deleteTaskCategory: (id: string) => call<void>('DELETE', `/task-categories/${enc(id)}`),
  taskTags: (companyId: string) => call<TaskTag[]>('GET', `/companies/${enc(companyId)}/task-tags`),
  createTaskTag: (companyId: string, name: string) => call<TaskTag>('POST', `/companies/${enc(companyId)}/task-tags`, { name }),
  updateTaskTag: (id: string, name: string) => call<TaskTag>('PATCH', `/task-tags/${enc(id)}`, { name }),
  deleteTaskTag: (id: string) => call<void>('DELETE', `/task-tags/${enc(id)}`),
  taskNotes: (taskId: string) => call<TaskNote[]>('GET', `/tasks/${enc(taskId)}/notes`),
  addTaskNote: (taskId: string, body: string) => call<TaskNote>('POST', `/tasks/${enc(taskId)}/notes`, { body }),
  updateTaskNote: (id: string, body: string) => call<TaskNote>('PATCH', `/task-notes/${enc(id)}`, { body }),
  deleteTaskNote: (id: string) => call<void>('DELETE', `/task-notes/${enc(id)}`),
};

export const API_BASE = BASE;

// Client for the Movie Production API (supabase/functions/api). The app reads and
// writes all data through the API; Supabase is used here only to keep the user
// signed in and supply their access token.
import { supabase } from './supabase';
import type { SceneIntExt, SceneStatus, SceneTime } from './format';
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

export interface Profile { id: string; full_name: string | null; nickname: string | null; email: string | null; phone: string | null; has_account: boolean }
/** The outcome of adding someone: 'invited' means they have no account yet and join when they sign up with that email. */
export interface AddPersonResult { user_id: string; result: 'added' | 'already_member' | 'invited' }
/** An extra email address or phone number for someone, e.g. a work email. */
export interface PersonContact { id: string; user_id: string; kind: 'email' | 'phone'; value: string; label: string | null; created_by: string | null; created_at: string }
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
export type TaskInput = Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assignee_id' | 'start_date' | 'start_part' | 'start_time' | 'due_date' | 'due_part' | 'due_time' | 'parent_id' | 'sort_order' | 'category_id' | 'tag_ids' | 'location_id'>>;

export interface Location {
  id: string; project_id: string; name: string; description: string | null; address: string | null;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  status: LocationStatus; parking: string | null; nearest_hospital: string | null;
  created_by: string | null; created_at: string; updated_at: string; tasks: number;
}
export type LocationInput = Partial<Pick<Location, 'name' | 'description' | 'address' | 'contact_name' | 'contact_email' | 'contact_phone' | 'status' | 'parking' | 'nearest_hospital'>>;
/** considering (being scouted), confirmed (booked), or not_using (ruled out). */
export type LocationStatus = 'considering' | 'confirmed' | 'not_using';

export type { SceneIntExt, SceneStatus, SceneTime } from './format';
export interface Scene {
  id: string; project_id: string; number: string; set_name: string | null; int_ext: SceneIntExt | null; time_of_day: SceneTime | null;
  /** Length in eighths of a page (11 = 1 3/8). */
  pages_eighths: number | null; synopsis: string | null; characters: string | null; needs: string | null;
  location_id: string | null; status: SceneStatus; sort_order: number;
  created_by: string | null; created_at: string; updated_at: string;
  shots: number; shots_done: number; est_minutes: number;
}
export type SceneInput = Partial<Pick<Scene, 'number' | 'set_name' | 'int_ext' | 'time_of_day' | 'pages_eighths' | 'synopsis' | 'characters' | 'needs' | 'location_id' | 'status'>>;
export interface Shot {
  id: string; scene_id: string; project_id: string; sort_order: number; description: string;
  size: string | null; angle: string | null; movement: string | null; lens: string | null; equipment: string | null;
  est_minutes: number | null; done: boolean; notes: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export type ShotInput = Partial<Pick<Shot, 'description' | 'size' | 'angle' | 'movement' | 'lens' | 'equipment' | 'est_minutes' | 'done' | 'notes'>>;

/** A day of filming. Times are 'HH:MM' or 'HH:MM:SS'. */
export interface ShootDay {
  id: string; project_id: string; shoot_date: string; title: string | null; location_id: string | null;
  crew_call: string | null; shooting_call: string | null; lunch: string | null; wrap: string | null;
  weather: string | null; sunrise: string | null; sunset: string | null; notes: string | null;
  /** How many times the call sheet has been sent; 0 = not yet. */
  version: number; sent_at: string | null; sent_by: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  day_number: number; total_days: number; scene_ids: string[]; pages_eighths: number; called: number; confirmed: number;
}
export type ShootDayInput = Partial<Pick<ShootDay, 'shoot_date' | 'title' | 'location_id' | 'crew_call' | 'shooting_call' | 'lunch' | 'wrap' | 'weather' | 'sunrise' | 'sunset' | 'notes'>>;
export type ShootItemKind = 'scene' | 'meal' | 'move' | 'note';
export interface ShootDayItem { id: string; shoot_day_id: string; project_id: string; sort_order: number; kind: ShootItemKind; scene_id: string | null; label: string | null; at_time: string | null; created_at: string }
export interface ShootDayCall {
  shoot_day_id: string; user_id: string; project_id: string;
  /** Null means the day's crew call. */
  call_time: string | null; character_name: string | null; pickup_time: string | null; makeup_time: string | null; note: string | null;
  viewed_version: number; viewed_at: string | null; confirmed_version: number; confirmed_at: string | null; created_at: string;
  /** Their personal, view-only call sheet link: /sheet/{link_token} in the app. */
  link_token: string;
  profile: Profile; role_ids: string[];
}
export type ShootDayCallInput = Partial<Pick<ShootDayCall, 'call_time' | 'character_name' | 'pickup_time' | 'makeup_time' | 'note'>>;
export interface CallSheet {
  day: ShootDay; location: Location | null; items: ShootDayItem[]; scenes: Scene[]; calls: ShootDayCall[];
  next_day: { day: ShootDay; scenes: Scene[] } | null;
}
/** What a personal call sheet link shows: the sent sheet, view only, no emails. */
export interface LinkedCallSheet {
  me: string;
  /** Whether they have confirmed the version sent. */
  confirmed: boolean;
  project: { name: string; company_name: string };
  day: Pick<ShootDay, 'id' | 'shoot_date' | 'title' | 'crew_call' | 'shooting_call' | 'lunch' | 'wrap' | 'weather' | 'sunrise' | 'sunset' | 'notes' | 'version' | 'sent_at' | 'day_number' | 'total_days'>;
  location: Pick<Location, 'name' | 'description' | 'address' | 'parking' | 'nearest_hospital' | 'contact_name' | 'contact_phone'> | null;
  items: Pick<ShootDayItem, 'id' | 'kind' | 'scene_id' | 'label' | 'at_time'>[];
  scenes: Pick<Scene, 'id' | 'number' | 'set_name' | 'int_ext' | 'time_of_day' | 'pages_eighths' | 'synopsis' | 'characters' | 'needs'>[];
  calls: (Pick<ShootDayCall, 'user_id' | 'call_time' | 'character_name' | 'pickup_time' | 'makeup_time' | 'note' | 'role_ids'> & { profile: { id: string; full_name: string | null; nickname: string | null; phone: string | null } })[];
  roles: { id: string; name: string; department: string | null; sort_order: number | null }[];
  next_day: { day: Pick<ShootDay, 'shoot_date' | 'crew_call' | 'title' | 'day_number'>; scenes: Pick<Scene, 'id' | 'number' | 'set_name' | 'int_ext' | 'time_of_day' | 'pages_eighths'>[] } | null;
}

/** A note on a task or scene (many per item; the author edits it). */
export interface Note { id: string; author_id: string; author: Profile; body: string; created_at: string; updated_at: string }
export interface TaskNote extends Note { task_id: string }
export interface SceneNote extends Note { scene_id: string }
/** Where a note on the Project Notes page was taken. */
export type NoteSource = 'task' | 'scene' | 'shot' | 'shoot_day' | 'schedule' | 'call';
/** A note from anywhere on a project, with the item it belongs to. */
export interface ProjectNote {
  key: string; source: NoteSource; note_id: string | null; body: string; author: Profile | null; at: string; edited: boolean;
  item: { kind: 'task' | 'scene' | 'shoot_day'; id: string; label: string; detail: string | null };
}

const enc = encodeURIComponent;

export const api = {
  me: () => call<Profile>('GET', '/me'),
  updateMe: (b: { full_name?: string; nickname?: string | null; phone?: string | null }) => call<Profile>('PATCH', '/me', b),
  /** A company admin changes a member's name or phone (or you, your own). */
  updatePerson: (userId: string, b: { full_name?: string; nickname?: string | null; phone?: string | null; email?: string }) => call<Profile>('PATCH', `/people/${enc(userId)}`, b),
  contacts: (userId: string) => call<PersonContact[]>('GET', `/people/${enc(userId)}/contacts`),
  addContact: (userId: string, b: { kind: 'email' | 'phone'; value: string; label?: string | null }) =>
    call<PersonContact>('POST', `/people/${enc(userId)}/contacts`, b),
  updateContact: (id: string, b: { value?: string; label?: string | null }) => call<PersonContact>('PATCH', `/contacts/${enc(id)}`, b),
  deleteContact: (id: string) => call<void>('DELETE', `/contacts/${enc(id)}`),

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
  addMember: (companyId: string, b: { email: string; name?: string | null; phone?: string | null; is_admin?: boolean; title?: string | null }) =>
    call<AddPersonResult>('POST', `/companies/${enc(companyId)}/members`, b),
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
  addProjectPerson: (projectId: string, b: { email: string; name?: string | null; phone?: string | null }) =>
    call<AddPersonResult>('POST', `/projects/${enc(projectId)}/people`, b),
  unassign: (projectId: string, userId: string) => call<void>('DELETE', `/projects/${enc(projectId)}/members/${enc(userId)}`),
  setTeamRoles: (projectId: string, userId: string, roleIds: string[]) =>
    call<unknown>('PUT', `/projects/${enc(projectId)}/members/${enc(userId)}/roles`, { role_ids: roleIds }),

  locations: (projectId: string) => call<Location[]>('GET', `/projects/${enc(projectId)}/locations`),
  createLocation: (projectId: string, b: LocationInput & { name: string }) => call<Location>('POST', `/projects/${enc(projectId)}/locations`, b),
  updateLocation: (id: string, b: LocationInput) => call<Location>('PATCH', `/locations/${enc(id)}`, b),
  deleteLocation: (id: string) => call<void>('DELETE', `/locations/${enc(id)}`),

  scenes: (projectId: string) => call<Scene[]>('GET', `/projects/${enc(projectId)}/scenes`),
  createScene: (projectId: string, b: SceneInput & { number: string }) => call<Scene>('POST', `/projects/${enc(projectId)}/scenes`, b),
  updateScene: (id: string, b: SceneInput) => call<Scene>('PATCH', `/scenes/${enc(id)}`, b),
  deleteScene: (id: string) => call<void>('DELETE', `/scenes/${enc(id)}`),
  orderScenes: (projectId: string, ids: string[]) => call<void>('PUT', `/projects/${enc(projectId)}/scene-order`, { ids }),
  shots: (sceneId: string) => call<Shot[]>('GET', `/scenes/${enc(sceneId)}/shots`),
  createShot: (sceneId: string, b: ShotInput & { description: string }) => call<Shot>('POST', `/scenes/${enc(sceneId)}/shots`, b),
  updateShot: (id: string, b: ShotInput) => call<Shot>('PATCH', `/shots/${enc(id)}`, b),
  deleteShot: (id: string) => call<void>('DELETE', `/shots/${enc(id)}`),
  orderShots: (sceneId: string, ids: string[]) => call<void>('PUT', `/scenes/${enc(sceneId)}/shot-order`, { ids }),

  shootDays: (projectId: string) => call<ShootDay[]>('GET', `/projects/${enc(projectId)}/shoot-days`),
  createShootDay: (projectId: string, b: ShootDayInput & { shoot_date: string }) => call<ShootDay>('POST', `/projects/${enc(projectId)}/shoot-days`, b),
  updateShootDay: (id: string, b: ShootDayInput) => call<ShootDay>('PATCH', `/shoot-days/${enc(id)}`, b),
  deleteShootDay: (id: string) => call<void>('DELETE', `/shoot-days/${enc(id)}`),
  addShootDayItem: (dayId: string, b: { kind: ShootItemKind; scene_id?: string | null; label?: string | null; at_time?: string | null }) =>
    call<ShootDayItem>('POST', `/shoot-days/${enc(dayId)}/items`, b),
  updateShootDayItem: (id: string, b: { label?: string | null; at_time?: string | null }) => call<ShootDayItem>('PATCH', `/shoot-day-items/${enc(id)}`, b),
  deleteShootDayItem: (id: string) => call<void>('DELETE', `/shoot-day-items/${enc(id)}`),
  orderShootDayItems: (dayId: string, ids: string[]) => call<void>('PUT', `/shoot-days/${enc(dayId)}/item-order`, { ids }),
  shootDayCalls: (dayId: string) => call<ShootDayCall[]>('GET', `/shoot-days/${enc(dayId)}/calls`),
  setShootDayCall: (dayId: string, userId: string, b: ShootDayCallInput) => call<unknown>('PUT', `/shoot-days/${enc(dayId)}/calls/${enc(userId)}`, b),
  callEveryone: (dayId: string) => call<{ added: number }>('POST', `/shoot-days/${enc(dayId)}/calls/everyone`),
  removeShootDayCall: (dayId: string, userId: string) => call<void>('DELETE', `/shoot-days/${enc(dayId)}/calls/${enc(userId)}`),
  callSheet: (dayId: string) => call<CallSheet>('GET', `/shoot-days/${enc(dayId)}/call-sheet`),
  sendCallSheet: (dayId: string) => call<ShootDay>('POST', `/shoot-days/${enc(dayId)}/send`),
  viewedCallSheet: (dayId: string) => call<void>('POST', `/shoot-days/${enc(dayId)}/viewed`),
  linkedCallSheet: (token: string) => call<LinkedCallSheet>('GET', `/call-sheet-links/${enc(token)}`),
  confirmLinkedCallSheet: (token: string) => call<void>('POST', `/call-sheet-links/${enc(token)}/confirm`),
  confirmCallSheet: (dayId: string) => call<void>('POST', `/shoot-days/${enc(dayId)}/confirm`),
  /** The forecast, sunrise and sunset for a day; nothing is saved. Pass the form's date and location to look those up. */
  lookUpWeather: (dayId: string, ask: { shoot_date?: string; location_id?: string } = {}) =>
    call<{ weather: string; sunrise: string; sunset: string; place: string }>('POST', `/shoot-days/${enc(dayId)}/weather`, ask),

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
  sceneNotes: (sceneId: string) => call<SceneNote[]>('GET', `/scenes/${enc(sceneId)}/notes`),
  addSceneNote: (sceneId: string, body: string) => call<SceneNote>('POST', `/scenes/${enc(sceneId)}/notes`, { body }),
  updateSceneNote: (id: string, body: string) => call<SceneNote>('PATCH', `/scene-notes/${enc(id)}`, { body }),
  deleteSceneNote: (id: string) => call<void>('DELETE', `/scene-notes/${enc(id)}`),
  projectNotes: (projectId: string) => call<ProjectNote[]>('GET', `/projects/${enc(projectId)}/notes`),
};

export const API_BASE = BASE;

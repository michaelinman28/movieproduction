import { z } from '@hono/zod-openapi';

export const Uuid = z.uuid().openapi({ example: '3f1c2b8e-5a7d-4c1e-9b2a-6d8f0e4a1c3b' });
export const IdParam = z.object({ id: Uuid.openapi({ param: { name: 'id', in: 'path' } }) });
export const MemberParams = z.object({
  id: Uuid.openapi({ param: { name: 'id', in: 'path' } }),
  userId: Uuid.openapi({ param: { name: 'userId', in: 'path' } }),
});
const date = z.iso.date().openapi({ example: '2027-01-10' });
const nullableText = z.string().nullable();

export const Error = z.object({ error: z.string() }).openapi('Error');

export const Profile = z.object({
  id: Uuid,
  full_name: nullableText.openapi({ example: 'Ava Martinez' }),
  nickname: nullableText.openapi({ example: 'Avi' }),
  email: nullableText.openapi({ example: 'ava@example.com' }),
  phone: nullableText.openapi({ example: '404-555-0101' }),
  has_account: z.boolean().openapi({ description: 'False for someone added by an admin who hasn\'t signed up yet. They join when they sign up with this email.' }),
}).openapi('Profile');

export const ProfileUpdate = z.object({
  full_name: z.string().trim().min(1).optional(),
  nickname: z.string().trim().max(60).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
}).openapi('ProfileUpdate');

export const PersonUpdate = ProfileUpdate.extend({
  email: z.string().trim().max(254).optional().openapi({ description: 'Only for someone without an account yet (to correct the address they\'ll sign up with).' }),
}).openapi('PersonUpdate');

export const AddPersonResult = z.object({
  user_id: Uuid,
  result: z.enum(['added', 'already_member', 'invited']).openapi({ description: '"invited" means they have no account yet; they join when they sign up with this email.' }),
}).openapi('AddPersonResult');

export const ContactKind = z.enum(['email', 'phone']).openapi('ContactKind');

export const PersonContact = z.object({
  id: Uuid,
  user_id: Uuid,
  kind: ContactKind,
  value: z.string().openapi({ example: 'ava@studio.com' }),
  label: nullableText.openapi({ example: 'Work' }),
  created_by: Uuid.nullable(),
  created_at: z.string(),
}).openapi('PersonContact');

export const PersonContactInput = z.object({
  kind: ContactKind,
  value: z.string().trim().min(3).max(254),
  label: z.string().trim().max(40).nullable().optional(),
}).openapi('PersonContactInput');

export const PersonContactUpdate = z.object({
  value: z.string().trim().min(3).max(254).optional(),
  label: z.string().trim().max(40).nullable().optional(),
}).openapi('PersonContactUpdate');

export const Session = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number().int().optional().openapi({ description: 'Unix time when the access token expires' }),
  user: z.object({ id: Uuid, email: z.string().nullable() }),
}).openapi('Session');

export const SignUp = z.object({
  email: z.email().openapi({ example: 'ava@example.com' }),
  password: z.string().min(6),
  full_name: z.string().trim().min(1).openapi({ example: 'Ava Martinez' }),
  phone: z.string().trim().max(40).optional(),
  redirect_to: z.url().optional().openapi({ description: 'Where the confirmation email link should send them' }),
}).openapi('SignUp');

export const SignIn = z.object({
  email: z.email().openapi({ example: 'ava@example.com' }),
  password: z.string(),
}).openapi('SignIn');

export const Company = z.object({
  id: Uuid,
  name: z.string().openapi({ example: 'Moonlight Pictures' }),
  description: nullableText,
  created_by: Uuid,
  created_at: z.string(),
  is_admin: z.boolean().openapi({ description: 'Whether the caller is an admin of this company' }),
}).openapi('Company');

export const CompanyCreate = z.object({
  name: z.string().trim().min(1).openapi({ example: 'Moonlight Pictures' }),
  description: z.string().trim().nullable().optional(),
}).openapi('CompanyCreate');

export const CompanyUpdate = CompanyCreate.partial().openapi('CompanyUpdate');

export const Role = z.object({
  id: Uuid,
  company_id: Uuid.nullable().openapi({ description: 'null for standard roles shared by every company' }),
  name: z.string().openapi({ example: 'Director of Photography' }),
  department: nullableText.openapi({ example: 'Camera' }),
  description: nullableText,
  sort_order: z.number().int(),
}).openapi('Role');

export const RoleWithUsage = Role.extend({
  is_custom: z.boolean().openapi({ description: 'true for the company\'s own roles, which admins can edit' }),
  people: z.number().int().openapi({ description: 'How many people hold this role in the company or its projects' }),
}).openapi('RoleWithUsage');

export const RoleCreate = z.object({
  name: z.string().trim().min(1).max(80).openapi({ example: 'Intimacy Coordinator' }),
  department: z.string().trim().max(60).nullable().optional().openapi({ example: 'Cast' }),
  description: z.string().trim().max(500).nullable().optional(),
}).openapi('RoleCreate');

export const RoleUpdate = RoleCreate.partial().openapi('RoleUpdate');

export const CompanyMember = z.object({
  user_id: Uuid,
  is_admin: z.boolean(),
  title: nullableText.openapi({ example: 'Line Producer' }),
  joined_at: z.string(),
  profile: Profile,
  role_ids: z.array(Uuid),
}).openapi('CompanyMember');

export const CompanyMemberAdd = z.object({
  email: z.string().trim().max(254).openapi({ description: 'Their email. If nobody has an account with it yet, give their name too.', example: 'cody@example.com' }),
  name: z.string().trim().max(120).nullable().optional().openapi({ description: 'Needed for someone without an account yet' }),
  phone: z.string().trim().max(40).nullable().optional(),
  is_admin: z.boolean().optional(),
  title: z.string().trim().nullable().optional(),
}).openapi('CompanyMemberAdd');

export const CompanyMemberUpdate = z.object({
  is_admin: z.boolean().optional(),
  title: z.string().trim().nullable().optional(),
}).openapi('CompanyMemberUpdate');

export const RoleIds = z.object({ role_ids: z.array(Uuid) }).openapi('RoleIds');

export const ProjectStatus = z.enum([
  'development', 'pre_production', 'production', 'post_production', 'released', 'on_hold', 'cancelled',
]).openapi('ProjectStatus');

export const Project = z.object({
  id: Uuid,
  company_id: Uuid,
  name: z.string().openapi({ example: 'Night Shoot' }),
  logline: nullableText.openapi({ example: 'A crew races dawn to finish a film.' }),
  description: nullableText,
  status: ProjectStatus,
  start_date: date.nullable(),
  end_date: date.nullable(),
  created_by: Uuid,
  created_at: z.string(),
}).openapi('Project');

export const ProjectDetail = Project.extend({
  company: z.object({ id: Uuid, name: z.string() }),
  can_manage: z.boolean().openapi({ description: 'Whether the caller is an admin of the project\'s company' }),
}).openapi('ProjectDetail');

export const ProjectCreate = z.object({
  name: z.string().trim().min(1).openapi({ example: 'Night Shoot' }),
  logline: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  status: ProjectStatus.optional(),
  start_date: date.nullable().optional(),
  end_date: date.nullable().optional(),
}).openapi('ProjectCreate');

export const ProjectUpdate = ProjectCreate.partial().openapi('ProjectUpdate');

export const ProjectMember = z.object({
  user_id: Uuid,
  joined_at: z.string(),
  profile: Profile,
  role_ids: z.array(Uuid),
}).openapi('ProjectMember');

export const ProjectMemberAdd = z.object({ user_id: Uuid }).openapi('ProjectMemberAdd');

export const ProjectPersonAdd = z.object({
  email: z.string().trim().max(254).openapi({ example: 'cody@example.com' }),
  name: z.string().trim().max(120).nullable().optional().openapi({ description: 'Needed for someone without an account yet' }),
  phone: z.string().trim().max(40).nullable().optional(),
}).openapi('ProjectPersonAdd');

// ---- Tasks ------------------------------------------------------------------

export const TaskStatus = z.enum(['todo', 'in_progress', 'blocked', 'done']).openapi('TaskStatus');
export const TaskPriority = z.enum(['low', 'medium', 'high', 'urgent']).openapi('TaskPriority');
export const DayPart = z.enum(['morning', 'afternoon', 'evening']).openapi('DayPart');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use a 24-hour time like 14:30').openapi({ example: '14:30' });

export const Task = z.object({
  id: Uuid,
  project_id: Uuid,
  parent_id: Uuid.nullable().openapi({ description: 'The parent task when this is a sub-task' }),
  title: z.string().openapi({ example: 'Scout locations' }),
  description: nullableText,
  status: TaskStatus,
  priority: TaskPriority,
  assignee_id: Uuid.nullable().openapi({ description: 'Someone on the project' }),
  due_date: date.nullable(),
  due_part: DayPart.nullable().openapi({ description: 'Due in the morning, afternoon or evening of the due date' }),
  due_time: time.nullable().openapi({ description: 'Due at this time on the due date (local time, HH:MM:SS)', example: '14:30:00' }),
  sort_order: z.number().int(),
  category_id: Uuid.nullable().openapi({ description: 'One of the company\'s task categories' }),
  tag_ids: z.array(Uuid).openapi({ description: 'The company tags on this task' }),
  location_id: Uuid.nullable().openapi({ description: 'One of the project\'s locations' }),
  created_by: Uuid,
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('Task');

const taskFields = {
  title: z.string().trim().min(1).max(200).openapi({ example: 'Scout locations' }),
  description: z.string().trim().max(5000).nullable().optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  assignee_id: Uuid.nullable().optional(),
  due_date: date.nullable().optional(),
  due_part: DayPart.nullable().optional().openapi({ description: 'Morning, afternoon or evening. Needs a due date; send due_time null with it' }),
  due_time: time.nullable().optional().openapi({ description: 'Exact time (24-hour). Needs a due date; send due_part null with it' }),
  sort_order: z.number().int().optional(),
  category_id: Uuid.nullable().optional().openapi({ description: 'One of the company\'s task categories, or null' }),
  tag_ids: z.array(Uuid).optional().openapi({ description: 'Replaces the task\'s tags with exactly these company tags' }),
  location_id: Uuid.nullable().optional().openapi({ description: 'One of the project\'s locations, or null' }),
};

export const TaskCreate = z.object({
  ...taskFields,
  parent_id: Uuid.nullable().optional().openapi({ description: 'Set to make this a sub-task of another task in the project' }),
}).openapi('TaskCreate');

export const TaskUpdate = z.object({
  ...taskFields,
  title: taskFields.title.optional(),
  parent_id: Uuid.nullable().optional().openapi({ description: 'Move under another task, or null to make it a top-level task' }),
}).openapi('TaskUpdate');

export const TaskNote = z.object({
  id: Uuid,
  task_id: Uuid,
  author_id: Uuid,
  author: Profile,
  body: z.string().openapi({ example: 'Called the venue; load-in moved to 7 AM.' }),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('TaskNote');

export const TaskNoteInput = z.object({
  body: z.string().trim().min(1).max(5000).openapi({ example: 'Called the venue; load-in moved to 7 AM.' }),
}).openapi('TaskNoteInput');

// ---- Task categories and tags ----------------------------------------------

export const TaskCategory = z.object({
  id: Uuid,
  company_id: Uuid,
  name: z.string().openapi({ example: 'Locations' }),
  sort_order: z.number().int(),
  tasks: z.number().int().openapi({ description: 'How many tasks use it' }),
}).openapi('TaskCategory');

export const TaskCategoryInput = z.object({
  name: z.string().trim().min(1).max(60).openapi({ example: 'Stunts' }),
  sort_order: z.number().int().optional(),
}).openapi('TaskCategoryInput');

export const TaskCategoryUpdate = TaskCategoryInput.partial().openapi('TaskCategoryUpdate');

export const TaskTag = z.object({
  id: Uuid,
  company_id: Uuid,
  name: z.string().openapi({ example: 'night shoot' }),
  tasks: z.number().int().openapi({ description: 'How many tasks use it' }),
}).openapi('TaskTag');

export const TaskTagInput = z.object({
  name: z.string().trim().min(1).max(40).openapi({ example: 'night shoot' }),
}).openapi('TaskTagInput');

// ---- Project locations ------------------------------------------------------

export const LocationStatus = z.enum(['considering', 'confirmed', 'not_using']).openapi('LocationStatus', {
  description: 'considering (being scouted), confirmed (booked), or not_using (ruled out)',
});

export const Location = z.object({
  id: Uuid,
  project_id: Uuid,
  name: z.string().openapi({ example: 'Old Mill' }),
  description: nullableText,
  address: nullableText.openapi({ example: '1 Mill Road, Hudson, NY' }),
  contact_name: nullableText.openapi({ example: 'Sam Rivera' }),
  contact_email: nullableText.openapi({ example: 'sam@oldmill.com' }),
  contact_phone: nullableText.openapi({ example: '+1 555 0100' }),
  status: LocationStatus,
  created_by: Uuid.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  tasks: z.number().int().openapi({ description: 'How many tasks are at this location' }),
}).openapi('Location');

const optText = (max: number) => z.string().trim().max(max).nullable().optional();
export const LocationInput = z.object({
  name: z.string().trim().min(1).max(120).openapi({ example: 'Old Mill' }),
  description: optText(2000),
  address: optText(500),
  contact_name: optText(120),
  contact_email: z.union([z.literal(''), z.email().max(254)]).nullable().optional().openapi({ example: 'sam@oldmill.com' }),
  contact_phone: optText(40),
  status: LocationStatus.optional().openapi({ description: 'Defaults to considering' }),
}).openapi('LocationInput');

export const LocationUpdate = LocationInput.partial().openapi('LocationUpdate');

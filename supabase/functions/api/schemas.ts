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
  start_date: date.nullable().openapi({ description: 'When work on the task starts. A task from its start to its due date covers each of those days' }),
  start_part: DayPart.nullable().openapi({ description: 'Starts in the morning, afternoon or evening of the start date' }),
  start_time: time.nullable().openapi({ description: 'Starts at this time on the start date (local time, HH:MM:SS)', example: '09:00:00' }),
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
  start_date: date.nullable().optional().openapi({ description: 'Not after the due date. Clearing it clears its part of the day or time' }),
  start_part: DayPart.nullable().optional().openapi({ description: 'Morning, afternoon or evening. Needs a start date; send start_time null with it' }),
  start_time: time.nullable().optional().openapi({ description: 'Exact time (24-hour). Needs a start date; send start_part null with it' }),
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

export const SceneNote = z.object({
  id: Uuid,
  scene_id: Uuid,
  author_id: Uuid,
  author: Profile,
  body: z.string().openapi({ example: 'The diner sign needs repainting before we shoot.' }),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('SceneNote');

/** A note from anywhere on a project, for the Project Notes page. */
export const ProjectNote = z.object({
  key: z.string().openapi({ description: 'Unique across every kind of note, e.g. task_note:<id>', example: 'task_note:6f1c…' }),
  source: z.enum(['task', 'scene', 'shot', 'shoot_day', 'schedule', 'call']).openapi({
    description: 'Where the note was taken: a task\'s or scene\'s notes, a shot\'s Notes field, a shoot day\'s Notes, a note in a day\'s schedule, or the note on someone\'s call.',
  }),
  note_id: Uuid.nullable().openapi({ description: 'The task or scene note\'s id; null for notes kept in a field of another item.' }),
  body: z.string(),
  author: Profile.nullable().openapi({ description: 'Who wrote it. For a note kept in a field (shot, shoot day, schedule, call), who last set or changed it; null for ones written before that was recorded.' }),
  at: z.string().openapi({ description: 'When the note was written (for a note kept in a field, when it was last set or changed).' }),
  edited: z.boolean(),
  item: z.object({
    kind: z.enum(['task', 'scene', 'shoot_day']).openapi({ description: 'The page that holds the note' }),
    id: Uuid,
    label: z.string().openapi({ example: 'Scene 12A: INT. DINER' }),
    detail: z.string().nullable().openapi({ description: 'Where on the item, e.g. "Shot 3" or "Call for Ava"', example: 'Shot 3' }),
  }),
}).openapi('ProjectNote');

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
  parking: nullableText.openapi({ example: 'Lot behind the hardware store' }),
  nearest_hospital: nullableText.openapi({ example: "St. Mary's ER, 2.1 miles" }),
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
  parking: optText(500),
  nearest_hospital: optText(500),
}).openapi('LocationInput');

export const LocationUpdate = LocationInput.partial().openapi('LocationUpdate');

// ---- Scenes and shots -------------------------------------------------------

export const SceneIntExt = z.enum(['int', 'ext', 'int_ext']).openapi('SceneIntExt', { description: 'Interior, exterior, or both' });
export const SceneTime = z.enum(['day', 'night', 'dawn', 'dusk']).openapi('SceneTime');
export const SceneStatus = z.enum(['not_scheduled', 'scheduled', 'shot']).openapi('SceneStatus');

export const Scene = z.object({
  id: Uuid,
  project_id: Uuid,
  number: z.string().openapi({ example: '12A' }),
  set_name: nullableText.openapi({ example: 'INT. DINER' }),
  int_ext: SceneIntExt.nullable(),
  time_of_day: SceneTime.nullable(),
  pages_eighths: z.number().int().nullable().openapi({ description: 'Length in eighths of a page (11 = 1 3/8 pages)', example: 11 }),
  synopsis: nullableText.openapi({ example: 'Maya confronts Leo about the money' }),
  characters: nullableText.openapi({ example: 'Maya, Leo, Waitress' }),
  needs: nullableText.openapi({ example: 'Practical neon sign, rain on windows' }),
  location_id: Uuid.nullable().openapi({ description: 'One of the project\'s locations' }),
  status: SceneStatus,
  sort_order: z.number().int(),
  created_by: Uuid.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  shots: z.number().int().openapi({ description: 'How many shots the scene has' }),
  shots_done: z.number().int().openapi({ description: 'How many of them are done' }),
  est_minutes: z.number().int().openapi({ description: 'The shots\' estimated minutes added up' }),
}).openapi('Scene');

export const SceneInput = z.object({
  number: z.string().trim().min(1).max(20).openapi({ example: '12A' }),
  set_name: optText(200),
  int_ext: SceneIntExt.nullable().optional(),
  time_of_day: SceneTime.nullable().optional(),
  pages_eighths: z.number().int().min(0).max(8000).nullable().optional(),
  synopsis: optText(1000),
  characters: optText(1000),
  needs: optText(2000),
  location_id: Uuid.nullable().optional(),
  status: SceneStatus.optional().openapi({ description: 'Defaults to not_scheduled' }),
}).openapi('SceneInput');

export const SceneUpdate = SceneInput.partial().openapi('SceneUpdate');

export const Shot = z.object({
  id: Uuid,
  scene_id: Uuid,
  project_id: Uuid,
  sort_order: z.number().int(),
  description: z.string().openapi({ example: 'Wide of diner, Maya enters' }),
  size: nullableText.openapi({ example: 'Wide' }),
  angle: nullableText.openapi({ example: 'Eye level' }),
  movement: nullableText.openapi({ example: 'Dolly' }),
  lens: nullableText.openapi({ example: '24mm' }),
  equipment: nullableText.openapi({ example: 'Dolly and track' }),
  est_minutes: z.number().int().nullable().openapi({ example: 30 }),
  done: z.boolean(),
  notes: nullableText,
  created_by: Uuid.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('Shot');

export const ShotInput = z.object({
  description: z.string().trim().min(1).max(500).openapi({ example: 'Wide of diner, Maya enters' }),
  size: optText(40),
  angle: optText(40),
  movement: optText(40),
  lens: optText(40),
  equipment: optText(300),
  est_minutes: z.number().int().min(0).max(1440).nullable().optional(),
  done: z.boolean().optional(),
  notes: optText(2000),
}).openapi('ShotInput');

export const ShotUpdate = ShotInput.partial().openapi('ShotUpdate');

export const OrderInput = z.object({
  ids: z.array(Uuid).min(1).max(1000).openapi({ description: 'Every id, in the new order' }),
}).openapi('OrderInput');

// ---- Shoot days and call sheets ---------------------------------------------

const clock = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).openapi({ example: '16:00' });
const optTime = time.nullable().optional();

export const ShootDay = z.object({
  id: Uuid,
  project_id: Uuid,
  shoot_date: date,
  title: nullableText.openapi({ example: 'Diner nights' }),
  location_id: Uuid.nullable(),
  crew_call: clock.nullable(),
  shooting_call: clock.nullable(),
  lunch: clock.nullable(),
  wrap: clock.nullable(),
  weather: nullableText.openapi({ example: 'Rain likely, 48°F to 55°F' }),
  sunrise: clock.nullable(),
  sunset: clock.nullable(),
  notes: nullableText,
  version: z.number().int().openapi({ description: 'How many times the call sheet has been sent (0 = not yet)' }),
  sent_at: z.string().nullable(),
  sent_by: Uuid.nullable(),
  created_by: Uuid.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  day_number: z.number().int().openapi({ description: 'Its place among the project\'s shoot days, by date (Day 3 of 18)' }),
  total_days: z.number().int(),
  scene_ids: z.array(Uuid).openapi({ description: 'Scenes on the day, in order' }),
  pages_eighths: z.number().int().openapi({ description: 'The day\'s scenes\' pages added up, in eighths' }),
  called: z.number().int().openapi({ description: 'How many people are called' }),
  confirmed: z.number().int().openapi({ description: 'How many have confirmed the version sent' }),
}).openapi('ShootDay');

export const ShootDayInput = z.object({
  shoot_date: date,
  title: optText(120),
  location_id: Uuid.nullable().optional(),
  crew_call: optTime, shooting_call: optTime, lunch: optTime, wrap: optTime,
  weather: optText(200),
  sunrise: optTime, sunset: optTime,
  notes: optText(4000),
}).openapi('ShootDayInput');
export const ShootDayUpdate = ShootDayInput.partial().openapi('ShootDayUpdate');

export const ShootItemKind = z.enum(['scene', 'meal', 'move', 'note']).openapi('ShootItemKind', {
  description: 'scene, meal (a meal break), move (a company move to another location) or note',
});
export const ShootDayItem = z.object({
  id: Uuid,
  shoot_day_id: Uuid,
  project_id: Uuid,
  sort_order: z.number().int(),
  kind: ShootItemKind,
  scene_id: Uuid.nullable(),
  label: nullableText.openapi({ example: 'Hot meal, 1 hour' }),
  at_time: clock.nullable(),
  created_at: z.string(),
}).openapi('ShootDayItem');
export const ShootDayItemInput = z.object({
  kind: ShootItemKind,
  scene_id: Uuid.nullable().optional().openapi({ description: 'Required for a scene' }),
  label: optText(300),
  at_time: optTime,
}).openapi('ShootDayItemInput');
export const ShootDayItemUpdate = z.object({ label: optText(300), at_time: optTime }).openapi('ShootDayItemUpdate');

export const ShootDayCall = z.object({
  shoot_day_id: Uuid,
  user_id: Uuid,
  project_id: Uuid,
  call_time: clock.nullable().openapi({ description: 'Their own call; null means the day\'s crew call' }),
  character_name: nullableText.openapi({ description: 'For cast: the character they play', example: 'Maya' }),
  pickup_time: clock.nullable(),
  makeup_time: clock.nullable(),
  note: nullableText,
  viewed_version: z.number().int(),
  viewed_at: z.string().nullable(),
  confirmed_version: z.number().int(),
  confirmed_at: z.string().nullable(),
  link_token: Uuid.openapi({ description: 'Their personal call sheet link: /call-sheet-links/{token}, and the app page /sheet/{token}' }),
  created_at: z.string(),
  profile: Profile,
  role_ids: z.array(Uuid).openapi({ description: 'Their project roles' }),
}).openapi('ShootDayCall');
export const ShootDayCallInput = z.object({
  call_time: optTime,
  character_name: optText(120),
  pickup_time: optTime,
  makeup_time: optTime,
  note: optText(500),
}).openapi('ShootDayCallInput');

export const CallSheet = z.object({
  day: ShootDay,
  location: z.any().nullable().openapi({ description: 'The day\'s location (see Location)' }),
  items: z.array(ShootDayItem),
  scenes: z.array(z.any()).openapi({ description: 'The scenes on the day (see Scene)' }),
  calls: z.array(ShootDayCall),
  next_day: z.object({ day: ShootDay, scenes: z.array(z.any()) }).nullable().openapi({ description: 'A look ahead at the following shoot day' }),
}).openapi('CallSheet');

export const TokenParam = z.object({ token: Uuid.openapi({ param: { name: 'token', in: 'path' } }) });

export const LinkedCallSheet = z.object({
  me: Uuid.openapi({ description: 'The person the link belongs to' }),
  confirmed: z.boolean().openapi({ description: 'Whether they have confirmed the version sent' }),
  project: z.object({ name: z.string(), company_name: z.string() }),
  day: z.any().openapi({ description: 'The day: date, title, times, weather, notes, version, sent_at, day_number, total_days' }),
  location: z.any().nullable().openapi({ description: 'Name, description, address, parking, nearest hospital and on-site contact' }),
  items: z.array(z.any()).openapi({ description: 'The schedule in order: id, kind, scene_id, label, at_time' }),
  scenes: z.array(z.any()).openapi({ description: 'The scenes on the day, in order' }),
  calls: z.array(z.any()).openapi({ description: 'Everyone called: their call, character, pickup, makeup, note, name, nickname, phone and role ids (no emails)' }),
  roles: z.array(z.object({ id: Uuid, name: z.string(), department: z.string().nullable(), sort_order: z.number().int().nullable() })),
  next_day: z.any().nullable(),
}).openapi('LinkedCallSheet');

export const UserParams = z.object({
  id: Uuid.openapi({ param: { name: 'id', in: 'path' } }),
  userId: Uuid.openapi({ param: { name: 'userId', in: 'path' } }),
});
export const WeatherLookup = z.object({
  shoot_date: date.optional().openapi({ description: 'The date to look up; defaults to the day\'s saved date' }),
  location_id: Uuid.optional().openapi({ description: 'The location to look up; defaults to the day\'s saved location' }),
}).openapi('WeatherLookup');
export const WeatherResult = z.object({
  weather: z.string().openapi({ example: 'Light rain, 48°F to 55°F, 60% chance of rain' }),
  sunrise: clock, sunset: clock,
  place: z.string().openapi({ example: 'Hudson, New York' }),
}).openapi('WeatherResult');

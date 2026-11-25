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
  dietary: nullableText.openapi({ description: 'Dietary needs on this project, for catering and the call sheet', example: 'Vegetarian' }),
  dietary_allergy: z.boolean().openapi({ description: 'Whether the dietary needs are an allergy (shown in red)' }),
}).openapi('ProjectMember');

export const DietaryInput = z.object({
  needs: z.string().trim().max(500).nullable().openapi({ description: 'Blank clears it', example: 'Peanut allergy' }),
  allergy: z.boolean().optional().openapi({ description: 'Show it as an allergy' }),
}).openapi('DietaryInput');

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
  source: z.enum(['task', 'scene', 'shot', 'shoot_day', 'schedule', 'call', 'character', 'team']).openapi({
    description: 'Where the note was taken: a task\'s, scene\'s or character\'s notes, a shot\'s Notes field, a shoot day\'s Notes, a note in a day\'s schedule, or the note on someone\'s call.',
  }),
  note_id: Uuid.nullable().openapi({ description: 'The task, scene or character note\'s id; null for notes kept in a field of another item.' }),
  body: z.string(),
  author: Profile.nullable().openapi({ description: 'Who wrote it. For a note kept in a field (shot, shoot day, schedule, call), who last set or changed it; null for ones written before that was recorded.' }),
  at: z.string().openapi({ description: 'When the note was written (for a note kept in a field, when it was last set or changed).' }),
  edited: z.boolean(),
  item: z.object({
    kind: z.enum(['task', 'scene', 'shoot_day', 'character', 'team_member']).openapi({ description: 'The page that holds the note' }),
    id: Uuid,
    label: z.string().openapi({ example: 'Scene 12A: INT. DINER' }),
    detail: z.string().nullable().openapi({ description: 'Where on the item, e.g. "Shot 3" or "Call for Ava"', example: 'Shot 3' }),
  }),
}).openapi('ProjectNote');
export const ProjectNoteQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  sources: z.string().max(200).optional().openapi({ description: 'Comma-separated: task, scene, shot, shoot_day, schedule, call, character, team' }),
  author_ids: z.string().max(4000).optional().openapi({ description: 'Comma-separated ids of who wrote the note; "none" for notes with no known writer' }),
  q: z.string().max(200).optional().openapi({ description: 'Words to find in the note, what it was taken on, or who wrote it' }),
  order: z.enum(['newest', 'oldest']).default('newest'),
});
export const ProjectNotePage = z.object({
  notes: z.array(ProjectNote),
  total: z.number().int().openapi({ description: 'Notes matching the filters, on every page' }),
  facets: z.object({
    sources: z.array(z.object({ source: z.string(), count: z.number().int() })),
    authors: z.array(z.object({ id: z.string().openapi({ description: 'The writer\'s id, or "none"' }), author: Profile.nullable(), count: z.number().int() })),
  }),
}).openapi('ProjectNotePage');

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
  characters: nullableText.openapi({ example: 'Maya, Leo, Waitress', description: 'The names of the scene\'s characters, by cast number. Kept in step with character_ids.' }),
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
  character_ids: z.array(Uuid).openapi({ description: 'The characters in the scene (see Characters). `characters` holds their names.' }),
}).openapi('Scene');

export const SceneInput = z.object({
  number: z.string().trim().min(1).max(20).openapi({ example: '12A' }),
  set_name: optText(200),
  int_ext: SceneIntExt.nullable().optional(),
  time_of_day: SceneTime.nullable().optional(),
  pages_eighths: z.number().int().min(0).max(8000).nullable().optional(),
  synopsis: optText(1000),
  characters: optText(1000).openapi({ description: 'Character names, comma-separated. They become the scene\'s characters; names the project doesn\'t have yet are added as new characters.' }),
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
  share_token: Uuid.nullable().openapi({ description: 'The day\'s shared call sheet link, for anyone: /shared-call-sheets/{token}, and the app page /call-sheet/{token}. Null when off' }),
  share_phones: z.boolean().openapi({ description: 'Whether the shared link shows phone numbers' }),
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
  characters: z.array(z.object({ name: z.string(), cast_number: z.number().int().nullable() })).openapi({ description: 'The characters they play (from Characters)' }),
  dietary: z.object({ needs: z.string(), allergy: z.boolean() }).nullable().openapi({ description: 'Their dietary needs on the project, if any' }),
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
  calls: z.array(z.any()).openapi({ description: 'Everyone called: their call, character, the characters they play, pickup, makeup, note, name, nickname, phone and role ids (no emails). On a personal link, the reader\'s own call also has their dietary needs.' }),
  roles: z.array(z.object({ id: Uuid, name: z.string(), department: z.string().nullable(), sort_order: z.number().int().nullable() })),
  next_day: z.any().nullable(),
}).openapi('LinkedCallSheet');

export const SharedCallSheet = LinkedCallSheet.omit({ me: true, confirmed: true }).extend({
  phones: z.boolean().openapi({ description: 'Whether phone numbers are shown (the sharer chooses); emails never are' }),
}).openapi('SharedCallSheet');

export const ShareInput = z.object({
  enabled: z.boolean().openapi({ description: 'true turns the shared link on (keeping the current link), false turns it off' }),
  new_link: z.boolean().optional().openapi({ description: 'Make a new link; the old one stops working' }),
  phones: z.boolean().optional().openapi({ description: 'Show phone numbers on the shared page' }),
}).openapi('ShareInput');
export const ShareResult = z.object({ share_token: Uuid.nullable(), share_phones: z.boolean() }).openapi('ShareResult');

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

// ---- Activity (audit trail) ------------------------------------------------------

export const AuditAction = z.enum(['insert', 'update', 'delete', 'view', 'sign_in', 'cleanup']).openapi('AuditAction', {
  description: 'insert = added, update = changed, delete = deleted, view = opened a call sheet, sign_in = signed in, cleanup = an admin removed log entries',
});
export const AuditChange = z.object({
  field: z.string().openapi({ example: 'due_date' }),
  before: z.string().nullable(),
  after: z.string().nullable(),
  type: z.enum(['text', 'date', 'time', 'datetime']).openapi({ description: 'How the app should show the values' }),
}).openapi('AuditChange');
export const AuditEntry = z.object({
  id: z.number().int(),
  at: z.string(),
  action: AuditAction,
  source: z.enum(['app', 'link', 'system']).openapi({ description: 'app = signed in; link = a personal call sheet link with no sign-in; system = a setup or data change made outside the app' }),
  kind: z.string().openapi({ description: 'The kind of item: the table name, e.g. tasks', example: 'tasks' }),
  item_id: z.string(),
  item_label: z.string().nullable(),
  parent_kind: z.string().nullable(),
  parent_id: z.string().nullable(),
  parent_label: z.string().nullable(),
  company_id: z.uuid().nullable(),
  project_id: z.uuid().nullable(),
  project_name: z.string().nullable(),
  actor: z.object({ id: z.uuid().nullable(), name: z.string().nullable() }),
  subject_id: z.uuid().nullable().openapi({ description: 'The person the entry is about, if any' }),
  private: z.boolean().openapi({ description: 'A private journal entry: only the fact that it happened is shown, never its content' }),
  detail: z.string().nullable(),
  item_exists: z.boolean().openapi({ description: 'Whether the item (or, for a note, the item it is on) still exists' }),
  changes: z.array(AuditChange),
}).openapi('AuditEntry');
export const AuditPage = z.object({
  entries: z.array(AuditEntry),
  next_before: z.number().int().nullable().openapi({ description: 'Pass as before= to get the next, older page; null when there are no more' }),
  total: z.number().int().openapi({ description: 'Entries matching the filters, on every page' }),
}).openapi('AuditPage');
export const AuditQuery = z.object({
  project_id: Uuid.optional(),
  kind: z.string().max(60).optional(),
  action: AuditAction.optional(),
  person_id: Uuid.optional().openapi({ description: 'Entries done by this person' }),
  from: z.string().optional().openapi({ description: 'Earliest time, ISO date or date-time' }),
  to: z.string().optional().openapi({ description: 'Up to (not including) this time' }),
  before: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).optional().openapi({ description: 'Skip this many entries (page by offset instead of before=)' }),
  kinds: z.string().max(2000).optional().openapi({ description: 'Comma-separated kinds (table names); entries of any of them' }),
  actions: z.string().max(200).optional().openapi({ description: 'Comma-separated actions, e.g. insert,update' }),
  person_ids: z.string().max(4000).optional().openapi({ description: 'Comma-separated ids of who did it; "system" for setup changes' }),
  project_ids: z.string().max(4000).optional().openapi({ description: 'Comma-separated project ids (company log)' }),
  q: z.string().max(200).optional().openapi({ description: 'Search item names, who did it and details' }),
  order: z.enum(['newest', 'oldest']).default('newest'),
});
export const AuditItemQuery = z.object({
  kind: z.string().max(60).openapi({ description: 'tasks, scenes, shoot_days, project_locations, projects, companies, roles, task_categories, task_tags, journal_entries, or person', example: 'tasks' }),
  id: z.string().max(80),
  company_id: Uuid.openapi({ description: 'The company whose log to read' }),
});
export const AuditCleanupInput = z.object({
  project_id: Uuid.nullable().optional(),
  kind: z.string().max(60).nullable().optional(),
  item_id: z.string().max(80).nullable().optional(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
}).openapi('AuditCleanupInput');
export const AuditCleanupResult = z.object({ removed: z.number().int() }).openapi('AuditCleanupResult');

// ---- Characters ---------------------------------------------------------------

export const CharacterKind = z.enum(['lead', 'supporting', 'day_player', 'background']).openapi('CharacterKind');
export const CastingStatus = z.enum(['open', 'auditioning', 'offered', 'cast']).openapi('CastingStatus');

export const CharacterScene = z.object({
  scene_id: Uuid,
  look_note: nullableText.openapi({ description: 'How they look in this scene', example: 'Jacket torn, mud on face' }),
}).openapi('CharacterScene');

export const Character = z.object({
  id: Uuid,
  project_id: Uuid,
  name: z.string().openapi({ example: 'Ellie' }),
  cast_number: z.number().int().nullable().openapi({ description: 'The cast number on call sheets; 1 is usually the lead', example: 1 }),
  kind: CharacterKind.nullable(),
  description: nullableText.openapi({ example: 'A drone photographer who loses everything in one afternoon' }),
  age_range: nullableText.openapi({ example: '30s' }),
  gender: nullableText.openapi({ example: 'Female' }),
  traits: nullableText.openapi({ description: 'Traits and arc', example: 'Stubborn, funny; learns to ask for help' }),
  casting_status: CastingStatus,
  actor_id: Uuid.nullable().openapi({ description: 'Someone on the project\'s team. Picking an actor marks the character cast.' }),
  stand_in_id: Uuid.nullable(),
  double_id: Uuid.nullable().openapi({ description: 'Stunt double' }),
  wardrobe: nullableText,
  hair_makeup: nullableText,
  props: nullableText,
  continuity: nullableText,
  created_by: Uuid.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  scenes: z.array(CharacterScene).openapi({ description: 'The scenes they\'re in' }),
}).openapi('Character');

const characterFields = {
  name: z.string().trim().min(1).max(100).regex(/^[^,]*$/, 'A character name can\'t have a comma in it').openapi({ example: 'Ellie' }),
  cast_number: z.number().int().min(1).max(9999).nullable().optional(),
  kind: CharacterKind.nullable().optional(),
  description: optText(2000),
  age_range: optText(40),
  gender: optText(40),
  traits: optText(4000),
  casting_status: CastingStatus.optional().openapi({ description: 'Defaults to open' }),
  actor_id: Uuid.nullable().optional(),
  stand_in_id: Uuid.nullable().optional(),
  double_id: Uuid.nullable().optional(),
  wardrobe: optText(4000),
  hair_makeup: optText(4000),
  props: optText(4000),
  continuity: optText(4000),
};
export const CharacterInput = z.object(characterFields).openapi('CharacterInput');
export const CharacterUpdate = z.object(characterFields).partial().openapi('CharacterUpdate');

export const IdsInput = z.object({
  ids: z.array(Uuid).max(1000).openapi({ description: 'The full list; anything not listed is removed' }),
}).openapi('IdsInput');

export const LookNoteInput = z.object({
  look_note: optText(1000),
}).openapi('LookNoteInput');

export const SceneCharacterParams = z.object({
  id: Uuid.openapi({ param: { name: 'id', in: 'path' }, description: 'The scene' }),
  characterId: Uuid.openapi({ param: { name: 'characterId', in: 'path' } }),
});

export const CharacterNote = z.object({
  id: Uuid,
  character_id: Uuid,
  author_id: Uuid,
  author: Profile,
  body: z.string().openapi({ example: 'Has a scar on her left hand; keep it visible in close-ups.' }),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('CharacterNote');

// ---- Team member notes ----------------------------------------------------------

export const TeamNoteType = z.object({
  id: Uuid,
  company_id: Uuid,
  name: z.string().openapi({ example: 'Travel' }),
  sort_order: z.number().int(),
  notes: z.number().int().openapi({ description: 'How many notes use it (admins only; 0 for others)' }),
}).openapi('TeamNoteType');

export const TeamNoteTypeInput = z.object({
  name: z.string().trim().min(1).max(40).openapi({ example: 'Travel' }),
}).openapi('TeamNoteTypeInput');

export const TeamNote = z.object({
  id: Uuid,
  project_id: Uuid,
  user_id: Uuid.openapi({ description: 'Who the note is about' }),
  type_id: Uuid.nullable(),
  author_id: Uuid,
  author: Profile,
  body: z.string().openapi({ example: 'Flies in Dec 6, needs a pickup from the airport.' }),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('TeamNote');

export const TeamNoteInput = z.object({
  body: z.string().trim().min(1).max(5000),
  type_id: Uuid.nullable().optional(),
}).openapi('TeamNoteInput');
export const TeamNoteUpdate = TeamNoteInput.partial().openapi('TeamNoteUpdate');

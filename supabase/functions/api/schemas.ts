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
  email: nullableText.openapi({ example: 'ava@example.com' }),
  phone: nullableText.openapi({ example: '+1 404 555 0101' }),
}).openapi('Profile');

export const ProfileUpdate = z.object({
  full_name: z.string().trim().min(1).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
}).openapi('ProfileUpdate');

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
  email: z.email().openapi({ description: 'The email the person signed up with', example: 'cody@example.com' }),
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

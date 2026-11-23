// Hand-written to match supabase/migrations. Once the Supabase CLI is linked you
// can regenerate this with:
//   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts

export type ProjectStatus =
  | 'development' | 'pre_production' | 'production' | 'post_production'
  | 'released' | 'on_hold' | 'cancelled';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type JournalVisibility = 'private' | 'public';

export type Profile = {
  id: string; full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null;
  created_at: string;
};
export type Company = {
  id: string; name: string; description: string | null; created_by: string; created_at: string;
};
export type Role = {
  id: string; company_id: string | null; name: string; department: string | null;
  description: string | null; sort_order: number; created_at: string;
};
export type CompanyMember = {
  company_id: string; user_id: string; is_admin: boolean; title: string | null; joined_at: string;
};
export type CompanyMemberRole = { company_id: string; user_id: string; role_id: string };
export type Project = {
  id: string; company_id: string; name: string; logline: string | null; description: string | null;
  status: ProjectStatus; start_date: string | null; end_date: string | null;
  created_by: string; created_at: string;
};
export type ProjectMember = { project_id: string; user_id: string; joined_at: string };
export type ProjectMemberRole = { project_id: string; user_id: string; role_id: string };
export type Task = {
  id: string; project_id: string; parent_id: string | null; title: string; description: string | null;
  status: TaskStatus; priority: TaskPriority; assignee_id: string | null; due_date: string | null;
  sort_order: number; created_by: string; created_at: string; updated_at: string;
};
export type JournalEntry = {
  id: string; project_id: string; author_id: string; title: string | null; body: string;
  visibility: JournalVisibility; entry_date: string; created_at: string; updated_at: string;
};
export type JournalEntryShare = { entry_id: string; user_id: string; shared_at: string };

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile, 'id'>;
      companies: Table<Company, 'name'>;
      roles: Table<Role, 'name'>;
      company_members: Table<CompanyMember, 'company_id' | 'user_id'>;
      company_member_roles: Table<CompanyMemberRole, 'company_id' | 'user_id' | 'role_id'>;
      projects: Table<Project, 'company_id' | 'name'>;
      project_members: Table<ProjectMember, 'project_id' | 'user_id'>;
      project_member_roles: Table<ProjectMemberRole, 'project_id' | 'user_id' | 'role_id'>;
      tasks: Table<Task, 'project_id' | 'title'>;
      journal_entries: Table<JournalEntry, 'project_id'>;
      journal_entry_shares: Table<JournalEntryShare, 'entry_id' | 'user_id'>;
    };
    Views: Record<string, never>;
    Functions: {
      add_company_member: {
        Args: { cid: string; member_email: string; make_admin?: boolean; member_title?: string | null };
        Returns: 'added' | 'already_member';
      };
    };
    Enums: {
      project_status: ProjectStatus;
      task_status: TaskStatus;
      task_priority: TaskPriority;
      journal_visibility: JournalVisibility;
    };
    CompositeTypes: Record<string, never>;
  };
}

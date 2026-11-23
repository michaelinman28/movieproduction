# Movie Production

A platform for running a movie production: production companies, projects,
people and roles, tasks with sub-tasks, and a project journal.

Built with React (Vite), Supabase (database, sign-in, row-level security) and
[lattice-grid](https://github.com/michaelinman28/lattice-grid) for tables.

## Setup

1. **Install:** `npm install`
2. **Configure Supabase:** copy `.env.example` to `.env.local` and fill in your
   project URL and publishable key (Supabase dashboard > Project Settings > API).
3. **Create the database:** in the Supabase dashboard, open **SQL Editor**, paste
   the contents of `supabase/migrations/20261123000000_initial_schema.sql` and run it.
   (Or, with the Supabase CLI: `npx supabase link` then `npx supabase db push`.)
4. **Run:** `npm run dev` and open http://localhost:5173

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run build` | Type check and build for production |
| `npm run test:db` | Check the schema and security rules against an in-memory Postgres |

## Data model

- **companies**: production companies. The creator becomes the first admin.
- **company_members**: people in a company. `is_admin` grants management rights.
- **roles**: standard film roles (shared, `company_id` null) plus each company's custom roles.
- **company_member_roles / project_member_roles**: the roles a person holds in the company or on a project.
- **projects**: films under a company.
- **project_members**: people assigned to a project (must already be in the company).
- **tasks**: project tasks; `parent_id` makes a sub-task.
- **journal_entries**: project journal. `private` entries are visible only to the
  author and the people in **journal_entry_shares**; `public` entries are visible to
  everyone on the project.

## Who can see what

- You see companies you belong to, and the profiles of people in them.
- You see a project if you are assigned to it or are an admin of its company.
- Company admins manage members, custom roles and projects.
- Anyone on a project can create and edit its tasks.
- Only the author can edit a journal entry or share a private one.

## lattice-grid

A copy of lattice-grid lives in `src/vendor/lattice-grid` (see the README there).
Use it through the `LatticeGrid` React component in `src/components/LatticeGrid.tsx`.

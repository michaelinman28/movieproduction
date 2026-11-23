# Movie Production

A platform for running a movie production: production companies, projects,
people and roles, tasks with sub-tasks, and a project journal.

Built with React (Vite), a separate API layer (Hono, with an OpenAPI spec and
Swagger UI), Supabase (database, sign-in, row-level security) and
[lattice-grid](https://github.com/michaelinman28/lattice-grid) for tables.

```
React app (src/)  ──HTTP──▶  API (supabase/functions/api)  ──▶  Supabase Postgres
                              Swagger UI at /docs              row-level security
```

The app reads and writes all data through the API. The API calls the database
as the signed-in person (it forwards their access token and uses only the
publishable key), so the database's security rules apply to every request.

## Setup

1. **Install:** `npm install`
2. **Configure Supabase:** copy `.env.example` to `.env.local` and fill in your
   project URL and publishable key (Supabase dashboard > Project Settings > API).
3. **Create the database:** run each file in `supabase/migrations` in order, in the
   Supabase dashboard's **SQL Editor** (or `npx supabase link` then `npx supabase db push`).
   The live project already has every migration in this folder applied.
4. **Run the API:** `npm run api`, then open http://localhost:8787/docs for Swagger.
5. **Run the app:** in another terminal, `npm run dev` and open http://localhost:5173

## Preview site

Every push to `main` builds the app and publishes it to GitHub Pages at
https://michaelinman28.github.io/movieproduction/ (see `.github/workflows/pages.yml`).
One-time setup: repository Settings > Pages > Source: **GitHub Actions**, and in Supabase,
Authentication > URL Configuration: set the Site URL to that address and add it
(plus `http://localhost:5173/**`) to the Redirect URLs.

## Preview site

Every push to `main` builds the app and publishes it to GitHub Pages at
https://michaelinman28.github.io/movieproduction/ (see `.github/workflows/pages.yml`).
One-time setup: repository Settings > Pages > Source: **GitHub Actions**, and in Supabase,
Authentication > URL Configuration: set the Site URL to that address and add it
(plus `http://localhost:5173/**`) to the Redirect URLs.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run api` | Start the API locally on port 8787 (Swagger at `/docs`, spec at `/openapi.json`) |
| `npm run api:spec` | Write the OpenAPI spec to `api/openapi.json` |
| `npm run build` | Type check and build for production |
| `npm run test:db` | Check the schema and security rules against an in-memory Postgres |

## API

- Code: `supabase/functions/api` (routes in `routes/`, request and response schemas in `schemas.ts`).
  The same code runs on Node locally (`api/server.ts`) and on Supabase Edge Functions (`index.ts`).
- Live: https://qixblelhruxdzxfaeamz.supabase.co/functions/v1/api/docs once deployed with
  `npx supabase functions deploy api --project-ref qixblelhruxdzxfaeamz --no-verify-jwt`
  (the API checks tokens itself so sign-up and sign-in work without one).
- Spec: `api/openapi.json`, or `/openapi.json` on a running API.
- Auth: `POST /auth/signin` returns an `access_token`; send it as `Authorization: Bearer <token>`.

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

## Pages

- **Companies** (`/`): your companies; create a new one (you become its admin).
- **Company** (`/companies/:id`): projects and people. Admins create projects, add
  people by the email they signed up with, set titles, admin rights and company roles.
- **Project** (`/projects/:id`): details, status and dates, and the team. Admins assign
  company members to the project and pick their project roles.
- **Profile** (`/profile`): your name and phone number.

People create their own account first (name, email, optional phone, password).
A company admin then adds them to the company and assigns them to projects.

## Who can see what

- You see companies you belong to, and the profiles of people in them.
- You see a project if you are assigned to it or are an admin of its company.
- Company admins manage members, custom roles and projects.
- Anyone on a project can create and edit its tasks.
- Only the author can edit a journal entry or share a private one.

## lattice-grid

A copy of lattice-grid lives in `src/vendor/lattice-grid` (see the README there).
Use it through the `LatticeGrid` React component in `src/components/LatticeGrid.tsx`.

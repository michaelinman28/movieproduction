# Movie Production Platform: Project and Architecture

## What it is

A web platform for running movie productions. A production company signs up,
creates its film projects, brings its people on board, and runs each project
day to day.

### Features

| Area | What people can do | Status |
|---|---|---|
| Accounts | Create an account (name, email, phone, password), confirm the email, sign in, edit their profile | Done |
| Companies | Create a production company. The creator becomes its first admin | Done |
| People | Company admins add people who already have an account, by email. They can give people a title, admin rights and company roles | Done |
| Projects | Admins create several projects per company, each with a status (development to released), dates and a logline | Done |
| Project teams | Admins assign company members to projects and give them project roles | Done |
| Roles | 32 standard film roles (Producer, Director, DP, Gaffer…) are shared by every company. Each company can add its own custom roles | Standard roles done; managing custom roles is next |
| Tasks | Tasks and sub-tasks per project, with assignee, status, priority and due date, shown as a tree | Database ready; screens next |
| Journal | A project journal. Entries are **private** (only the author, unless the author shares them with chosen people) or **public** (everyone on the project) | Database ready; screens next |

### How people join

1. A person creates their own account and confirms their email.
2. A company admin adds them to the company using that email.
3. The admin assigns them to projects and picks their roles.

## Architecture

```
 ┌──────────────────────────┐      HTTPS + JSON       ┌───────────────────────────┐        ┌──────────────────────────┐
 │  Web app (React)         │  Authorization: Bearer  │  API layer (Hono)         │  user's │  Supabase                │
 │  src/                    │ ──────────────────────▶ │  supabase/functions/api   │  token  │  Postgres + Auth         │
 │  Tailwind, mobile-first  │                         │  OpenAPI 3.1 + Swagger UI │ ──────▶ │  row-level security      │
 │  lattice-grid tables     │ ◀────────────────────── │  /docs  /openapi.json     │         │  migrations in supabase/ │
 └──────────────────────────┘                         └───────────────────────────┘         └──────────────────────────┘
          │  sign-in only (Supabase Auth)                                                              ▲
          └────────────────────────────────────────────────────────────────────────────────────────────┘
```

There are three layers, and each one can be run and tested by itself.

### 1. Web app (`src/`)

- A React single-page app built with Vite.
- It reads and writes **all data through the API** (`src/lib/api.ts`). It never
  queries the database directly.
- It uses Supabase Auth in the browser only to sign people in and keep their
  session. The session's access token is sent to the API with every request.
- Tables use Michael's [lattice-grid](https://github.com/michaelinman28/lattice-grid)
  library through a React wrapper (`src/components/LatticeGrid.tsx`). Tasks will
  use its tree mode for sub-tasks.
- Styling uses Tailwind CSS with a mobile-first approach (see below).

### 2. API layer (`supabase/functions/api`)

- A REST API built with [Hono](https://hono.dev) and `@hono/zod-openapi`. Each
  endpoint declares its request and response shapes with [zod](https://zod.dev)
  schemas (`schemas.ts`). Those schemas both validate requests and generate the
  OpenAPI document.
- **Swagger UI** is served at `/docs` and the spec at `/openapi.json`. A copy of
  the spec is kept in the repo at `api/openapi.json` (`npm run api:spec`).
- The same code runs in two places:
  - **Locally on Node:** `npm run api` serves it at http://localhost:8787.
  - **On Supabase Edge Functions (Deno):** deployed as the function `api`, at
    `https://qixblelhruxdzxfaeamz.supabase.co/functions/v1/api`.
- **Security model:** the API never uses the database's secret key. It calls
  Supabase with the publishable key plus the caller's own access token, so
  every request runs as that person. Row-level security in the database is the
  single source of truth for who can see or change what. The API adds
  validation, friendlier errors and joined responses on top.
- Errors are always `{ "error": "message" }`, with 400, 401, 403, 404 or 409.

| Group | Endpoints |
|---|---|
| Account | `POST /auth/signup`, `POST /auth/signin`, `POST /auth/refresh`, `GET /me`, `PATCH /me` |
| Companies | `GET/POST /companies`, `GET/PATCH/DELETE /companies/{id}`, `GET /companies/{id}/roles` |
| Company people | `GET/POST /companies/{id}/members`, `PATCH/DELETE /companies/{id}/members/{userId}`, `PUT …/roles` |
| Projects | `GET/POST /companies/{id}/projects`, `GET/PATCH/DELETE /projects/{id}` |
| Project team | `GET/POST /projects/{id}/members`, `DELETE /projects/{id}/members/{userId}`, `PUT …/roles` |

### 3. Database (`supabase/migrations`)

- Supabase Postgres. Each schema change is a numbered SQL migration, applied in order.
- **Row-level security is on for every table.** Highlights:
  - You see only the companies you belong to, and the profiles of people in them.
  - You see a project if you're assigned to it, or if you're an admin of its company.
  - Only company admins manage people, projects and custom roles.
  - Private journal entries are visible only to the author and the people they
    share them with. Only the author can edit them.
- Integrity rules live in the database too. A company always keeps at least one
  admin. Only company members can join its projects. Removing someone from a
  company removes them from its projects. Sub-tasks can't form loops.

| Table | Purpose |
|---|---|
| `profiles` | One per account: name, email, phone |
| `companies` | Production companies |
| `company_members` | People in a company, with `is_admin` and `title` |
| `roles` | Standard roles (`company_id` null) and each company's custom roles |
| `company_member_roles`, `project_member_roles` | Roles a person holds in the company or on a project |
| `projects` | Films under a company: status, dates, logline |
| `project_members` | People assigned to a project |
| `tasks` | Project tasks. `parent_id` makes a sub-task |
| `journal_entries`, `journal_entry_shares` | The project journal and who private entries are shared with |

## Technologies

| Layer | Technology | Why |
|---|---|---|
| Language | TypeScript, everywhere | One language and shared types across the app and the API |
| Web app | React 19, Vite, React Router | Fast dev server, simple static build |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`) | Utility classes keep styles next to markup, and its breakpoints are mobile-first by design |
| Tables | lattice-grid (Michael's library, vendored in `src/vendor/lattice-grid`) | Sorting, filtering, editing and tree data for tasks |
| API | Hono, `@hono/zod-openapi`, zod, `@hono/swagger-ui` | Small, fast, runs on both Node and Deno, generates the OpenAPI spec from the code |
| Database and auth | Supabase (Postgres, Auth, Edge Functions) | Hosted Postgres with row-level security, email sign-in, and somewhere to run the API |
| Tests | pglite (in-memory Postgres) for security rules; Playwright for browser checks | Security rules are tested without a live database |
| Hosting | GitHub Pages for the web app (`.github/workflows/pages.yml`); Supabase Edge Functions for the API | Free, deploys on every push to `main` |

## Styling: Tailwind CSS, mobile first

Every screen is designed for a phone first, then enhanced for larger screens.

- **Write the phone layout first.** Unprefixed Tailwind classes are the phone
  styles. Add `sm:` (640px), `md:` (768px) and `lg:` (1024px) only to adapt
  for bigger screens. For example, `flex flex-col gap-3 md:flex-row` stacks on a
  phone and sits side by side on a laptop.
- **One column by default.** Forms stack vertically and buttons go full width on
  phones. Side panels (such as a person's roles) sit below the table on phones
  and beside it from `lg:` up.
- **Touch-friendly.** Buttons, checkboxes and links have tap targets of at least
  44px. Nothing depends on hover.
- **No sideways page scrolling.** The page fits a 360px-wide screen. Wide data
  tables scroll inside their own box, never the whole page.
- **Readable text.** Inputs use at least 16px text so phones don't zoom in when
  someone taps a field.
- **Green is the primary color.** Buttons, links, selection and focus use the
  accent green (`#15803d` in light mode, `#4ade80` in dark mode).
- **Light and dark themes with a switch.** A sun/moon switch in the header (and
  on the sign-in page) flips between light and dark. The app follows the
  device setting until someone uses the switch, then remembers their choice on
  that device (`src/lib/theme.tsx`, applied before first paint in `index.html`).
- **Theme tokens, not raw colors.** Colors are defined once in `src/styles.css`
  (`@theme`, with dark overrides under `[data-theme='dark']`). Components use the
  tokens (`bg-surface`, `text-muted`, `border-line`, `bg-accent`). lattice-grid
  follows the same switch and is tinted to match.
- **lattice-grid** keeps its own stylesheet. Tailwind styles the page around it.

## Repository layout

```
src/                         React app
  components/                LatticeGrid wrapper, RolePicker, shared UI
  lib/api.ts                 API client used by every page
  lib/supabase.ts, auth.tsx  Sign-in session only
  pages/                     Companies, Company, Project, Profile, Sign in
  styles.css                 Tailwind entry and theme tokens
  vendor/lattice-grid/       Michael's grid library
supabase/
  migrations/                Database schema, security rules, seed roles
  functions/api/             The API (app.ts, routes/, schemas.ts, index.ts for Edge Functions)
api/
  server.ts                  Runs the API on Node for local development
  export-spec.ts             Writes api/openapi.json
  openapi.json               The OpenAPI spec
tests/schema.test.mjs        Security rule tests on in-memory Postgres
.github/workflows/pages.yml  Builds and publishes the web app preview
```

## Running it locally

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key.
3. `npm run api`: the API is at http://localhost:8787, with Swagger at http://localhost:8787/docs.
4. `npm run dev`: the app is at http://localhost:5173.

Checks: `npm run typecheck` (app and API), `npm run test:db` (security rules), `npm run build`.

## Environments

| What | Where |
|---|---|
| Web app preview | https://michaelinman28.github.io/movieproduction/ (rebuilt on every push to `main`) |
| API | https://qixblelhruxdzxfaeamz.supabase.co/functions/v1/api (Swagger at [/docs](https://qixblelhruxdzxfaeamz.supabase.co/functions/v1/api/docs)) |
| Database | Supabase project `qixblelhruxdzxfaeamz` |

## Roadmap

1. Foundation: schema, security rules, sign-in (done)
2. Companies, projects and people (done)
3. Roles: manage custom roles per company
4. Tasks and sub-tasks in a lattice-grid tree
5. Project journal with private, shared and public entries

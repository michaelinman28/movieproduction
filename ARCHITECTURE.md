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
| Roles | 32 standard film roles (Producer, Director, DP, Gaffer…) are shared by every company. Company admins add, rename and delete their own custom roles on the Roles page; a custom role can't reuse a standard role's name | Done |
| Tasks | A tree of tasks and sub-tasks (any depth) on each project's Tasks page. See [Tasks](#tasks) below | Done |
| Task categories and tags | Each company has its own task categories (12 starter ones) that admins add, rename, reorder and delete, and its own tags, which anyone in the company can add and admins can rename or delete | Done |
| Locations | Each project's locations, with a status (Considering, Confirmed, Not using; Not using ones are hidden unless you ask, and aren't offered for tasks), a description, an address (the Map column, the panel and the task panel open it in the device's own maps app: Apple Maps on iPhone, iPad and Mac, the default maps app on Android, Google Maps in the browser elsewhere; `src/lib/maps.ts`) and an on-site contact name, email and phone. Anyone on the project adds and edits them; whoever added one or an admin deletes it. A task can be assigned to a location | Done |
| Journal | A project journal. Entries are **private** (only the author, unless the author shares them with chosen people) or **public** (everyone on the project) | Database ready; screens next |

### Tasks

- **Where:** a project's Tasks page (`/projects/:id/tasks`). A lattice-grid tree shows each task
  with its category, status, priority, person assigned, due date and time, tags and
  sub-task progress. Quick filter, column filters and expand/collapse are in the grid.
- **Who:** everyone on the project, plus admins of its company.
- **Views:** a "Show" menu switches between the sub-task tree, a calendar, an Overdue
  list (only tasks that aren't done and are past their due time, oldest first, with the
  count in the menu), flat lists grouped by person, category, location, status,
  priority or due date (more columns can be dragged into the grouping bar), and My
  tasks (only tasks assigned to you, soonest due first; tasks added there are assigned
  to you). Switching views closes the open task form. The choice is remembered on the
  device.
- **Calendar** (`src/components/TaskCalendar.tsx`): a month of tasks by due date, in
  order of the day. Click a day to list its tasks below the month (phones show a count
  per day instead of names); click a task to open its panel (choosing another day closes it, unless the task is due that day). Tasks added while the
  calendar shows are due on the chosen day. On a computer, drag a task to another day
  to move its due date (saved at once, like a table cell). Tasks without a due date are
  counted under the month.
- **Editing in the grid:** every task field. Person, category, status, priority, time
  and "Sub-task of" cells look like dropdowns and open their list with one click.
  Double-click the task name, due date, description or tags to type a change (tags are
  comma-separated, and new names become company tags).
- **The task panel** (select a task; changes wait for Save): title, description, status, priority, person
  assigned, due date with a time of day
  (Any time, Morning, Afternoon, Evening) or an exact time, category, tags, notes,
  the list of sub-tasks (tick to mark done, click to open), adding a sub-task, moving
  the task under another one, and deleting it with its sub-tasks.
- **Overdue:** a task that isn't done turns red once its due time passes (noon for
  Morning, 5 PM for Afternoon, midnight for Evening or no time).
- **Notes:** any number per task, oldest first, signed with the author and time.
  Only the author edits a note; the author or a company admin deletes it.
- **Tags:** start typing in the panel's tag box to pick an existing company tag, or
  press Enter on a new name to create it.

### How people join

1. A company admin adds someone by email, on the company's People list or a project's
   Team page. If they already have an account they're added straight away.
2. If nobody has signed up with that email yet, the admin gives their name (and phone)
   and they're added anyway, as a profile with `has_account = false`. They can be put
   on projects, given roles and assigned tasks right away.
3. The admin sends an invite from the person's form. There's no email server: **Email
   invite** opens the admin's own email app (`mailto:`) with the message filled in, and
   **Copy invite** copies it to paste anywhere (`src/lib/invite.ts`,
   `src/components/InviteButtons.tsx`). The link opens sign-up with their name and
   email filled in (`?invite=1&email=…`).
4. When someone signs up with that email and confirms it, the waiting profile becomes
   theirs (`claim_pending_profile`, run by triggers on `auth.users`): its id changes to
   their account id, and every link to it (companies, projects, roles, tasks) follows,
   since those foreign keys are `on update cascade`. Profiles no longer reference
   `auth.users` directly; deleting an account deletes its profile by trigger.
5. Until then an admin can correct their email. Removing a waiting person from their
   last company deletes them. People can also sign up first and be added later.
   Database: migration `20261124040000_people_without_accounts.sql`
   (`add_company_person`, `add_project_person`).

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
  library through a React wrapper (`src/components/LatticeGrid.tsx`). Tasks use
  its tree mode for sub-tasks (`src/components/TaskTree.tsx`).
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
| Companies | `GET/POST /companies`, `GET/PATCH/DELETE /companies/{id}` |
| Roles | `GET/POST /companies/{id}/roles` (with how many people hold each), `PATCH/DELETE /roles/{id}` (custom roles only) |
| Company people | `GET/POST /companies/{id}/members`, `PATCH/DELETE /companies/{id}/members/{userId}`, `PUT …/roles` |
| Projects | `GET/POST /companies/{id}/projects`, `GET/PATCH/DELETE /projects/{id}` |
| Project team | `GET/POST /projects/{id}/members`, `DELETE /projects/{id}/members/{userId}`, `PUT …/roles` |
| Tasks | `GET/POST /projects/{id}/tasks`, `GET/PATCH/DELETE /tasks/{id}` (deleting a task deletes its sub-tasks) |
| Task notes | `GET/POST /tasks/{id}/notes`, `PATCH/DELETE /task-notes/{id}` |
| Task categories | `GET/POST /companies/{id}/task-categories`, `PATCH/DELETE /task-categories/{id}` |
| Task tags | `GET/POST /companies/{id}/task-tags`, `PATCH/DELETE /task-tags/{id}`; a task's `tag_ids` are set with `PATCH /tasks/{id}` |

### 3. Database (`supabase/migrations`)

- Supabase Postgres. Each schema change is a numbered SQL migration, applied in order.
- **Row-level security is on for every table.** Highlights:
  - You see only the companies you belong to, and the profiles of people in them.
  - You see a project if you're assigned to it, or if you're an admin of its company.
  - Only company admins manage people, projects and custom roles.
  - Everyone on a project, and admins of its company, can work on its tasks and
    add notes. Only a note's author edits it; the author or an admin can delete it.
  - Company members see the company's task categories and tags. Admins manage
    categories; anyone in the company can create tags; admins rename or delete them.
  - Private journal entries are visible only to the author and the people they
    share them with. Only the author can edit them.
- Integrity rules live in the database too. A company always keeps at least one
  admin. Only company members can join its projects. Removing someone from a
  company removes them from its projects, and leaving a project unassigns their
  tasks there. Tasks can only be assigned to people on the project. Sub-tasks stay
  in their parent's project and can't form loops. A task's category and tags must
  belong to its company. A due time needs a due date, and a task has either a part
  of the day or an exact time, not both.

| Table | Purpose |
|---|---|
| `profiles` | One per account: name, email, phone |
| `companies` | Production companies |
| `company_members` | People in a company, with `is_admin` and `title` |
| `roles` | Standard roles (`company_id` null) and each company's custom roles |
| `company_member_roles`, `project_member_roles` | Roles a person holds in the company or on a project |
| `projects` | Films under a company: status, dates, logline |
| `project_members` | People assigned to a project |
| `tasks` | Project tasks. `parent_id` makes a sub-task; due date with optional part of day or time |
| `task_notes` | Notes on a task, with author and time |
| `task_categories`, `task_tags`, `task_tag_links` | Each company's task categories and tags, and which tags each task has |
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
- **Project pages have a left nav.** A project's areas (Overview, Tasks, Locations,
  Team, Journal) are separate pages under `/projects/:id`, framed by
  `src/pages/project/ProjectLayout.tsx`: the project's name, and a nav that is a left
  column from `md:` up and a row of tabs (scrolling sideways inside itself) on phones,
  plus links to the company's pages. The layout loads the project, team, roles and
  locations once and hands them to each page (`useProject()`).
- **One column by default.** Forms stack vertically and buttons go full width on
  phones. A row's form or side panel (such as a person's roles) opens under
  its table on every screen size, so the table keeps the full width. Wide panels lay
  their fields out in two columns from `md:`/`lg:` up.
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
- **Every section is collapsible (standard).** Each titled section below a page's
  heading, and each titled part of a side panel, uses the `Section` component
  (`src/components/Section.tsx`): its heading opens and closes it, it can show a short
  summary (a count, "1 of 5 done"), and whether it's open is remembered per device
  under a stable id such as `project.tasks`. Use `level="h4"` inside panels. The page
  heading itself (h1 and the actions beside it) is never collapsible. New sections
  must follow this.
- **One pinned action button (standard).** While scrolling, the main action of the
  section on screen (Add task, Add location, Create project…) pins under the header
  once it scrolls past the top, so it's always one tap away on a phone. An open
  form's Save (`data-pin="2"`) takes the spot for as long as the form is open, on every
  page and wherever the form is (disabled until there's something to save). Only one button is pinned at a time
  (`src/components/PinnedAction.tsx`). Mark buttons with `data-pin`; the section or
  panel they belong to has `data-pin-scope`.
- **Forms wait for Save; tables save as you go (standard).** In a form or side panel,
  every change (typed text and picks alike) is held until Save, which sits next to
  Undo changes and pins to the top while there's something to save. Selecting another
  row, following a link or closing the tab with unsaved changes asks first
  (`src/lib/unsaved.ts`, `UnsavedGuard`). Editing a table cell saves when the edit
  ends. One-off actions (add a sub-task or note, tick a sub-task done) happen at once.
- **Adding opens the new item's form (standard).** Adding a task, location, person,
  team member, role, category or tag selects it, highlights its row and opens its form
  (scrolled into view on a phone), since a name alone is rarely all it needs. A new
  company or project opens its page with the details form ready.
- **Dropdown filters for fixed values (standard).** In every table, a column whose
  values come from a fixed set (person assigned, status, priority, category, location,
  department, admin, roles, tags…) filters with a dropdown of tick boxes and counts.
  List columns (roles, tags) list each name on its own (`filterSplit`, a local
  lattice-grid option). Free text, dates and numbers keep the typed filter.
- **Every field is editable in both the table and the form (standard).** If someone
  may change a field, they can change it in the table (in place) and in the page's
  form or side panel. Pick-list fields use a `select` editor shown as a dropdown
  (`gridDropdown`), which the `LatticeGrid` wrapper opens on one click and saves on
  pick. Free text uses the text or `textarea` editor. Lists of names (roles, tags) are
  typed comma-separated in the table and ticked or picked in the panel. A row that is
  also a link gets a separate Open link column when its name is editable. Fields that
  belong to someone else's record stay read-only outside their home: a person's name,
  nickname (optional, shown beside their name) and phone are edited on the company's People list (admins, in the table and the
  form) or on their own profile, along with their other emails and phones
  (`person_contacts`); the sign-in email is changed only by the person, on their
  profile, after confirming the new address. A person's name in a project's team form links to
  them on the company's People list (`/companies/:id?person=<user id>`). Role pickers
  group roles by department (plus Custom roles), each group a collapsible `Section`
  that starts closed unless it has a ticked role.
  When someone is added to a project, their project roles start as a copy of their
  company roles (trigger `copy_company_roles_to_project`); admins can then change them.
- **Phones and emails.** Phone numbers are stored as `###-###-####` (10 digits, or 11
  starting with 1), or `+` and digits for other countries; anything else is refused.
  Emails need a full address (`name@example.com`). The database enforces this
  (`format_phone`, `is_valid_email`/`check_email`, migration `20261124030000`), and
  `src/lib/contact.ts` applies the same rules in the app: phone fields tidy themselves
  when you leave them, and Save/Add says what's wrong before sending.

## Repository layout

```
src/                         React app
  components/                LatticeGrid wrapper, TaskTree (grid + panel), TaskCalendar, TaskNotes,
                             TagPicker, RolePicker, ThemeSwitch
  lib/api.ts                 API client used by every page
  lib/supabase.ts, auth.tsx  Sign-in session only
  pages/                     Companies, Company, Roles, Task settings, Project, Profile, Sign in
  styles.css                 Tailwind entry and theme tokens
  vendor/lattice-grid/       Michael's grid library
supabase/
  migrations/                Database schema and security rules, one file per change:
                             initial schema, add people, profile phone, custom roles,
                             tasks, task due times, task notes, task categories and tags
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

## Making a change

1. **Database:** add a new numbered file in `supabase/migrations` (never edit an
   applied one), add tests for its rules to `tests/schema.test.mjs`, and apply it to
   the live project.
2. **API:** add the zod schemas in `schemas.ts` and the routes in `routes/`, run
   `npm run api:spec`, and redeploy the `api` Edge Function (see the README).
3. **App:** add the client call in `src/lib/api.ts` and build the screen, phone
   layout first.

## Environments

| What | Where |
|---|---|
| Web app preview | https://michaelinman28.github.io/movieproduction/ (rebuilt on every push to `main`) |
| API | https://qixblelhruxdzxfaeamz.supabase.co/functions/v1/api (Swagger at [/docs](https://qixblelhruxdzxfaeamz.supabase.co/functions/v1/api/docs)) |
| Database | Supabase project `qixblelhruxdzxfaeamz` |

## Roadmap

1. Foundation: schema, security rules, sign-in (done)
2. Companies, projects and people (done)
3. Roles: manage custom roles per company (done)
4. Tasks and sub-tasks in a lattice-grid tree, with due times, notes, categories and tags (done)
5. Project journal with private, shared and public entries

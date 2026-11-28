# Movie Production

A web platform for running movie productions. A production company signs up, creates
its film projects, brings its people on board, and runs each project day to day with
tasks, sub-tasks and (next) a project journal.

- **App:** https://movie-prod.netlify.app/ (every pull request also gets its own Deploy Preview)
- **API docs (Swagger):** https://qixblelhruxdzxfaeamz.supabase.co/functions/v1/api/docs
- **Architecture and technology overview:** [ARCHITECTURE.md](ARCHITECTURE.md)

## What you can do

| Area | Features |
|---|---|
| Accounts | Sign up with name, email, optional phone and password; confirm the email; edit your profile |
| Companies | Create a production company (you become its admin) |
| People | Admins add people who already have an account, by email, and give them a title, admin rights and company roles |
| Roles | 32 shared standard film roles, plus each company's own custom roles |
| Projects | Several projects per company, with status, dates and logline |
| Project teams | Admins assign company members to projects and pick their project roles |
| Tasks | A tree of tasks and sub-tasks per project, with category, tags, status, priority, assignee, and a due date with an optional time of day (Morning, Afternoon, Evening) or exact time. Each task has a description and any number of notes. A calendar view shows tasks by due date |
| Task categories and tags | Each company has its own category list (admins set it up) and its own tags (anyone can add them while tagging a task) |
| Locations | Each project's locations with a status (Considering, Confirmed, Not using), description, address (opens in your phone's or computer's maps app) and contact (name, email, phone); tasks can be assigned to one |
| Scenes and shot lists | Each project's scenes in script order (set, INT/EXT, day or night, pages, characters, needs, location, status), each with a shot list (size, angle, movement, lens, equipment, time) ticked off on set |
| Shoot days and call sheets | Each shoot day's location, times, weather, ordered schedule and who is called; its call sheet is built from that, sent as a new version, confirmed by each person, and printable |
| Scene notes | Any number of notes on each scene, in their own section of the scene form |
| Project notes | Every note on a project in one list (tasks, scenes, shots, shoot days, schedules, calls), each linking back to where it was taken |
| Journal | Coming next: private, shared and public entries per project |

A company admin adds people by email. Someone who hasn't signed up yet is added with
their name, can be put on projects and given tasks straight away, and joins
automatically when they sign up with that email. Invites go out from the admin's own
email app (or are copied to send another way).

## How it fits together

```
React app (src/)  ──HTTPS──▶  API (supabase/functions/api)  ──▶  Supabase Postgres
Tailwind, lattice-grid         Hono + OpenAPI, Swagger at /docs   row-level security
```

The app reads and writes all data through the API, and uses Supabase only to sign
people in. The API calls the database as the signed-in person (it forwards their
access token and uses only the publishable key), so the database's security rules
decide what every request can see and change. See [ARCHITECTURE.md](ARCHITECTURE.md)
for the details.

## Run it locally

1. **Install:** `npm install`
2. **Configure:** copy `.env.example` to `.env.local` and fill in the Supabase project
   URL and publishable key (Supabase dashboard > Project Settings > API). Leave
   `VITE_API_URL` unset to use the local API, or point it at the live one.
3. **Run the API:** `npm run api`, then open http://localhost:8787/docs for Swagger.
4. **Run the app:** in another terminal, `npm run dev`, then open http://localhost:5173.

The live database already has every migration applied, so a local setup can use it
as is. To set up a new Supabase project instead, apply the files in
`supabase/migrations` in order (SQL Editor, or `npx supabase db push`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally on port 5173 |
| `npm run api` | Start the API locally on port 8787 (Swagger at `/docs`, spec at `/openapi.json`) |
| `npm run api:spec` | Write the OpenAPI spec to `api/openapi.json` |
| `npm run typecheck` | Type check the app and the API |
| `npm run test:db` | Check the schema and security rules against an in-memory Postgres |
| `npm run build` | Type check and build the app for production |
| `npm run preview` | Serve the production build locally |

## Deploying

- **Web app:** Netlify builds and hosts it (`netlify.toml`). Every push to `main`
  publishes https://movie-prod.netlify.app/, and every pull request gets a Deploy
  Preview at `https://deploy-preview-<number>--movie-prod.netlify.app/` (Netlify posts
  the link on the PR). The build runs `test:db` and `typecheck` first, so a failing
  check fails the deploy.
- **API:** deploy to Supabase Edge Functions after API changes:
  `npx supabase functions deploy api --remote=qixblelhruxdzxfaeamz --no-verify-jwt --use-api`
  (add `--yes` when running without a prompt). `--no-verify-jwt` is needed because
  sign-up and sign-in are called without a token; the API checks tokens itself.
- **Database:** apply each new file in `supabase/migrations` to the live project, in
  order, before deploying API code that needs it.

Supabase, Authentication > URL Configuration: the Site URL is
`https://movie-prod.netlify.app/`, and the Redirect URLs allow
`https://movie-prod.netlify.app/**`, `https://*--movie-prod.netlify.app/**` (Deploy
Previews) and `http://localhost:5173/**`, so confirmation emails link back to the app.
Sign-up emails sent from a Deploy Preview link back to that preview.

## Pages

| Page | Path | What it shows |
|---|---|---|
| Companies | `/` | Your companies; create a new one. Admins edit the name and description in the table |
| Company | `/companies/:id` | Projects and people. Admins create projects, add people by email, and edit both tables in place |
| Roles | `/companies/:id/roles` | Standard roles and the company's custom roles |
| Task categories and tags | `/companies/:id/task-settings` | The company's category list (admins add, rename, reorder, delete) and its tags |
| Project overview | `/projects/:id` | Details (admins edit them), counts of open and overdue tasks, locations and people, and what's coming up |
| Project tasks | `/projects/:id/tasks` | The task tree, calendar, overdue list, grouped lists and My tasks, with each task's form under the table |
| Project scenes | `/projects/:id/scenes` | The project's scenes and, under the table, the selected scene's form and shot list |
| Project shoot days | `/projects/:id/shoot-days` | The project's shoot days and, under the table, the selected day's details, schedule and who's called |
| Call sheet | `/projects/:id/shoot-days/:dayId` | A day's call sheet: send, email, copy, print, and confirm your own call |
| Project locations | `/projects/:id/locations` | The project's locations |
| Project team | `/projects/:id/team` | Who's on the project and their project roles |
| Project notes | `/projects/:id/notes` | Every note on the project, linking back to where each was taken |
| Project journal | `/projects/:id/journal` | Coming next |
| Profile | `/profile` | Your name and phone number |
| Help | `/help` | How every feature works, for everyone (no sign-in). Markdown files in `help/` |

## Who can see and change what

- You see the companies you belong to, and the profiles of people in them.
- You change your own name, phone and sign-in email (a new email is confirmed by a link first). A company admin can change the name and phone of anyone in their company, and add or remove their other email addresses and phone numbers; only the person changes their sign-in email.
- You see a project if you're assigned to it, or if you're an admin of its company.
- Company admins manage people, projects, custom roles and task categories.
- Everyone on a project (and company admins) can add and edit its tasks and add notes.
  Only a note's author can edit it; the author or an admin can delete it.
- Anyone in a company can create task tags; admins can rename or delete them.
- Everyone on a project can add and edit its locations; whoever added one, or an admin,
  can delete it.
- Everyone on a project can add, edit and reorder its scenes and shots; whoever added a
  scene, or an admin, can delete it.
- Everyone on a project can plan its shoot days and send call sheets; whoever added a
  day, or an admin, can delete it. Each person confirms their own call.
- Journal entries: private ones are seen only by the author and the people they share
  them with; public ones by everyone on the project.

## Project layout

```
src/                     React app (pages/, components/, lib/api.ts, styles.css)
supabase/migrations/     Database schema and security rules, one file per change
supabase/functions/api/  The API (routes/, schemas.ts)
api/                     Runs the API on Node, and its OpenAPI spec
tests/schema.test.mjs    Security rule tests
```

Tables use a vendored copy of [lattice-grid](https://github.com/michaelinman28/lattice-grid)
in `src/vendor/lattice-grid`, through the `LatticeGrid` React component in
`src/components/LatticeGrid.tsx`.

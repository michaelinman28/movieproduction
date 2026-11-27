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
| Locations | Each project's locations, with a status (Considering, Confirmed, Not using; Not using ones are hidden unless you ask, and aren't offered for tasks), a description, an address (the Map column, the panel and the task panel open it in the device's own maps app: Apple Maps on iPhone, iPad and Mac, the default maps app on Android, Google Maps in the browser elsewhere; `src/lib/maps.ts`) an on-site contact name, email and phone, and parking and the nearest hospital for call sheets. Anyone on the project adds and edits them; whoever added one or an admin deletes it. A task can be assigned to a location | Done |
| Scenes and shot lists | Each project's scenes on its Scenes page, in script order (drag to reorder): number, set, INT/EXT, day or night, pages in eighths, synopsis, characters, elements, other needs, location and status (Not scheduled, Scheduled, Shot). Each scene has a shot list in its form: shots in shooting order with size, angle, movement, lens, equipment, estimated minutes and notes, ticked Done on set with one tap. Anyone on the project adds, edits and reorders them; whoever added a scene, or an admin, deletes it (with its shots). See [Scenes](#scenes-and-shot-lists) below | Done |
| Elements | Each project's breakdown elements on its Elements page: props, wardrobe, vehicles, animals, effects and the rest, each stored once and linked to the scenes that use it (edited from the scene too), with a category (12 starter ones per company, admins manage them), status (Needed, Sourced, Ready), owner, quantity, description, notes, and optionally the one character it belongs to and the one location it stays at. Call sheets list the day's elements. See [Elements](#elements) below | Done |
| Shoot days and call sheets | Each project's shoot days on its Shoot days page: date, title, a note under the title, one or more locations in order, crew call, shooting call, lunch, wrap, weather (looked up from the main location's address), sunrise and sunset, notes, an ordered schedule of scenes, meal breaks, company moves and notes, and who is called (each person's call time; cast with character, pickup and makeup). Each day's call sheet is built from all that, sent as a new version (by email from your own app, or copied), and confirmed by each person; it prints cleanly. See [Shoot days](#shoot-days-and-call-sheets) below | Done |
| Scene notes | Any number of notes on a scene, in their own Notes section of the scene form (apart from Details and the Shot list, so those can be folded away). Like task notes: anyone on the project adds them, the author edits their own, and the author or an admin deletes one | Done |
| Project notes | The Project notes page lists every note on a project, newest first: task notes, scene notes, shot notes, the note under a shoot day's title, shoot day call sheet notes, notes in a day's schedule and notes on people's calls. Each links back to where it was taken (opening that item's form), where it's edited, and shows who wrote it: notes kept in a field (shot, shoot day, schedule, call) record who last set or changed them and when (`note_by`, `note_at`, or `title_note_by`, `title_note_at` for the note under a day's title, stamped by a database trigger). Separate from the journal | Done |
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
- **Gantt chart** (`src/components/TaskGantt.tsx`): the Calendar view's Month / Gantt
  chart switch (remembered on the device, `mp-calendar-mode`). Months and days run
  across the top and task names down the left, in sub-task tree order (sub-tasks
  indented, foldable). Each task's row has a bar from its start to its due date (its
  name inside), or a diamond on its one day; done tasks are grey and overdue ones red,
  and a line marks today. It scrolls sideways and opens at today. Names stay in view
  from `sm:` up; on phones they scroll with the chart like table columns, and each
  marker carries its name. Click a task to open its form, click a day to add tasks on
  it, and on a computer drag a bar to move the task by whole days (saved at once).
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

### Scenes and shot lists

- **Where:** a project's Scenes page (`/projects/:id/scenes`, `src/pages/project/ProjectScenes.tsx`).
  Scenes are typed in for now; script import can fill them in later. They are the shared
  piece that shoot days and call sheets will be built from.
- **Scenes table:** every field is editable in place (I/E, D/N, location and status are
  dropdowns). Pages are typed as whole pages and eighths (`1 3/8`, `3/8`, `2`) and stored
  as eighths (`scenes.pages_eighths`; `pagesLabel`/`parsePages` in `src/lib/format.ts`).
  Drag the handle at the left of a row to change the order (lattice-grid `rowReorder`,
  saved with `PUT /projects/{id}/scene-order`; paused while a sort or filter is on).
  Shots done and total shot time come from the shot list.
- **Scene form** (select a scene; changes wait for **Save scene**): the same fields, then
  the **Shot list**.
- **Shot list:** a grid of the scene's shots in shooting order (drag to reorder, `PUT
  /scenes/{id}/shot-order`). Size, angle and movement are pick-lists (`SHOT_SIZES`,
  `SHOT_ANGLES`, `SHOT_MOVEMENTS`), stored as text so a company can add its own later.
  The Done box ticks a shot done with one tap (saved at once). Select a shot to edit it
  in its form under the grid (**Save shot**).
- **Rules:** a scene number is unique in its project (any case); a location must be on
  the same project; a shot stays in its scene and takes its project. New scenes and
  shots go to the end of their list. Migration `20261125000000_scenes_shots.sql`.

### Characters

- **Where:** a project's Characters page (`/projects/:id/characters`,
  `src/pages/project/ProjectCharacters.tsx`).
- **Fields:** basics (name, cast number, type: lead / supporting / day player /
  background, age range, gender, description, traits and arc), casting (status: open /
  auditioning / offered / cast; actor, stand-in and stunt double picked from the
  project's team), look and continuity (continuity; their wardrobe, hair and makeup and
  props are elements that belong to them, listed here and in the table's Elements column).
  No photos. Every field is editable in the table and in the form (**Save character**).
- **Scenes:** one link (`scene_characters`) that both pages edit: the character form's
  Scenes section and the scene form's Characters picker. Each link has a look note
  (how they look in that scene). `scenes.characters` (text) is kept in step with the
  links by the database, so call sheets keep reading it; writing names there (the
  Scenes table's Characters cell) links those characters and adds any new ones.
- **Notes and History:** character notes (same rules as scene notes) show on Project
  notes; admins see the character's History.
- **Who plays whom** is stored once, as each character's actor. Three places show and
  change that same link: the Characters page (Actor), a shoot day's calls (Characters,
  pick one or more) and the Team page (Plays, pick one or more). Picking a character
  that someone else plays moves it to this person (`setCharactersPlayed` in
  `src/lib/casting.ts`). In tables it's a `pickMany` column (LatticeGrid's dropdown of
  tick boxes, `src/components/PickManyMenu.tsx`); in forms, `TagPicker`.
- **Call sheets:** each person's line shows the characters they play (e.g.
  "Ellie (#1)"). `shoot_day_calls.character_name` is an older typed-in name, shown only
  if nobody linked them yet; migration `20261126040000` linked the existing ones, and
  picking characters on the call clears it.
- **Rules:** names are unique per project (any case) and have no commas; cast numbers
  are unique per project. The actor, stand-in and double must be on the team; taking
  someone off the team clears them. Picking an actor marks the character cast.
  Migration `20261126020000_characters.sql`.

### Elements

- **Where:** a project's Elements page (`/projects/:id/elements`,
  `src/pages/project/ProjectElements.tsx`); admins also manage the company's element
  categories there (12 starter ones: Props, Wardrobe, Hair & makeup, Set dressing,
  Vehicles, Animals, SFX, VFX, Stunts, Extras, Sound/music, Special equipment).
- **Fields:** name, category, status (needed / sourced / ready), quantity, owner (from the
  team), character (one, optional), location (one, optional), description, notes. Every
  field is editable in the table and in the form (**Save element**).
- **Scenes:** one link (`scene_elements`) that both pages edit: the element's Scenes
  (table `pickMany` column and form section, with a note per scene) and the scene's
  Elements (table `pickMany` column, and the scene form's picker, which can add a new
  element by name). A scene's `needs` is now **Other needs**, a free note for anything
  that isn't an element.
- **Characters:** an element's character is stored on the element only; the Characters
  page lists each character's elements (read-only, linked). The old Wardrobe, Hair and
  makeup and Props text on characters became elements of that character (in all their
  scenes) and those columns were dropped (migration `20261126050000_elements.sql`).
- **Call sheets:** the project's sheet, personal links and the shared link list the
  elements of the day's scenes by category (`shoot_day_elements_json`; the project page
  calls `call_sheet_elements`), with each scene row naming its elements. On a personal
  link the reader's own character's elements come first, marked Yours.
- **Rules:** the category must be the company's, and the owner, character and location
  the project's; taking the owner off the team clears it; deleting a category, character
  or location keeps the element. Whoever added an element, or an admin, deletes it.
  Built to be filled in later by the AI script import.

### Dietary needs and team member notes

- **Dietary needs** are per project, on each person's line on the Team page
  (`project_members.dietary`, `dietary_allergy`), set by company admins or the person
  themselves (`set_dietary`). The project's call sheet has a Dietary needs box for
  catering (allergies first, in red); a personal link shows only that person's own;
  the public shared link never shows them.
- **Team member notes** (`team_notes`): dated notes about a person on a project, each with
  a type from the company's list (`team_note_types`, managed by admins in the Team
  page's Team note types section; seven starter types). Only company admins and the
  person a note is about can see them; they show on Project notes for those people.
  Migration `20261126030000_team_notes.sql`.

### Shoot days and call sheets

- **Where:** a project's Shoot days page (`/projects/:id/shoot-days`,
  `src/pages/project/ProjectShootDays.tsx`) and each day's call sheet
  (`/projects/:id/shoot-days/:dayId`, `src/pages/project/CallSheetPage.tsx`).
- **Days table:** one row per date, numbered by date ("Day 1 of 12"). Date, title,
  the title note, locations (a dropdown of tick boxes; newly ticked ones go at the end) and the four
  times are editable in place; scenes, pages, sent version and
  confirmations are read from the day. Add a day by picking its date.
- **Day form** (select a day; under the table) has three parts:
  - **Details** (held until **Save day**): date, title, the title note across the full width under them,
    locations, crew call, shooting
    call, lunch, estimated wrap, weather, sunrise, sunset and notes for the call sheet. **Locations** is an
    ordered list (add from a dropdown, move up, take off); the first is the main one,
    where the crew call is and whose address the weather uses. **Look up weather,
    sunrise and sunset** asks Open-Meteo (free, no key) for the main location's address, for
    dates up to about 16 days ahead, and fills the form (Save day stores it).
  - **Schedule:** the day's run in order (drag to reorder, `PUT /shoot-days/{id}/item-order`):
    scenes from the Scenes page, meal breaks, company moves and notes, each with an
    optional time. A scene can be on a day once; putting it on a day marks it Scheduled.
    If that scene has a location the day doesn't already list, the location is added
    at the end (the first stays the main one). Giving a scene that's already on a day
    a location adds it the same way. Taking a location off the day leaves it off.
  - **Who's called:** people on the project's team. Call, pickup, makeup, character and
    note are edited in place or in the call's form. A blank call means the crew call; a
    character makes someone cast. **Call everyone** adds the whole team.
- **Call sheet:** header (project, day N of M, date, the day's title, and the note under that title), times, each of the day's
  locations in order (numbered when there's more than one) with address (opens maps),
  parking and on-site contact, the nearest hospital of each (one line per distinct
  hospital, saying which locations it's near), weather, key contacts
  (producer, director, ADs, location manager and others found by role), scenes with
  their location, breaks and page total, cast, crew grouped by department, notes, and
  the next day's advance schedule (that day's locations, and each scene with its
  location). On the project's own sheet a location name links to the Locations page;
  personal and shared links stay plain text. People called see their own call at the top and **Confirm I got it**; opening
  the sheet marks it viewed. The sheet itself is one designed, read-only component
  (`src/components/CallSheetDocument.tsx`, styles under `.cs` in `src/styles.css`):
  a green header band with the day's title, the note under it and the crew call, the reader's own call, time tiles, location,
  weather, hospital and key-contact cards, then schedule, cast, crew, notes and the next
  day. **Print or save as PDF** lays the same design out on US Letter paper (light
  colors always; the printer's own "your call" box is left out).
- **Personal links:** everyone called has a private, unguessable link
  (`shoot_day_calls.link_token`, made by the database and never changed) to their own
  view-only page at `/sheet/{token}` (`src/pages/SheetLinkPage.tsx`). It needs no
  sign-in, sits outside the app (its own top bar with a link back to the site, Print
  and the theme switch), shows the sent sheet with their call at the top, and lets them
  confirm but change nothing else. It works only once the sheet is sent, stops working when the person
  is taken off the day. Opening it counts as viewed, and its **Confirm I got it** button
  confirms the sent version for that person (`confirm_call_sheet_link`, `POST /call-sheet-links/{token}/confirm`); that's the
  only thing the page can change. It shows names, roles, calls
  and phones but no emails. The data comes from `call_sheet_for_link(token)` (security
  definer, callable without signing in) through the public `GET /call-sheet-links/{token}`.
  The call sheet page's **Personal links** list opens, copies, emails (mailto) or texts
  (sms:) each person their own link.
- **Shared link:** one private, unguessable link per day to a view-only page of the
  whole call sheet, for anyone (`shoot_days.share_token`), at `/call-sheet/{token}`
  (`src/pages/SharedSheetPage.tsx`, same design and Print as the personal page, no
  "your call" and no Confirm). It's off until someone on the project's crew turns it on in the
  call sheet page's **Shared link** section (`share_call_sheet`, `POST /shoot-days/{id}/share`),
  which also copies, emails or texts it, makes a new link (the old one stops working)
  or turns it off. It works only once the sheet is sent and always shows the latest
  version. No emails ever; phones (people's and the on-site contact's) only when
  **Show phone numbers** is ticked (`share_phones`). Both columns change only through
  `share_call_sheet` (trigger `keep_shoot_day_share`). Data: `call_sheet_for_share(token)`
  through the public `GET /shared-call-sheets/{token}`; opening it is logged as a view
  ("shared link") but doesn't count as anyone viewing or confirming.
- **Sending:** there's no mail server yet, so **Send version N** stamps the next version
  (`publish_call_sheet`), then **Email everyone** opens the sender's email app with
  everyone called in Bcc and the sheet as text (`src/lib/callSheet.ts`), or **Copy
  message** copies it. Each call shows Waiting, Viewed, Confirmed or "Confirmed an old
  version".
- **Rules:** a day's locations and scenes must be on the same project; only people on
  the project can be called, and leaving the project takes them off its days. Versions
  change only through `publish_call_sheet()`, and viewed/confirmed only through
  `mark_call_sheet()` for the signed-in person, so neither can be faked with a direct
  update. Migration `20261125010000_shoot_days.sql`.
- **Locations of a day:** `shoot_day_locations` (day, location, `sort_order`; one row
  per location per day) replaced `shoot_days.location_id` in migration
  `20261127000000_shoot_day_locations.sql`. The API returns them as `location_ids` on
  each day (in order) and takes `location_ids` to replace the list; the call sheet and
  both link functions return `locations` (an array, main first). A scene's location is
  added to that list when the scene is scheduled, or when the scene's location changes,
  if the day doesn't already have it. Crew change them;
  everyone on the project sees them. Deleting a location takes it off its days; each
  change is logged on the day's History.
- **Cast and crew:** on each project a person is crew (a company admin, or a role
  outside the Cast department), cast (plays a character or has a Cast role; people
  with no roles count as cast) or both (`project_view_of`, `my_project_view`; the API
  returns it as `ProjectDetail.view`, and a personal link as `view`). Cast only see just
  their own call: the database returns only their own `shoot_day_calls` row, so the
  in-app call sheet and their personal link show "My call" (their call, their dietary
  needs, the schedule, location, weather and hospital; no key contacts, cast or crew
  lists; each scene they're in is highlighted, with their character marked in its cast). They read the Shoot days list but can't add, change or delete days,
  schedules or calls, send the sheet or share it (`is_project_crew` in the rules), and
  can't read `shoot_days.share_token` (column privileges, `hide_share_token()`; crew get
  it from `shoot_day_share_tokens`). Crew see the full sheet, which is the same for everyone: no "Your call" box or "You"
  markers (Confirm sits above it). People who are both get a
  **My call / Full sheet** switch (`src/components/SheetViewSwitch.tsx`), starting on My
  call and remembered on the device. Migration `20261126060000_call_sheet_cast_view.sql`.
  A column added to `shoot_days` later needs `select public.hide_share_token();` again.

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

### Activity log (audit trail)

Every add, change and delete on every table is recorded by the database itself, so
nothing is missed whichever way a change is made (the API, a database function, a
cascade, a personal call sheet link, or a fix made straight in the database). Migration
`20261126000000_audit_log.sql`.

- **Where:** `audit_log`, one row per change: when, who (`actor_id`, and their name at
  the time), `source` (app, link, system), the action, the kind of item (`table_name`),
  its id (`row_key`), a readable label kept after the item is gone, what it belongs to
  (`parent_table`/`parent_key`, e.g. a note's task), its company and project, the person
  it's about (`subject_user_id`), full `before`/`after` values and the `changed` fields.
  `tx` groups everything done in one save (e.g. a project and all it held).
- **How:** the trigger `"Audit change"` (function `audit_row()`) on every table. Its
  name sorts before Postgres's own foreign-key triggers, so a deleted item is logged
  before the things deleted with it. Saves that change nothing but `updated_at` aren't
  logged. **A new table needs the same trigger** and a branch in `audit_row()`.
- **Also logged:** sign-ins (a trigger on `auth.sessions`), and each opening of a call
  sheet: in the app (`log_call_sheet_view`, `POST /shoot-days/{id}/opened`) and through
  a personal link (`call_sheet_for_link`, which also logs as the link's person), and
  through the shared link (`call_sheet_for_share`, no person). Turning the shared link on
  or off, making a new one and showing phones are logged by `share_call_sheet`; the
  link codes themselves are never logged.
- **Who sees it:** company admins only (row-level security). Entries about a person
  that aren't tied to a company (profile changes, sign-ins) show to admins of any
  company that person is in. Nobody can add, change or delete entries directly.
- **Private journal entries** are logged in full, but their content goes to
  `audit_private`, which nobody can read through the API; the log shows only that one
  was added, changed or deleted.
- **Kept forever**, with no foreign keys, so a deleted project's log stays.
  `audit_cleanup()` lets admins remove entries for now (each use leaves its own entry,
  which is never removed). It's temporary: switch it off for good by making
  `audit_cleanup_enabled()` return false in a new migration.
- **Viewing:** `supabase/functions/api/routes/audit.ts` turns entries into readable
  changes (names for linked ids, even deleted ones). The app shows them on the company's
  Activity page (`/companies/:id/activity`), the project's Activity page, and a closed
  History section on task, scene, shoot day, location and person forms
  (`src/components/ActivityLog.tsx`, `ItemHistory.tsx`, `src/lib/activity.ts`). An open
  History reloads after every change the API accepts: `src/lib/api.ts` fires
  `DATA_CHANGED` on window after each successful non-GET call.

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
| Scene notes | `GET/POST /scenes/{id}/notes`, `PATCH/DELETE /scene-notes/{id}` |
| Project notes | `GET /projects/{id}/notes`: every note on the project, each with the item it was taken on; `GET /projects/{id}/notes/page`: one page, filtered (`sources`, `author_ids`), searched (`q`) and sorted (`order`), with `total` and `facets` |
| Task categories | `GET/POST /companies/{id}/task-categories`, `PATCH/DELETE /task-categories/{id}` |
| Scenes | `GET/POST /projects/{id}/scenes` (with shot counts and time), `PUT /projects/{id}/scene-order`, `PATCH/DELETE /scenes/{id}` |
| Shots | `GET /projects/{id}/shots`, `GET/POST /scenes/{id}/shots`, `PUT /scenes/{id}/shot-order`, `PATCH/DELETE /shots/{id}` |
| Shoot days | `GET/POST /projects/{id}/shoot-days`, `PATCH/DELETE /shoot-days/{id}`, `POST /shoot-days/{id}/items`, `PUT /shoot-days/{id}/item-order`, `PATCH/DELETE /shoot-day-items/{id}`, `GET /shoot-days/{id}/calls`, `PUT/DELETE /shoot-days/{id}/calls/{userId}`, `POST /shoot-days/{id}/calls/everyone`, `POST /shoot-days/{id}/weather` |
| Call sheets | `GET /shoot-days/{id}/call-sheet`, `POST /shoot-days/{id}/send`, `POST /shoot-days/{id}/viewed`, `POST /shoot-days/{id}/confirm`, `GET /call-sheet-links/{token}` (no sign-in), `POST /shoot-days/{id}/share`, `GET /shared-call-sheets/{token}` (no sign-in) |
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
  - Everyone on a project (and admins) sees, adds, edits and reorders its scenes and
    shots. Whoever added a scene, or an admin, deletes it; anyone on the project deletes a shot.
  - Everyone on a project (and admins) sees its shoot days and schedules. Crew (admins,
    or anyone with a role outside Cast) also see everyone's calls, edit days, schedules
    and calls, and send and share call sheets; cast only see their own call. Whoever
    added a day (if crew), or an admin, deletes it. People mark a call sheet viewed or
    confirmed only for themselves.
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
| `project_members` | People assigned to a project, with their dietary needs there |
| `tasks` | Project tasks. `parent_id` makes a sub-task; due date with optional part of day or time |
| `task_notes` | Notes on a task, with author and time |
| `scene_notes` | Notes on a scene, with author and time (same rules as task notes) |
| `task_categories`, `task_tags`, `task_tag_links` | Each company's task categories and tags, and which tags each task has |
| `scenes` | A project's scenes in order: number, set, INT/EXT, time of day, pages in eighths, synopsis, characters, other needs, location, status |
| `shots` | Each scene's shots in order: size, angle, movement, lens, equipment, estimated minutes, done, notes |
| `shoot_days` | A project's shoot days: date, title, the note under the title (and who last wrote it), crew call, shooting call, lunch, wrap, weather, sunrise, sunset, call sheet notes, call sheet version and when and by whom it was sent |
| `shoot_day_locations` | Each day's locations in order (the first is the main one) |
| `shoot_day_items` | Each day's schedule in order: a scene, meal break, company move or note, with an optional time |
| `shoot_day_calls` | Who is called on each day: call, pickup and makeup times, character, note, which version they viewed and confirmed, and their personal link token |
| `characters` | A project's characters: cast number, type, description, age range, gender, traits, casting status, actor / stand-in / stunt double, wardrobe, hair and makeup, props, continuity |
| `scene_characters` | Which characters are in which scenes, with a look note per scene |
| `element_categories` | Each company's element categories, in order |
| `elements` | A project's breakdown elements: category, status, owner, quantity, character, location, description, notes |
| `scene_elements` | Which elements are in which scenes, with a note per scene |
| `character_notes` | Notes on a character (same rules as scene notes) |
| `team_note_types`, `team_notes` | Each company's team note types, and notes about people on a project (admins and the person only) |
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
| Hosting | Netlify for the web app (`netlify.toml`); Supabase Edge Functions for the API | Free, deploys on every push to `main`, and a Deploy Preview for every pull request |

## Styling: Tailwind CSS, mobile first

Every screen is designed for a phone first, then enhanced for larger screens.

- **Write the phone layout first.** Unprefixed Tailwind classes are the phone
  styles. Add `sm:` (640px), `md:` (768px) and `lg:` (1024px) only to adapt
  for bigger screens. For example, `flex flex-col gap-3 md:flex-row` stacks on a
  phone and sits side by side on a laptop.
- **Project pages have a left nav.** A project's areas (Overview, Tasks, Scenes, Shoot days,
  Locations, Team, Project notes, Journal) are separate pages under `/projects/:id`, framed by
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
- **Items link to their home page (standard).** Every item has one home: the page
  where it's edited (a scene on Scenes, a location on Locations, a task on Tasks, a
  person on the project's Team or the company's People, a category or tag on Task
  categories and tags). Anywhere else it's shown (a scene on a shoot day or call
  sheet, a location on a task, scene or shoot day, a person on a call sheet or task,
  a task on the Overview), it links there, and the link opens the home page with the
  item selected, its row highlighted and its form open, as after adding it.
  Paths come from `itemPath` in `src/lib/links.ts` (`?open=<id>`); each home page
  reads that with `useOpenFromLink` from `src/lib/reveal.ts`. In tables, read-only
  cells link with `gridLinkHtml` / `gridLinkList`; a pick-list cell keeps opening its
  list on a click and gets a small open arrow (`gridDropdown(html, { to, title })`).
  In forms, an `OpenLink` (`src/components/OpenLink.tsx`) under a picker opens what's
  picked. The project's call sheet page links its scenes, people, location and next
  day (`CallSheetDocument`'s `links`); a personal call sheet link (`/sheet/<token>`)
  is outside the signed-in app, so it stays plain text. Unsaved form changes are
  asked about before leaving, as with any link.
- **"Back to …" after an item link (standard).** Following any item link remembers
  where it was followed from, and the page it opens shows "‹ Back to Scene 3" above
  its heading (and in the pinned bar under the header once that scrolls away). Going
  back, by that link or the browser's Back, returns to the same page with the same
  item's form open; each step keeps the one before, so shoot day → scene → character
  walks back to the scene and then the day. It's all in one place, so every item link
  gets it with nothing to add: `src/lib/backLink.ts` (`linkOut`, `goBack`),
  `LinkOutTracker` and `BackLink` (`src/components/BackLink.tsx`, mounted in `App.tsx`)
  and the table links in `LatticeGrid`. An item link is any in-app link with
  `?open=`/`?person=` or to a call sheet; plain page navigation (the left nav,
  breadcrumbs) doesn't set one. Where it came from lives in the browser's history
  state, so it survives a reload but not a copied link. The origin is named by the
  outermost open item form, marked `data-form-for="<id>"` and `data-form-label="Scene 3"`
  (the form a link sits in, else the page's open one); with no form open it's the
  page (`data-page-label`, else its name from the address, e.g. "Shoot days").
  `useOpenFromLink` reopens the form from the history state (`reopen`) and keeps the
  rest of that state.
- **Dropdown filters for fixed values (standard).** In every table, a column whose
  values come from a fixed set (person assigned, status, priority, category, location,
  department, admin, roles, tags…) filters with a dropdown of tick boxes and counts.
  List columns (roles, tags) list each name on its own (`filterSplit`, a local
  lattice-grid option). Free text, dates and numbers keep the typed filter. Task names are typed too: the task tree's Task column has a filter box (a match keeps its parent tasks showing), the Quick filter searches task names, and Sub-task of filters by typing.
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
- **Start and due dates.** A task can have a start date (with a part of the day or an
  exact time) as well as a due date (migration `20261124050000_task_start.sql`; the
  due date can't be before the start). On the calendar (`TaskCalendar.tsx`) a task with
  both shows as a bar across every day from start to due; dragging any part of it
  moves both dates by the same number of days. The day list says "Starts…", "Day 2
  of 4" or "Due…".
- **Task summaries.** The task table has tick boxes (lattice-grid `selection: 'multiple'`;
  ticking a parent ticks its sub-tasks). Ticked tasks show a bar to **Email summary**
  (opens the person's own email app via `mailto:`, optionally addressed to the people
  assigned) or **Copy summary** to paste anywhere (`src/lib/taskSummary.ts`,
  `src/components/TaskSummaryBar.tsx`). Like invites, no email server is involved.
- **Tables on phones.** Under 640px `LatticeGrid.tsx` unpins every column (including the
  tree, group and tick-box columns), so the whole row scrolls sideways together.
- **Choosing columns, and a table's view.** Every table has a **Columns** button above it
  to tick which columns show. `LatticeGrid` needs a `stateId` (e.g. `"project.tasks"`)
  and keeps the person's view of that table (columns shown, widths, order and sort) in
  sessionStorage for the browser session (`src/lib/gridView.ts`), so it holds across
  pages and reloads. Changes through the grid's own menu (Hide column, Autosize, Reset
  columns) are kept too. Filters aren't kept. The tree / task-name column always shows.
- **Paging (only where data keeps growing).** Michael's choice: tables don't page. They
  load all their rows and scroll, with filters, sort and quick search over every row.
  Only tables that keep growing without limit page, and the server does it: the activity
  log and Project notes. The API takes `offset`/`limit`, filters, a search (`q`) and the
  order, and returns one page with `total` (and, where useful, `facets` with counts for
  the dropdown filters). The page uses `useServerPages` (`src/lib/serverPages.ts`) and
  passes its `paging` to `LatticeGrid`, which then turns off its own filtering, sends
  filter, sort and search changes to the hook, and shows `ServerPager` (25/50/100/250
  rows, 50 to start, kept with the table's view; shown once 25 or more rows match (the filters included); on
  phones two rows: rows per page and the count, then the page buttons). Give each set filter its choices with
  the column's `setValues` (only one page is loaded) and turn off filters and sorts the
  API can't do (`filter: false`, `sortable: false`). Ask Michael before paging any
  other table. (Local lattice-grid patches for its own pager stay in place, off by
  default: page by top-level row in tree mode, reveal turns to the row's page.)
- **Phones and emails.** Phone numbers are stored as `###-###-####` (10 digits, or 11
  starting with 1), or `+` and digits for other countries; anything else is refused.
  Emails need a full address (`name@example.com`). The database enforces this
  (`format_phone`, `is_valid_email`/`check_email`, migration `20261124030000`), and
  `src/lib/contact.ts` applies the same rules in the app: phone fields tidy themselves
  when you leave them, and Save/Add says what's wrong before sending.

## Repository layout

```
src/                         React app
  components/                LatticeGrid wrapper, TaskTree (grid + panel), TaskCalendar, TaskGantt, Notes (task and scene notes),
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
netlify.toml                 Netlify build, environment and SPA routing
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
| Web app | https://movie-prod.netlify.app/ (rebuilt on every push to `main`) |
| PR previews | `https://deploy-preview-<number>--movie-prod.netlify.app/` (one per pull request, linked on the PR) |
| API | https://qixblelhruxdzxfaeamz.supabase.co/functions/v1/api (Swagger at [/docs](https://qixblelhruxdzxfaeamz.supabase.co/functions/v1/api/docs)) |
| Database | Supabase project `qixblelhruxdzxfaeamz` |

## Roadmap

1. Foundation: schema, security rules, sign-in (done)
2. Companies, projects and people (done)
3. Roles: manage custom roles per company (done)
4. Tasks and sub-tasks in a lattice-grid tree, with due times, notes, categories and tags (done)
5. Scenes and shot lists, shoot days and call sheets (done)
6. Project journal with private, shared and public entries

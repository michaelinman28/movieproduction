# Working on this repository

Read ARCHITECTURE.md first. These are the standards every change follows.

## UI standards
- **Mobile first** with Tailwind: unprefixed classes are the phone layout; add `sm:`/`md:`/`lg:` for larger screens. No sideways page scroll at 360px; tap targets of at least 44px.
- **Theme tokens only** (`bg-surface`, `text-muted`, `border-line`, `bg-accent`…) from `src/styles.css`; green accent; light and dark mode.
- **Every section is collapsible.** Wrap each titled section below the page heading, and each titled part of a side panel, in `<Section id="page.part" title="…">` from `src/components/Section.tsx` (`level="h4"` in panels; optional `summary`). Never use a bare `<h2>` section. The page heading (h1) is not collapsible.
- **One pinned action button.** Mark a section's main action button with `data-pin` and an open form's Save with `data-pin="2"`; `PinnedAction` (in `App.tsx`) pins one of them under the header while scrolling. Sections (`Section`) and side panels (`<aside data-pin-scope>`) are the scopes.
- **Tables use lattice-grid** through `src/components/LatticeGrid.tsx`. Columns edited by picking from a list use `editor: 'select'` and render with `gridDropdown` (caret; the wrapper opens it on one click and saves on pick); see `TaskTree.tsx`.
- **Every field is editable in both the table and the form.** Anything a person may change is editable in place in its table and in the page's form or side panel; adding a field means adding it to both. Lists of names (roles, tags) are comma-separated in the table and picked in the panel. If a row's name is editable, give the link its own Open column. Only fields owned by another record (a person's name, email and phone) stay read-only.

## Data and API
- The app reads and writes data only through the API client in `src/lib/api.ts`.
- API routes live in `supabase/functions/api/routes/`, with zod schemas in `schemas.ts`; run `npm run api:spec` after changing them.
- Database changes are a new numbered file in `supabase/migrations` (never edit an applied one), with tests in `tests/schema.test.mjs`. Security rules live in the database (row-level security).

## Checks
`npm run typecheck`, `npm run test:db`, `npm run build`.

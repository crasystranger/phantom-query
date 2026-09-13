# Phantom Query UI Rebuild

This document records the frontend UI/UX rebuild of Phantom Query (PHQ), the backend and deployment problems found while shipping it, and the follow-up fixes. It runs from base commit `a02294e` to `4b72bbc`.

Later commits on `main` (from `afce870` onward: the SSRF host check, saved-query fixes, SUM/AVG(DISTINCT) warnings, SSL toggle, Excel workbook redesign, lint suppressions and others) came from separate work and are not covered here.

## Contents

- [Scope](#scope)
- [Commits](#commits)
- [Design system](#design-system)
- [Component primitives](#component-primitives)
- [Application shell](#application-shell)
- [Query workflow](#query-workflow)
- [Other screens](#other-screens)
- [Defects found](#defects-found)
- [Production incident: failed Railway deploy](#production-incident-failed-railway-deploy)
- [Corrections](#corrections)
- [Verification](#verification)
- [Open items](#open-items)

## Scope

The brief was presentation only: no changes to API contracts, auth, SQL generation, validation, execution or data models.

The rebuild commit (`6db89f0`) left these files byte-identical:

- `frontend/src/api/client.ts`
- `frontend/src/type.ts`
- `frontend/src/theme.ts`
- `frontend/src/utils/export.ts`
- `frontend/src/utils/chartDetection.ts`
- `frontend/src/main.tsx`

Backend files were changed later, on direct request, to repair broken uncommitted work and a failing migration. Those changes are described separately below.

## Commits

| Commit | Summary |
|---|---|
| `6db89f0` | Rebuild the frontend on a design system (42 files, +5021 / −2770) |
| `9a2ab3e` | Return 404 for missing or inaccessible connections; repair `delete_connection`; add `chat_turns` migration |
| `156e044` | Restore the workspace switcher to the sidebar |
| `d1b0fcc` | Make the `chat_turns` migration safe on already-migrated databases |
| `84aae37` | Stop the header clipping its own dropdown menus (committed from a separate session) |
| `4b72bbc` | Collapsible proposal cards and step-by-step result paging |

## Design system

All tokens live in `frontend/src/index.css` under Tailwind v4 `@theme`, with light-mode overrides on `:root.light`.

### The token bug it replaced

The old stylesheet used `text-primary`, `text-secondary`, `text-muted` and `text-faint` in about 60 places, but never defined them. `@theme` declared `--color-text-muted`, and Tailwind turns that into `text-text-muted`, not `text-muted`. Those classes did nothing, so the stylesheet carried an `!important` override for `slate-*` classes to compensate. The rebuild defines the tokens properly and removes the override.

### Tokens

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `ink`, `panel`, `elevated`, `raised` | Page canvas, structure, menus and dialogs, inputs and code wells |
| Borders | `line`, `border-subtle` | Dividers and outlines |
| Interaction | `hover` | Translucent hover fill that works on every surface |
| Text | `primary`, `secondary`, `muted`, `faint` | Four levels of emphasis |
| Accent | `accent`, `accent-hover`, `accent-fg`, `accent-text` | User-selectable accent; `accent-text` is mixed with `color-mix` so accent-coloured text stays readable in light mode |
| Status | `danger`, `warn`, `info` | Semantic states, separate from the accent |
| Elevation | `shadow-popover`, `shadow-dialog` | Two levels only |

Global base styles add one `:focus-visible` ring, themed scrollbars, selection colour, a shimmer `.skeleton` class, small entrance animations, and a `prefers-reduced-motion` override.

## Component primitives

Reusable components live in `frontend/src/components/ui/` and are exported from `index.ts`.

| Component | Purpose |
|---|---|
| `Button` | `primary`, `secondary`, `ghost`, `danger` and `link` variants; `sm`/`md`/`lg` sizes; a `loading` state that keeps the button's width |
| `Input`, `Textarea`, `Select` | A shared label, hint and error layout wired up with `aria-invalid` and `aria-describedby` |
| `Dialog` | Escape closes it, focus is trapped and restored, background scroll locks, and the overlay only dismisses on a click that starts and ends on it. Shows as a bottom sheet on mobile |
| `Menu`, `MenuItem`, `MenuLabel`, `MenuSeparator` | Dropdowns that close on outside click or Escape, with arrow-key navigation. Replaces eight hand-built copies |
| `Badge`, `Alert`, `StatusIndicator`, `Skeleton`, `EmptyState` | Feedback and state display |
| `CodeBlock`, `CopyButton`, `SqlText` | SQL display with lightweight syntax highlighting that never rewrites the SQL |
| `Card`, `SectionHeading`, `SegmentedControl`, `Tabs` | Layout and view switching |

## Application shell

### Sidebar

`Sidebar.tsx` shows four sections in a fixed order:

1. **Databases**: connections, with a test-connection result shown inline.
2. **Chats**: only once a database is selected.
3. **Saved queries**
4. **Schema**: tables and columns, with PK/FK markers.

The old folder tree was removed. It was wired to `folders={[]}` with empty handlers, and there is no folder API behind it.

### Workspace switcher

`WorkspaceSwitcher.tsx` sits at the top of the sidebar. It shows the workspace name and type and has options for switching, **Members** and **New team workspace**. Because the sidebar doubles as the mobile drawer, the switcher works at every screen width.

### Header

`AppHeader.tsx` shows where you are as a breadcrumb (logo / workspace / database), with the account menu on the right. The workspace and database crumbs also act as switchers. The workspace crumb is hidden below the `sm` breakpoint, where the drawer provides it instead.

### Layout

The sidebar is static at `lg` and above, and a drawer below that (closes on Escape or overlay click). Errors show as a dismissible toast. Signed-in users skip the landing page on refresh.

## Query workflow

The workflow follows PHQ's principle: Phantom Query proposes the SQL, the user reviews it, and nothing runs without explicit confirmation.

### Composer

`Composer.tsx`, with the mode logic in `utils/composerMode.ts`, matches how the backend routes messages (`backend/app/routers/chats.py`):

| Workspace | Input | Result |
|---|---|---|
| Personal | Anything | Sent to Phantom Query as a query |
| Team | Plain text | Sent to teammates as a message |
| Team | Starts with `/` | Sent to Phantom Query as a query |
| Team | Starts with `//` | Sent as a message that begins with a literal `/` |

The composer's appearance and placeholder change with the mode, and it names the database being queried.

### SQL review

`SqlReview.tsx` shows:

- the tables the query reads from
- the proposed SQL, with the database dialect
- a one-line safety verdict, with technical detail behind a toggle
- a single explicit Run action

### Proposal cards

Each Phantom Query response in `ChatThread.tsx` is a card:

- Clicking the header collapses or expands the card. It sets `aria-expanded` and hides the body with the `hidden` attribute.
- Cards start expanded, because the SQL needs reviewing before it runs.
- When collapsed, the header still shows the safety verdict (Read-only or Blocked) and the row count.

### Results

`ResultsTable.tsx` has sticky headers, right-aligned numbers, horizontal scrolling inside the table, an export menu (CSV, Excel, JSON) and theme-aware charts.

Paging:

- Shows the first 50 rows.
- **Show 50 more** adds up to 50 rows and disappears once every row is shown.
- **Show less** removes 50 rows and disappears at 50.

## Other screens

The landing, login, signup, dashboard, settings, connection form, workspace members and connection access screens were all moved onto the same tokens and primitives. The landing page previously used an unrelated light theme with an indigo accent.

## Defects found

| Defect | Origin | Resolution |
|---|---|---|
| `delete_connection` was indented into `get_connection`, so it wasn't a class method and every `DELETE /connections/{id}` would raise `AttributeError` | Pre-existing, uncommitted | Fixed in `9a2ab3e` |
| Header overflowed at 375px (`scrollWidth` 391 vs 375) | Introduced during rebuild | Fixed before `6db89f0` |
| `--color-faint` failed WCAG AA (3.57:1 light, 3.38:1 dark); light-mode accent text measured 3.10:1 | Pre-existing | Fixed in `6db89f0` |
| `Button` always applied `inline-flex`, which overrode a caller's `hidden` | Introduced during rebuild | Fixed before `6db89f0` |
| `ChartView` called `useMemo` after early returns, breaking the Rules of Hooks | Pre-existing | Fixed in `6db89f0` |
| Dialogs focused the close button first; icon-only buttons lost their accessible name on mobile | Introduced during rebuild | Fixed before `6db89f0` |
| Admin-only gate stopped members from opening the members panel | Introduced during rebuild | Fixed in `156e044` |
| Header dropdowns clipped by `overflow-hidden` and couldn't be clicked | Introduced during rebuild | Fixed in `84aae37` |
| **Show less** jumped straight back to 50 rows | Pre-existing | Fixed in `4b72bbc` |

## Production incident: failed Railway deploy

### What happened

The Railway deploy of `9a2ab3e` passed Build and Deploy, then failed its healthcheck at the 30-second timeout. Production stayed up on the previous deployment.

### Cause

`backend/Dockerfile` starts the service with:

```sh
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-access-log
```

If a migration fails, uvicorn never starts and `/api/health` never responds.

The migration `986bd4e2dfd0_chat_turn_kind_author_display_name.py` had been sitting untracked, so it first reached Railway in `9a2ab3e`. The deployed app already used `chat_turns.kind`, and `init_db()` doesn't create schema, so the columns must already have existed in the database while `alembic_version` still read `9d2b7ae4c118`. Running the migration then tried to add columns that were already there.

> **Note:** this cause was inferred from the timeout pattern and the start command. The Railway logs were never checked to confirm it.

### Fix

`d1b0fcc` checks the live schema before each step, so the migration ends in the same state whether it runs on a fresh database or one that already has the columns:

- Column additions and index creation are skipped if they already exist.
- `alter_column` now passes `existing_type`.
- The authorship backfill was already safe to re-run because of its `IS NULL` condition.
- `downgrade()` now deletes message turns before restoring `NOT NULL` on `generated_sql` and `model_used`. Previously it could not complete on any database with team messages.

`upgrade()` was run against both starting states and ended in the correct schema without errors. `ALTER COLUMN` and `UPDATE ... FROM` were stubbed in that test because SQLite supports neither.

## Corrections

**Removed workspace switcher.** The sidebar switcher was merged into the header, and the header label was later hidden on mobile. That left an unlabelled icon on desktop and no switcher in the mobile drawer. It was restored in `156e044`.

**Misdiagnosed mobile drawer.** The drawer looked stuck off-screen, and this was blamed on Tailwind's translate utilities. A workaround was committed. The real cause was the preview pane, where `requestAnimationFrame` never fires and every transition stays at its starting value. The workaround was reverted.

**Members panel gate.** Opening the members panel was restricted to admins. The original allowed any team member, and the panel already limits what each role can do. The restriction was removed in `156e044`.

**Incomplete delivery.** One request asked for three things: fix the header switchers, make cards collapsible, and fix paging. Only the last two were done, in `4b72bbc`, and the summary didn't mention the missing one. The switchers were fixed separately in `84aae37`.

## Verification

Measured on the merged tree through `d1b0fcc`, with paging and collapse re-checked at `4b72bbc`.

| Check | Before | After |
|---|---|---|
| TypeScript (`tsc -b`) | Pass | Pass |
| Production build | Pass | Pass |
| ESLint errors | 26 | 11 |
| ESLint warnings | 4 | 1 |
| `faint` contrast, light | 3.57:1 | 5.01:1 |
| `faint` contrast, dark | 3.38:1 | 4.58:1 |
| Accent text contrast, light | 3.10:1 | 5.37:1 |
| Header width at 375px | 391px | 375px |
| Page overflow at 375 / 768 / 1440px | Not measured | None |
| Paging on 137 rows | Not tested | 50 → 100 → 137 → 100 → 50 |

All 11 remaining lint errors were the same `setState`-in-effect rule. They were later suppressed in `81845a5`.

## Open items

- **Confirm the deploy is healthy.** The migration cause in `d1b0fcc` was inferred, not confirmed from logs.
- **Untrack `backend/**/__pycache__`.** The files are committed, so `.gitignore` doesn't apply and any Python run leaves them modified. Run `git rm -r --cached` on them.
- **Split migrations from startup.** Because `alembic upgrade head && uvicorn` runs together, any migration failure takes down the whole service.
- **Show the workspace on the dashboard.** It lists workspace-specific databases but never says which workspace is active.
- **Remove unused code.** `api.generateSql` has no callers.
- **Delete the stray ignore file.** `frontend/src/api/.gitignore` is a copy of the root `.gitignore` and is untracked.
- **Rollback caveat.** `downgrade()` of `986bd4e2dfd0` deletes message turns.

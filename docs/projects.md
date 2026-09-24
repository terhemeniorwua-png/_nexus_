# Nexus Projects (Phase 8)

Projects are the unit of tracked work in Nexus. A project lives in a workspace, is owned by a team, has a single manager, and its members decide who can see and change it. This phase adds a **global, cross-workspace project API** (`/api/projects`) plus global project pages (`/projects`, `/projects/new`, `/projects/[projectId]`) so users can manage every project they can reach in one place. The workspace-scoped routes from Phase 6 (`/api/workspaces/:workspaceId/projects`) remain and share the same controllers/services.

## Data model

- `projects` — `{ workspaceId, teamId, name, description, status, priority, managerId, startDate, dueDate, createdBy }` (`docs/database.md`).
  - `status`: `PLANNING` (default) • `ACTIVE` • `ON_HOLD` • `COMPLETED` • `ARCHIVED`.
  - `priority`: `LOW` • `MEDIUM` (default) • `HIGH` • `URGENT`.
- A project's **workspace is always derived from its team** — the client-supplied `workspaceId` is ignored on create; `teamId` must belong to that workspace, and a project cannot move to another workspace via update (cross-workspace team → **400**).
- The **manager must be an eligible member of the project's workspace** — the workspace owner, or a workspace member with role `Admin` or `Member`. `Viewer`s can never manage. Cross-workspace manager → **400**.

## Permissions

Projects use the Phase 6 project-role matrix exactly (`docs/authorization.md` §2.2):

| Action | Gate | Who |
| --- | --- | --- |
| View a project (global detail) | `view_project` | Owner*, Admin*, PM, Member, Collaborator, Viewer |
| Global list (`/api/projects`) | authenticated | Only projects the user can access (memberships, managed, or owner/admin derivation) |
| Create | `create_project` | Owner, Admin, Member (workspace-wide) |
| Update (fields, status) | `update_project` | Owner*, Admin*, PM |
| Delete | `delete_project` | Owner*, Admin* only |

\* `WORKSPACE_OWNER` / `ADMIN` are derived project roles. A user holding an explicit `PROJECT_MANAGER` row on a project is treated as `PROJECT_MANAGER` for it (membership row takes precedence), so a creator who is also the workspace owner still needs an owner/admin role **without** an explicit row to delete it — matching the documented Phase 6 precedence rules.

## Creating a project

`POST /api/projects` with `{ name, description, teamId, managerId, startDate, dueDate, priority }`:

- The workspace is resolved from `teamId`; `body.workspaceId` is **never trusted**.
- `teamId` and `managerId` are required (400 when missing).
- On success the **manager and the creator each receive a `PROJECT_MANAGER` membership row** (the creator keeps manage rights even if they chose a different manager).

## Updating a project

`PATCH /api/projects/:projectId` accepts any subset of the fields. Validation:

- `status` / `priority` must be valid enums (400 with the exact message).
- Dates must parse (`Invalid start date` / `Invalid due date`); `dueDate` cannot precede `startDate`.
- `name` must be non-empty (≤140 chars); `description` ≤ 2000 chars.
- A **team change** must stay inside the project's workspace (400 otherwise).
- A **manager handoff** promotes the new manager to `PROJECT_MANAGER` and demotes the old manager's `PROJECT_MANAGER` row to `MEMBER`.
- Status transitions (including `COMPLETED` / `ARCHIVED`) are gated by `update_project`.

Delete removes the project plus its tasks, board columns, project memberships, and project resources (existing Phase 6 cascade).

## API

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/projects` | Accessible projects across all the user's workspaces, enriched with team/workspace/manager + task/member stats. `?status=`, `?priority=`, `?teamId=` filters apply on top of the authorized set (invalid values → 400). |
| `GET` | `/api/projects/meta` | Create form data: workspaces the user may create in (owner/`Admin`/`Member`) → teams → eligible managers. A `Viewer` gets `[]`. |
| `POST` | `/api/projects` | Create (see above). |
| `GET` | `/api/projects/:projectId` | Detail enriched with team, workspace, manager, and the full member list with roles. 403 when the user has no role on the project. |
| `PATCH` | `/api/projects/:projectId` | Update + validation (see above). |
| `DELETE` | `/api/projects/:projectId` | Hard delete + cascade (owner/admin only). |

## Frontend

- `app/projects` — grid of accessible projects with workspace chip, status/priority badges, manager + team, due date, member count, and a task-progress bar. **Status / priority filters** drive `?status=` / `?priority=` query params (client-side, server-authorized). Empty states for "no projects" and "no filter matches", plus a **New project** action only when `/projects/meta` returns a create-eligible workspace.
- `app/projects/new` — create form backed by `/projects/meta`: team select grouped by workspace, manager select filtered to the chosen team's workspace (owner/admin/member only), start/due dates, priority.
- `app/projects/[projectId]` — detail with stat cards (members/tasks/done/due date), members list (manager pinned first with role badges), a Tasks section ("No tasks have been created yet." + **Open board** link to `/workspaces/[workspaceId]/projects/[projectId]/board`), an **Edit** modal (status field included) gated to `update_project`, and a **Delete** confirmation modal gated to `delete_project`. 403 renders a "Private project" state; unknown ids render a "Project not found" state.
- Shared pieces: `components/workspace/ProjectForm.jsx` (create + edit, resets per open), `components/workspace/ProjectBadge.jsx` (status/priority pills), `PROJECT_STATUS_META` / `PROJECT_PRIORITY_META` in `lib/workspaceApi.js`, and a **Projects** link in `GlobalNav`.

## API payloads

Project JSON returned by the global routes includes: `id`, `name`, `description`, `status`, `priority`, `startDate`, `dueDate`, `createdAt`/`updatedAt`, `role` (the requester's project role), `team: { id, name, workspaceId }`, `manager: { id, name, avatar }`, `workspace: { id, name }`, `stats: { taskCount, doneCount, memberCount }`, and (detail only) `members: [{ id, role, joinedAt, user: { id, name, email, avatar } }]`.

Dates serialize as ISO strings; the API never returns raw Mongo `_id`s (each object uses `id`).

## Tests & seed

- `backend/test/projects.test.js` — 39 tests against `nexus_projects_test`. Fixtures: workspace A (ada owner, alan admin, linus/margaret members, barbara viewer; engineering/research teams; "Nexus Platform Build" with alan PM + member rows) and workspace B (outsider owner, grace member + PM on "Other Project", ada also member). Covers every create/update validation branch, authorized list/filtering, team-filter authorization, id-manipulation isolation, manager handoff, the delete matrix, delete cascade, and `/meta`.
- Full suite: **88 passing** (`cd backend && npm test`).
- `npm run db:seed` — now 7 projects / 13 project memberships (see `docs/authorization.md` §6 for the Phase 8 personas).
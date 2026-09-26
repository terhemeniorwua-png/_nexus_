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
| `GET` | `/api/projects` | Accessible projects across all the user's workspaces, enriched with team/workspace/manager + task/member stats **and the server-computed `progress`**. `?status=`, `?priority=`, `?teamId=` filters apply on top of the authorized set (invalid values → 400). |
| `GET` | `/api/projects/meta` | Create form data: workspaces the user may create in (owner/`Admin`/`Member`) → teams → eligible managers. A `Viewer` gets `[]`. |
| `POST` | `/api/projects` | Create (see above). |
| `GET` | `/api/projects/:projectId` | Detail enriched with team, workspace, manager, the full member list with roles, and the same `stats` block (including `progress`). 403 when the user has no role on the project. |
| `PATCH` | `/api/projects/:projectId` | Update + validation (see above). |
| `DELETE` | `/api/projects/:projectId` | Hard delete + cascade (owner/admin only). |
| `GET` | `/api/projects/:projectId/members` | List project members with roles (`view_project_members`). |
| `POST` | `/api/projects/:projectId/members` | Add a member (`invite_project_member`). Invited user must belong to the project's workspace (else **400**); duplicate → **409**; invalid role → **400**; unknown user → **404**. |
| `PATCH` | `/api/projects/:projectId/members/:userId` | Change a member's role (`invite_project_member`; only owners/admins may assign `PROJECT_MANAGER`, self-promotion → **403**). |
| `DELETE` | `/api/projects/:projectId/members/:userId` | Remove a member (`remove_project_member`; cannot remove yourself or the manager without owner/admin). |

## Project members

Member access is **explicit only**: a project role comes from a `projectmembers` row (`PROJECT_MANAGER` / `MEMBER` / `VIEWER` / `COLLABORATOR`), not from workspace or team membership. Being on the project's team grants nothing by itself; each project is isolated, so access to one project never implies another.

- **Same-workspace rule**: every added member must already belong to the project's workspace (a `WorkspaceMember` row, or the workspace owner) → otherwise **400** `"User does not belong to this workspace"`.
- **Cross-team collaboration**: the added member does *not* need to be on the project's team — they just have to share the workspace. Example from the seed: `ada` and `margaret` are `COLLABORATOR` on projects owned by other teams (`docs/authorization.md` §6).
- **Granting `PROJECT_MANAGER`**: only workspace owners/admins (`canGrantManagerRole`). A project manager can add/remove members and change any non-manager role, but cannot assign or self-promote to manager.
- Removing a member revokes access immediately (the 403 is enforced server-side on the next request).

Frontend: the project detail page's **Members** panel offers an **Add** button (workspace-member select + role picker), an inline role **select** per member (manager label is pinned for the manager row), and a **remove** action with a confirmation modal. The controls appear only for roles holding `invite_project_member` (`WORKSPACE_OWNER`, `ADMIN`, `PROJECT_MANAGER`); the backend re-checks every request, so the UI gating is cosmetic only. Both the workspace-scoped (`/api/workspaces/:wid/projects/:pid/members`) and global (`/api/projects/:pid/members`) routes share the same controllers.

## Frontend

- `app/projects` — grid of accessible projects with workspace chip, status/priority badges, manager + team, due date, member count, and the server-provided `stats.progress` bar (`ProgressBar`; the page no longer counts done/total tasks itself). **Status / priority filters** drive `?status=` / `?priority=` query params (client-side, server-authorized). Empty states for "no projects" and "no filter matches", plus a **New project** action only when `/projects/meta` returns a create-eligible workspace.
- `app/projects/new` — create form backed by `/projects/meta`: team select grouped by workspace, manager select filtered to the chosen team's workspace (owner/admin/member only), start/due dates, priority.
- `app/projects/[projectId]` — detail with stat cards (members/tasks/done/due date) plus the shared `ProgressBar` for `stats.progress`, members list (manager pinned first with role badges), **member management** (Add modal, inline role select, remove confirmation — see "Project members" above), a Tasks section ("No tasks have been created yet." + **All tasks** link into the Phase-10 task list + **Open board** link to `/workspaces/[workspaceId]/projects/[projectId]/board`), an **Edit** modal (status field included) gated to `update_project`, and a **Delete** confirmation modal gated to `delete_project`. 403 renders a "Private project" state; unknown ids render a "Project not found" state.
- `app/projects/[projectId]/tasks` — task list (Phase 10 workflow, Phase 11 server progress): search + priority/assignee filters, status tabs over the full workflow (labels from `TASK_STATUS_META`, zero-count tabs hidden), rows with status/priority badges, due-date + overdue chip, the task's server `progress` bar, and assignee avatar; a **New task** modal (`TaskFormModal`) gated to managers/owners/admins; rows link to the task detail.
- `app/projects/[projectId]/tasks/[taskId]` — task detail (Phase 10 workflow, Phase 11 weights, Phase 12 deliverable): description, tags, meta cards (due/tags/progress/assignee), **Move task** action buttons driven by the workflow transitions (worker steps assignee-only, reviewer steps manager-only, "waiting on assignee" hint), subtasks list with the shared `ProgressBar`, per-subtask weight chips, a weight breakdown, and a `SubtaskComposer` weight field with live remaining-weight feedback, plus add/toggle/delete, Edit (`TaskFormModal`), Delete (confirm modal), an "Open board" link, and the `DeliverablePanel` (upload, version history, review decisions — see `docs/deliverables.md`).
- `app/dashboard` — a **Project progress** section listing the workspace projects with their `stats.progress` bars, from `/api/me/overview` (no extra client math).
- Shared pieces: `components/workspace/ProjectForm.jsx` (create + edit, resets per open), `components/workspace/ProjectBadge.jsx` (status/priority pills), `components/workspace/TaskFormModal.jsx` (task create/edit), `components/workspace/ProgressBar.jsx` (the only progress renderer), `PROJECT_STATUS_META` / `PROJECT_PRIORITY_META` / `TASK_STATUS_META` / `TASK_PRIORITY_META` in `lib/workspaceApi.js`, and a **Projects** link in `GlobalNav`.

## API payloads

Project JSON returned by the global routes includes: `id`, `name`, `description`, `status`, `priority`, `startDate`, `dueDate`, `createdAt`/`updatedAt`, `role` (the requester's project role), `team: { id, name, workspaceId }`, `manager: { id, name, avatar }`, `workspace: { id, name }`, `stats: { taskCount, doneCount, inProgressCount, underReviewCount, submittedCount, memberCount, progress }`, and (detail only) `members: [{ id, role, joinedAt, user: { id, name, email, avatar } }]`.

`stats` is assembled by `computeProjectStats` in `backend/src/services/project.service.js` — one task query and one membership query for the whole batch, so listing 20 projects does not fan out into 20 round trips. The same function feeds the dashboard (`/api/me/overview`) and the project detail route, which is why those three surfaces can never disagree.

### Project progress

`stats.progress` is a **derived** integer `0–100` (Phase 11), never stored on the project document:

- It is the unweighted average of the project's task progress, `Math.round`ed. Tasks count equally regardless of size or weight allocation.
- An empty project reports `0`, not `null` — the same rule tasks follow, so consumers never branch on a missing value.
- `progress` and `status` are independent: reaching `100%` does not mark the project `COMPLETED`, and a `COMPLETED` project may legitimately sit at `0%` if it was closed with nothing in it.
- Because it is computed from the same service as task progress, the dashboard, the projects grid, the project detail header, and the task list always agree.

Task-level progress (weighted subtasks, the `APPROVED` precondition, the `weights` payload) is documented in `docs/tasks.md` §3.1. The deliverable lifecycle that drives a task's status (upload → review → changes → new version → approval) is documented in `docs/deliverables.md`.

Dates serialize as ISO strings; the API never returns raw Mongo `_id`s (each object uses `id`).

## Tests & seed

- `backend/test/projects.test.js` — 39 tests against `nexus_projects_test`. Fixtures: workspace A (ada owner, alan admin, linus/margaret members, barbara viewer; engineering/research teams; "Nexus Platform Build" with alan PM + member rows) and workspace B (outsider owner, grace member + PM on "Other Project", ada also member). Covers every create/update validation branch, authorized list/filtering, team-filter authorization, id-manipulation isolation, manager handoff, the delete matrix, delete cascade, and `/meta`.
- `backend/test/projectAccess.test.js` — 12 tests against `nexus_projectaccess_test` covering the Phase 9 access model (403 without a row, explicit + cross-team collaborators, isolation, duplicate 409, unauthorized manage 403, unknown user 404, cross-workspace 400, invalid role 400, unauthenticated 401, IDOR 403).
- `backend/test/progress.test.js` — 35 tests against `nexus_progress_test` covering project averaging (via a deterministic one-task project → exactly `50%` when that task is at `50`, and `0%` for an empty project), the dashboard and board payloads, and the same authorization rules as above applied to progress.
- Full suite: **152 passing** (`cd backend && npm test`); `npx next build` and `npx eslint src` clean.
- `npm run db:seed` — now 7 projects / 13 project memberships (see `docs/authorization.md` §6 for the Phase 8 personas).
# Nexus Authorization (Phase 6)

This document describes how Nexus authorizes requests. Authentication (proving *who* you are via the `nexus_token` cookie JWT) and authorization (deciding *what* you may do) are separate concerns.

- **Authentication** → `middleware/authenticate.js` reads the `nexus_token` cookie, verifies the JWT, and loads the user onto `req.user`. Missing/invalid tokens → **401**.
- **Authorization** → `middleware/authorize.js` decides whether the authenticated user may act on a workspace or project. Denied requests → **403**.

> Data layer note: authorization is implemented on the project's existing **MongoDB + Mongoose** stack (`docs/database.md`). Roles and memberships are stored in collections, not in the JWT, so permission changes take effect immediately.

---

## 1. Roles

Nexus has no meaningful global roles. Permissions are always evaluated in a **context**:

```text
JWT → Authentication → User → Context (Workspace or Project) → Role → Permission → Resource
```

### 1.1 Workspace roles

Derived from `Workspace.ownerId` and `WorkspaceMember.role` in `middleware/roleMiddleware.js`:

| Role | Source |
| --- | --- |
| `WORKSPACE_OWNER` | `Workspace.ownerId === req.user` |
| `ADMIN` | `WorkspaceMember.role === "Admin"` |
| `MEMBER` | `WorkspaceMember.role === "Member"` |
| `VIEWER` | `WorkspaceMember.role === "Viewer"` |

`req.workspaceRole` is set by the `memberOf` middleware.

### 1.2 Project roles

Resolved per project in `services/access.service.js` (`resolveProjectRole`), in order of precedence:

1. A `ProjectMember` row → that project role (`PROJECT_MANAGER`, `MEMBER`, `VIEWER`, `COLLABORATOR`).
2. `project.managerId === req.user` → `PROJECT_MANAGER`.
3. Workspace owner → derived `WORKSPACE_OWNER` (administrative project role).
4. Workspace admin → derived `ADMIN` (administrative project role).
5. Otherwise → **no access**.

> **Critical rule:** a regular workspace member gets **no** project access without a `ProjectMember` row (or being the project's `managerId`). Only owners and admins derive project access automatically.

`projectAccess` middleware sets `req.project`, `req.projectMember`, and `req.projectRole`.

---

## 2. Permission matrices

The single source of truth lives in `permissions/permissions.js`. Controllers and routes call `hasWorkspacePermission(role, action)` / `hasProjectPermission(role, action)` — there are no scattered `if (role === "Admin")` checks.

### 2.1 Workspace actions

| Action | Owner | Admin | Member | Viewer |
| --- | :-: | :-: | :-: | :-: |
| `view_workspace` | ✅ | ✅ | ✅ | ✅ |
| `view_workspace_members` | ✅ | ✅ | ✅ | ✅ |
| `view_channels` | ✅ | ✅ | ✅ | ✅ |
| `view_workspace_activity` | ✅ | ✅ | ✅ | ✅ |
| `view_document` | ✅ | ✅ | ✅ | ✅ |
| `view_teams` | ✅ | ✅ | ✅ | ✅ |
| `send_message` | ✅ | ✅ | ✅ | – |
| `create_project` | ✅ | ✅ | ✅ | – |
| `create_document` / `update_document` | ✅ | ✅ | ✅ | – |
| `manage_workspace` | ✅ | ✅ | – | – |
| `manage_workspace_members` | ✅ | ✅ | – | – |
| `manage_channels` | ✅ | ✅ | – | – |
| `manage_teams` | ✅ | ✅ | – | – |
| `manage_team_members` | ✅ | ✅ | – | – |
| `delete_document` | ✅ | ✅ | – | – |

### 2.2 Project actions

| Action | Owner* | Admin* | PM | Member | Collaborator | Viewer |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `view_project`, `view_task`, `view_deliverable` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `view_project_members`, `view_project_resources` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `view_activity`, `view_document` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `comment` | ✅ | ✅ | ✅ | ✅ | – | – |
| `create_subtask`, `update_subtask`, `delete_subtask`, `complete_subtask` | ✅ | ✅ | ✅ | ✅ | ✅ | – |
| `submit_task` (submit for review) | ✅ | ✅ | ✅ | ⚠️² | ⚠️² | – |
| `review_task`, `approve_task`, `request_task_changes` | ✅ | ✅ | ✅ | – | – | – |
| `update_task` | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | – |
| `upload_deliverable` | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | – |
| `create_deliverable`, `submit_deliverable`, `create_deliverable_version` | ✅ | ✅ | ✅ | ⚠️³ | ⚠️³ | – |
| `create_document`, `update_document` | ✅ | ✅ | ✅ | ✅ | – | – |
| `create_task` | ✅ | ✅ | ✅ | – | – | – |
| `delete_task`, `assign_task` | ✅ | ✅ | ✅ | – | – | – |
| `review_deliverable`, `approve_deliverable`, `request_changes` | ✅ | ✅ | ✅ | – | – | – |
| `request_deliverable_changes` | ✅ | ✅ | ✅ | – | – | – |
| `invite_project_member`, `remove_project_member` | ✅ | ✅ | ✅ | – | – | – |
| `create/update/delete_project_resource` | ✅ | ✅ | ✅ | – | – | – |
| `delete_document` | ✅ | ✅ | ✅ | – | – | – |
| `update_project` | ✅ | ✅ | ✅ | – | – | – |
| `delete_project` | ✅ | ✅ | – | – | – | – |

\* `WORKSPACE_OWNER` / `ADMIN` are the **derived** project roles for owners/admins acting inside a workspace project. `PROJECT_MANAGER` never has `delete_project`.

⚠️ = restricted further by ownership (below).
⚠️² = restricted to the task **assignee** (worker steps, see §2.6).
⚠️³ = restricted to tasks **assigned to the user**; the deliverable service itself re-checks ownership (and the creator) before writing, so this cannot be bypassed by calling the version routes directly — see [deliverables.md §3](deliverables.md#3-api).

### 2.3 Task ownership rule

For roles **without** `assign_task` (MEMBER and COLLABORATOR), `update_task` / `upload_deliverable` / task moves only succeed when the requesting user is the task's **assignee** (`assignedTo`) **or creator** (`createdBy`). Implemented by the `taskOwnership` middleware, which loads the task and attaches `req.task`. Managers, owners and admins bypass ownership.

### 2.4 Assignment rule

`assign_task` is required to create (assign) or reassign a task. If a user without the permission supplies a different assignee, the assignment is **ignored** — for `createTask` it falls back to the creator, for `updateTask` the current assignee is kept. Roles/assignments are never trusted from the client; `createProject` sets `managerId` and adds the creator as `PROJECT_MANAGER` server-side.

### 2.5 Role granting rule

Only workspace owners and admins may assign the `PROJECT_MANAGER` role (`canGrantManagerRole` in `projectMember.controller.js`). A project manager cannot grant it and cannot promote themselves.

### 2.6 Task status workflow (Phase 10)

Tasks live on a governed workflow — **`ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED`**, with a rework branch **`UNDER_REVIEW → CHANGES_REQUESTED → IN_PROGRESS`**. `APPROVED` is terminal. The single source of truth is `TRANSITION_RULES` in `services/task.service.js`; each edge names the required permission and whether it is a *worker* or *reviewer* step:

| Transition | Permission | Type | Requires |
| --- | --- | --- | --- |
| `ASSIGNED → IN_PROGRESS` | `update_task` | worker | assignee |
| `IN_PROGRESS → SUBMITTED` | `submit_task` | worker | assignee |
| `SUBMITTED → UNDER_REVIEW` | `review_task` | reviewer | PM / derived owner+admin |
| `UNDER_REVIEW → APPROVED` | `approve_task` | reviewer | PM / derived owner+admin |
| `UNDER_REVIEW → CHANGES_REQUESTED` | `request_task_changes` | reviewer | PM / derived owner+admin |
| `CHANGES_REQUESTED → IN_PROGRESS` | `update_task` | worker | assignee |

The **only** way to change status is `PATCH /api/tasks/:taskId/status` (handling in `task.route.js`); generic `PATCH` updates ignore `status` entirely, so board drag-drop never mutates workflow state. Worker steps are assignee-only (`assertStatusTransition` compares `task.assignedTo` to `req.user`); reviewer steps require a project role holding the transition's permission. Anything else → **400** (unknown/invalid transition) or **403** (not the assignee / insufficient role).

- **Assignees must have project access.** Creating a task or subtask (or reassigning) runs `assertAssigneeInProject`: the target must be a `ProjectMember` row, the project `managerId`, the workspace owner, or a workspace-admin-derived user, else **400** `"Assignee must be a member of this project"`.
- **Legacy board statuses** (`TO DO`, `IN PROGRESS`, `REVIEW`, `DONE`, `BLOCKED`) remap at creation via `LEGACY_STATUS_TO_WORKFLOW` (`TO DO`/`BLOCKED` → `ASSIGNED`, `IN PROGRESS` → `IN_PROGRESS`, `REVIEW` → `SUBMITTED`, `DONE` → `APPROVED`), so new tasks always enter a governed state. Legacy values remain *valid* document states (the `status` validator accepts `STATUSES = WORKFLOW_STATUSES + LEGACY_BOARD_STATUSES`) so pre-existing data never invalidates, but they hold no transition rules.
- **Subtasks** are embedded in the task document. `subtaskTaskAccess` (authorize.js) locates the owning task from `:subtaskId`, then applies the same project access rules as `taskAccess`; mutation routes require `create_subtask` / `update_subtask` / `delete_subtask` **plus** `requireTaskOwnership`. Subtask `status` is `TODO` / `IN_PROGRESS` / `COMPLETED` (toggling `status` keeps `completed` in sync); task `progress` is the **server-derived** completed-weight sum (a `0–100` integer, never `null` — see `docs/tasks.md` §3.1). Progress inherits its access model: a figure is only ever returned to a caller who may already view the underlying task or project, and it is never accepted as input — every write path whitelists fields, so a client-sent `progress` is ignored. Two content preconditions are enforced alongside the permission checks, both **400** rather than 403 (they are business rules, not access denials): `UNDER_REVIEW → APPROVED` is refused while any subtask is open, and an `APPROVED` task refuses open subtasks, so a user can neither escalate nor manufacture approval.

---

## 3. Middleware

`middleware/authorize.js` exposes:

| Middleware | Where | What it does |
| --- | --- | --- |
| `requirePermission(action)` | workspace routes | Requires `hasWorkspacePermission(req.workspaceRole, action)`. |
| `projectAccess` | project routes | Loads the project (must belong to the workspace), resolves the project role, sets `req.project` / `req.projectMember` / `req.projectRole`. Denies with **403** when there is no role. |
| `requireProjectPermission(action)` | project routes | Requires `hasProjectPermission(req.projectRole, action)`. |
| `taskOwnership` | board task routes | Enforces the ownership rule; attaches `req.task`. |
| `taskAccess` | global task routes (`/api/tasks/:id`) | Loads the task, then the owning project, and resolves project+workspace context exactly like a project route; attaches `req.task` / `req.subtask` / `req.project` / `req.projectRole`. **404** not found / invalid id, **403** no project role. |
| `subtaskTaskAccess` | global subtask routes (`/api/subtasks/:id`) | Finds the task that owns the embedded subtask by `:subtaskId`, attaches `req.subtask`, then applies the same access rules as `taskAccess`. |
| `requireTaskOwnership` | task + subtask routes | Runs after `taskAccess`/`subtaskTaskAccess`; members/collaborators may only mutate tasks **assigned to them** (or that they created); `assign_task` holders manage any task. |
| `documentAccess(action)` | document routes | For project-scoped documents, resolves the **project** role; for workspace documents, uses the workspace role. |
| `attachWorkspaceContext` | team routes | Resolves a workspace from `req.body.workspaceId` (or a team's `workspaceId` when the body omits it); sets `req.workspace` / `req.workspaceRole`. **404** invalid, **403** non-member. |
| `teamAccess` | team routes | Loads the team by `:teamId`, verifies it belongs to the workspace, attaches `req.team`, `req.teamMember`, `req.isTeamLead`. |
| `requireTeamMemberManagement` | team member routes | Allows a workspace role holding `manage_team_members` **or** the requester being the **team lead** (`req.isTeamLead`) of that team. The team-lead path is membership-based and bypasses the role matrix. |
| `projectTeamContext` | global project routes | Resolves the workspace for a project create/update from the **team** in the body (`req.body.teamId`) — `workspaceId` is never trusted from the client. Sets `req.workspace` / `req.workspaceRole`; **404** unknown team, **400**/403 for a team not in a workspace the user can create in. |
| `globalProjectAccess` | global project routes | Loads a project by id **across all workspaces** the user belongs to, resolves its workspace + project role, sets `req.project` / `req.projectMember` / `req.projectRole`. **404** not found / invalid id, **403** no role. |
| `requireProjectDetails` | global project create | Flags `req.requireProjectDetails` so the shared controller enforces a required `teamId` + `managerId` (global creates always require them). |

Run order on project-scoped routes: `authenticate → memberOf → (projectAccess) → requireProjectPermission → taskOwnership`.
Global task routes run `authenticate → taskAccess/subtaskTaskAccess → requireProjectPermission → requireTaskOwnership`.
Team routes run `authenticate → attachWorkspaceContext/teamAccess → requirePermission/requireTeamMemberManagement`.

---

## 4. Protected routes

Mounts are in `app.js`; each route file declares its own permission gate.

| Route | Requirement |
| --- | --- |
| `GET /api/workspaces` | authenticated (lists only the user's workspaces) |
| `GET/PATCH/DELETE /api/workspaces/:id` | `view_workspace` / `manage_workspace` |
| `GET/POST/PATCH/DELETE /api/workspaces/:id/members/:userId` | `view_workspace_members` / `manage_workspace_members` |
| `GET/POST /api/workspaces/:id/channels` | `view_channels` / `manage_channels` |
| `POST /api/workspaces/:id/projects` | `create_project` |
| `GET /api/workspaces/:id/projects` | `view_workspace` (results filtered to accessible projects) |
| `GET/PATCH/DELETE /.../projects/:projectId` | `view_project` / `update_project` / `delete_project` |
| `GET /.../projects/:projectId/board` | `view_project` |
| `POST/PATCH/DELETE /.../projects/:projectId/columns` | `update_project` |
| `POST /.../projects/:projectId/tasks` | `create_task` |
| `PATCH /.../projects/:projectId/tasks/:taskId` | `update_task` + ownership |
| `DELETE /.../projects/:projectId/tasks/:taskId` | `delete_task` |
| `POST /.../projects/:projectId/tasks/:taskId/move` | `update_task` + ownership |
| `PATCH /api/tasks/reorder` | resolves the task's project → `update_task` + ownership |
| `POST /.../projects/:projectId/tasks/:taskId/deliverables` | `upload_deliverable` + ownership |
| `GET /.../projects/:projectId/deliverables` | `view_deliverable` |
| `PATCH /.../projects/:projectId/deliverables/:id` | `upload_deliverable` (submitter or manager) |
| `POST /.../projects/:projectId/deliverables/:id/review` | `review_deliverable`; `APPROVED` → `approve_deliverable`, `CHANGES_REQUESTED` → `request_changes` |
| `GET/POST/PATCH/DELETE /.../projects/:projectId/members/:userId` | `view_project_members` / `invite_project_member` / (`remove_project_member`) |
| `GET/POST/PATCH/DELETE /.../projects/:projectId/resources` | `view_project_resources` / `create|update|delete_project_resource` |
| `GET/POST /api/workspaces/:id/documents` | `view_document` / `create_document` (filtered to accessible projects) |
| `GET/PATCH/DELETE /.../documents/:docId` | `documentAccess(view|update|delete)` |
| `GET/POST /api/workspaces/:id/messages` | `view_channels` / `send_message` |
| `GET /api/workspaces/:id/activity` | `view_workspace_activity` (filtered to accessible projects) |
| `GET /api/workspaces/:id/teams` | `view_teams` |
| `POST /api/teams` | `manage_teams` (workspace resolved from `workspaceId` in the body) |
| `GET /api/teams/:teamId` | `teamAccess` + `view_teams` |
| `PATCH/DELETE /api/teams/:teamId` | `teamAccess` + `manage_teams` |
| `GET /api/teams/:teamId/members` | `teamAccess` + `view_teams` |
| `POST /api/teams/:teamId/members` | `teamAccess` + `requireTeamMemberManagement` |
| `PATCH/DELETE /api/teams/:teamId/members/:userId` | `teamAccess` + `requireTeamMemberManagement` |
| `GET /api/projects` | authenticated; lists **all** projects accessible across the user's workspaces; `?status` / `?priority` / `?teamId` filters applied on top of the authorized set (invalid values → 400) |
| `GET /api/projects/meta` | authenticated; create-eligible workspaces (owner/`Admin`/`Member`; `Viewer` gets `[]`) with teams + eligible managers (owner + workspace owners/admins/members — `Viewer`s are never listed) |
| `POST /api/projects` | `projectTeamContext` + `create_project` (+ `requireProjectDetails`); workspace derived from `teamId`, creator + manager both become `PROJECT_MANAGER` |
| `GET/PATCH/DELETE /api/projects/:projectId` | `globalProjectAccess` + `view_project` / `update_project` / `delete_project` |
| `GET /api/projects/:projectId/members` | `globalProjectAccess` + `view_project_members` |
| `POST /api/projects/:projectId/members` | `globalProjectAccess` + `invite_project_member` (invited user must belong to the project's workspace → else **400**) |
| `PATCH/DELETE /api/projects/:projectId/members/:userId` | `globalProjectAccess` + `invite_project_member` / `remove_project_member` |
| `GET /api/me/overview`, `GET /api/me/tasks` | authenticated (filtered to accessible projects) |
| `GET /api/projects/:projectId/tasks` | `globalProjectAccess` + `view_task` (`?status` / `?priority` / `?assigneeId` filters; invalid → 400) |
| `POST /api/projects/:projectId/tasks` | `globalProjectAccess` + `create_task` (assignee must be a project member → else 400) |
| `GET/PATCH/DELETE /api/tasks/:taskId` | `taskAccess` + `view_task` / (`update_task` / `delete_task` + `requireTaskOwnership`; generic PATCH ignores `status`) |
| `PATCH /api/tasks/:taskId/status` | `taskAccess` + `update_task` + transition rules (worker steps assignee-only; reviewer steps PM / derived owner+admin) |
| `GET/POST /api/tasks/:taskId/subtasks` | `taskAccess` + `view_task` / (`create_subtask` + `requireTaskOwnership`) |
| `GET/PATCH/DELETE /api/subtasks/:subtaskId` | `subtaskTaskAccess` + `view_task` / (`update_subtask` / `delete_subtask` + `requireTaskOwnership`) |

**Validation errors** (invalid enums, bad dates, cross-workspace team/manager, missing name/team/manager, due-before-start) are returned as **400** with the exact reason; the `errorHandler` maps Mongoose `ValidationError` → 400 as a fallback.

**Cross-team collaborators**: a user added to a project as `COLLABORATOR` can view that project and update only their own assigned tasks, but **cannot comment**. They have no access to other projects they are not a member of.

**Same-workspace rule (Phase 9)**: any member added to a project must belong to the project's workspace (a `WorkspaceMember` row — or the workspace owner). Team membership is **not** required: a user can be a `COLLABORATOR` on a project owned by a different team, as long as both users share the workspace. Inviting a user from another workspace → **400** `"User does not belong to this workspace"`. Users without a project role get **403** even when they sit on the same team, and access never leaks between projects (isolation).

**Filtering**: project lists (`listProjects`), document lists, activity feeds, overview/tasks, and dashboard queries all compute the user's accessible project ids (`getAccessibleProjectIds`) and filter server-side. Inaccessible records are never returned.

---

## 5. UX permission states

The board UI derives its state from the project role returned on each project (`project.role`, e.g. `MEMBER` / `COLLABORATOR` / `VIEWER`):

- **Add task button** — only `PROJECT_MANAGER`, `WORKSPACE_OWNER`, `ADMIN`.
- **Drag & drop** — disabled for `VIEWER` (read-only).
- **Assignee selector** — disabled for role without `assign_task` (MEMBER / COLLABORATOR / VIEWER); the server ignores reassignments anyway.
- **Delete task** — only managers/owners/admins.
- **Comments** — comment box only when the role has `comment` (MEMBER and up); delete-any-comment only for managers/owners/admins.
- **Task list / detail (Phase 10)** — "New task" and Edit/Delete buttons show only for managers/owners/admins; the assignee selector lists `assignableMembers` the server derives (project members + manager + all workspace members for owners/admins). Status action buttons are gated by the role the server returns for the project: worker moves render for the assignee (others see a "waiting on assignee" hint), reviewer moves render for managers/owners/admins, and failed transitions surface the backend's error rather than being hidden — the server remains the source of truth.

---

## 6. Tests

`backend/test/authz.test.js` + `backend/test/teams.test.js` use Node's built-in test runner (`node --test`) against dedicated databases (`nexus_authz_test` / `nexus_teams_test`, overridable via `MONGO_URI`). No new dependencies.

```bash
cd backend && npm test
```

The workspace+authz suite covers: 401 (missing/invalid token), 403 for non-members, workspace vs project roles, owner/admin derivation, cross-team collaborator access, project-listing filtering, task ownership, assignment gating, the Phase-10 task workflow (worker vs reviewer transitions, legacy creation mapping, assignee-must-be-a-member), deliverable submit/review rules, project-member management, self-promotion denial, task reordering, document scoping, and activity filtering. The **phase-10 tasks suite** (`backend/test/tasks.test.js`, 17 tests on `nexus_tasks_test`) covers task CRUD with assignee-must-be-a-project-member enforcement, the dedicated status endpoint (valid/invalid transitions, assignee-only worker steps, reviewer-only review steps), subtask CRUD + completion + progress, the subtask serialized-id regression, and the board's consistent task count after deletion. The team suite covers team CRUD, the workspace teams list, member add/remove/role changes, the team-lead management bypass, cross-workspace member rejection, duplicate name/membership conflicts, the `getTeam` layered detail payload (team + workspace + role + isTeamLead + projects), and the safe-delete rule (projects preserved, `teamId` nulled). The **phase-8 projects suite** (`backend/test/projects.test.js`, 39 tests on `nexus_projects_test`) covers the global project API: 401/403 gates, create with required team+manager, `body.workspaceId` being ignored, manager eligibility (owners/admins/members only, cross-workspace rejected), enum/date validation, authorized list/filter behavior, detail enrichment (team/workspace/manager/members), id-manipulation isolation, update (cross-workspace team/manager rejection, enums, date ranges, empty name), **manager handoff** (new manager promoted, old manager demoted to `MEMBER`), the delete matrix (owner/admin only), delete cascade + 404 after, and the `/meta` endpoint (create-eligible workspaces; viewer gets `[]`). The **phase-9 access suite** (`backend/test/projectAccess.test.js`, 12 tests on `nexus_projectaccess_test`) verifies the explicit project-access model: team membership alone grants nothing (**403** without a project row), explicit + cross-team collaborators gain access without joining the other team, access is isolated per project, duplicate invites → **409**, unauthorized invitations/role changes/removals → **403**, unknown users → **404**, cross-workspace invites → **400**, unsupported roles → **400**, unauthenticated calls → **401**, and IDOR attempts by known project ids → **403**. The **phase-11 progress suite** (`backend/test/progress.test.js`, 35 tests on `nexus_progress_test`) locks the formula and its authorization: the weighted sum, the no-normalization guarantee, the `≤ 100` weight ceiling, the unweighted-checklist fallback, the `APPROVED` gate and drift guard, board/dashboard/project payloads, 401 without a token, 403 for a non-member, no cross-project leakage through the dashboard, and silent rejection of client-sent `progress`. Running the full suite: **152 tests**.

Seeded dev users (`npm run db:seed`) match the personas used in the tests: `ada` (owner, collaborator on platform), `alan` (admin + platform PM), `linus`/`margaret` (platform members; margaret also `COLLABORATOR` on the design system), `katherine` (benchmark PM), `grace` (design PM), `barbara` (design viewer). All use the password `Password123!`. Phase 8 seeds 4 more projects onto the workspace: **Nexus Research Platform** (Research, katherine PM, ACTIVE/HIGH), **Mobile Banking API** (Engineering, linus PM, COMPLETED/URGENT), **Healthcare Management System** (Engineering, alan PM, ACTIVE/URGENT), **Developer Learning Platform** (Product, grace PM, PLANNING/MEDIUM), each with a matching `PROJECT_MANAGER` membership row (`docs/database.md` §9, now 7 projects / 13 project memberships). Phase 10 seeds 13 additional tasks (17 total) exercising **every workflow state** — `ASSIGNED`, `IN_PROGRESS`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED` — across the platform, benchmark, and design-system projects, with embedded subtasks, plus running subtask lists, a `TASK_STATUS_CHANGED` notification, and `TASK_STARTED` / `TASK_COMPLETED` / `TASK_UPDATED` activity entries.
# Nexus Tasks & Subtasks (Phase 10)

This document covers the **task workflow** and **subtasks** feature: the canonical status workflow, the dedicated status endpoint, embedded subtasks with derived progress, the assignee-must-be-a-member rule, and the project task list/detail UI.

Stack note: like the rest of Nexus this is built on **MongoDB + Mongoose** (`docs/database.md`). Tasks and subtasks live in the `tasks` collection; subtasks are embedded arrays (no separate collection).

---

## 1. The workflow

A task always belongs to one of these states:

```
ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED
                                  ↓
                          CHANGES_REQUESTED → IN_PROGRESS
```

- `APPROVED` is terminal.
- `UNDER_REVIEW` may go to `APPROVED` or `CHANGES_REQUESTED`.
- `CHANGES_REQUESTED` only returns to `IN_PROGRESS`.

The rules live in exactly one place: `TRANSITION_RULES` in `backend/src/services/task.service.js`. Each edge declares the permission it needs and whether it is a **worker** step (assignee-only) or a **reviewer** step (manager / derived owner + admin):

| Transition | Permission | Type |
| --- | --- | --- |
| `ASSIGNED → IN_PROGRESS` | `update_task` | worker (assignee only) |
| `IN_PROGRESS → SUBMITTED` | `submit_task` | worker (assignee only) |
| `SUBMITTED → UNDER_REVIEW` | `review_task` | reviewer |
| `UNDER_REVIEW → APPROVED` | `approve_task` | reviewer |
| `UNDER_REVIEW → CHANGES_REQUESTED` | `request_task_changes` | reviewer |
| `CHANGES_REQUESTED → IN_PROGRESS` | `update_task` | worker (assignee only) |

**The only way to change status is `PATCH /api/tasks/:taskId/status`** with `{ status: <toStatus> }`. Generic task PATCH and the board drag-drop never touch `status`, so the board can reorder freely without corrupting workflow state.

One edge has a **content precondition** on top of its permission: `UNDER_REVIEW → APPROVED` additionally requires every subtask to be complete (Phase 11 — see [§3.1](#31-progress)). The guard is a separate function (`assertSubtasksCompleteForApproval`) rather than part of `TRANSITION_RULES`, so the state machine stays a pure map and the rule is reusable by the board's bulk-subtask path.

### Legacy statuses

Pre-existing board data used `TO DO`, `IN PROGRESS` (with a space), `REVIEW`, `DONE`, `BLOCKED`. Those values remain **valid persisted states** — the model validator accepts `WORKFLOW_STATUSES + LEGACY_BOARD_STATUSES` — but they have no transitions. At **creation** the server remaps them via `LEGACY_STATUS_TO_WORKFLOW`, so every new task enters a governed state (`TO DO`/`BLOCKED` → `ASSIGNED`, `IN PROGRESS` → `IN_PROGRESS`, `REVIEW` → `SUBMITTED`, `DONE` → `APPROVED`).

> Note the two visually similar values are distinct strings: the workflow uses **`IN_PROGRESS`** (underscore); the legacy value is **`IN PROGRESS`** (space). Keep both in the validation set — dropping the legacy value breaks pre-existing documents on save.

### Priorities

`LOW` / `MEDIUM` / `HIGH` / `URGENT` (canonical uppercase). The API accepts any casing (`normalizePriority` case-folds), so title-case values from the old board (`Medium`, etc.) still validate and normalize on save.

---

## 2. Assignee rule

- **Assignees must have project access.** Creating a task or subtask, or reassigning either, runs `assertAssigneeInProject`: the target user must be a `ProjectMember` row, the project manager, the workspace owner, or a workspace-admin-derived user. Anything else → **400** `"Assignee must be a member of this project"`. (Being a workspace owner/admin on the *requester* side never blesses a non-member assignee.)
- **Worker steps are assignee-only.** `assertStatusTransition` additionally verifies `task.assignedTo === req.user` for worker edges — a manager cannot click "Submit for review" on behalf of the assignee.

---

## 3. Subtasks

Subtasks are **embedded documents** on the task (`task.subtasks`). Each has `title`, `description`, `completed`, `status` (`TODO` / `IN_PROGRESS` / `COMPLETED`), `assigneeId`, `dueDate`, `weight`. Toggling `status` keeps `completed` in sync via a pre-save hook.

- `progress` is **derived, not stored**: see [§3.1 Progress](#31-progress) below.
- Subtask routes resolve the owning task from `:subtaskId` then apply the **same project-access rules** as the task itself (`subtaskTaskAccess`). Mutations need `create_subtask` / `update_subtask` / `delete_subtask` **plus** task ownership (`requireTaskOwnership`).
- Deleting a task cascades its deliverables, reviews, and comments. Subtasks go with the task (embedded) automatically.

### 3.1 Progress

Progress is computed by `backend/src/services/progress.service.js`, the only place the formula exists. Every endpoint returns an **integer `0–100`; there is no `null`** — a subtask-less task reports `0`, not "no data".

| Case | Rule |
| --- | --- |
| Task with weighted subtasks | Sum of the weights of its **completed** subtasks, reported **verbatim** — never normalized by the configured total. A task allocated only `70` points tops out at `70%`. |
| Task whose weights total `0` (legacy checklist) | Completed subtask **count** / total count, so pre-Phase-11 data keeps reporting sensible progress. |
| Task with no subtasks | `100` when the status is `APPROVED` (legacy `DONE` too), otherwise `0`. `SUBMITTED` and `UNDER_REVIEW` are explicitly `0`. |
| Project | Unweighted average of its tasks' progress, `Math.round`; an empty project is `0`. |

```js
// 20 + 50 + 30, two done  ->  70      (not 70/100 of a re-normalized sum)
completedWeight / 100 * 100
```

Three invariants are enforced alongside the formula:

- **Approval gate** — `UNDER_REVIEW → APPROVED` is rejected (**400**) while any subtask is still open, so a task can never be approved at `70%`. (The reverse, `APPROVED → UNDER_REVIEW`, is already impossible: workflow transitions are one-directional.)
- **Drift guard** — once `APPROVED`, the task's subtasks must all stay complete. Re-opening one or adding a new one is rejected (**400**); completing the remaining work and deleting open items remain allowed, so an inconsistent task can always be repaired.
- **Weight ceiling** — the combined weights on one task may never exceed `100`. Under-allocation is legal (weights can be added incrementally); the API answers **400** rather than silently clamping or renormalizing.

Every subtask response also carries a `weights` summary so the UI can show what's left without recomputing anything:

```js
{ subtasks: [...], progress: 70,
  weights: { total: 100, remaining: 30, completedWeight: 70,
             isComplete: false, pendingSubtasks: 1 } }
```

`progress` and `weights` are **read-only**: every write path whitelists fields, so a client-sent `progress` is ignored rather than rejected (`tests 20–21` in `backend/test/progress.test.js`). Progress never changes a status either — completing the last subtask leaves the task in its current workflow state, and no project status is derived from progress.

### Serialization note (regression fixed)

`serializeTask` must output real subtask ids. Mongoose's sub-document `id` virtual is lost after `toJSON()`, so the serializer falls back to `_id`:

```js
id: s ? String(s._id || s.id) : ""
```

The tasks suite asserts task-payload subtasks never carry the string `"undefined"`.

---

## 4. API

Global, project-scoped routes are mounted in `app.js` (`task.route.js`); the list/create live under `/api/projects/:projectId/tasks`.

| Method & path | Notes |
| --- | --- |
| `GET /api/projects/:projectId/tasks` | `globalProjectAccess` + `view_task`. Returns `{ count, tasks, assignableMembers }`. Optional `?status=` / `?priority=` / `?assigneeId=` filters (invalid → 400). |
| `POST /api/projects/:projectId/tasks` | `create_task`. Returns `{ task, assignableMembers }`; creates a `TASK_ASSIGNED` notification + `TASK_CREATED` activity when assigned. |
| `GET /api/tasks/:taskId` | `taskAccess` + `view_task`. Returns `{ task }`. |
| `PATCH /api/tasks/:taskId` | `update_task` + ownership. Updates title/description/priority/assignee/dueDate/tags; **ignores `status`**. |
| `DELETE /api/tasks/:taskId` | `delete_task` + ownership. Cascades deliverables/reviews/comments. |
| `PATCH /api/tasks/:taskId/status` | `update_task` + transition rules. Body `{ status }`. Returns the moved task. |
| `GET /api/tasks/:taskId/subtasks` | `view_task`. Returns `{ subtasks, progress, weights }`. |
| `POST /api/tasks/:taskId/subtasks` | `create_subtask` + ownership. Accepts `weight` (`0–100`); rejected if the task's combined weights would exceed `100` or the task is already `APPROVED`. |
| `GET /api/subtasks/:subtaskId` | `subtaskTaskAccess` + `view_task`. |
| `PATCH /api/subtasks/:subtaskId` | `subtaskTaskAccess` + `update_subtask` + ownership. Re-weighting is checked against the ceiling; an `APPROVED` task's subtasks must stay complete. |
| `DELETE /api/subtasks/:subtaskId` | `subtaskTaskAccess` + `delete_subtask` + ownership. |

Every list is authorized and filtered server-side to the requester's accessible projects (`getAccessibleProjectIds`); nothing is trusted from the client.

### Payload shape (`serializeTask`)

```js
{
  id, projectId, workspaceId, title, description,
  priority, status, position, dueDate: ISO?, tags: [],
  assignedTo: id?, assignee: { id, name, email }?,
  subtasks: [{ id, title, description, completed, status, assigneeId, assignee, dueDate, weight }],
  progress: 0-100,
  weights: { total, remaining, completedWeight, isComplete, pendingSubtasks },
  createdBy: id?, createdAt, updatedAt
}
```

---

## 5. Permissions

Full matrix in `docs/authorization.md` §2.2/§2.6. Summarized:

- **PM / derived owner + admin**: everything — create/update/delete tasks, assign, all subtask actions, all six workflow moves, plus reassigning anyone.
- **MEMBER / COLLABORATOR**: update only tasks **assigned to them (or created by them)**; can create/update/delete/complete subtasks on such tasks; worker moves (`ASSIGNED→IN_PROGRESS`, `IN_PROGRESS→SUBMITTED`, `CHANGES_REQUESTED→IN_PROGRESS`); **no** reviewer moves.
- **VIEWER**: read-only (view task + subtasks; no mutations, no moves).

---

## 6. Frontend

- `app/projects/[projectId]/tasks` — task list for a project. Search, priority and assignee filters, status tabs over the full workflow + legacy states (labels/counts from `TASK_STATUS_META`, zero-count tabs hidden), rows showing status and priority badges, due-date/overdue chip, subtask progress and assignee avatar. **New task** modal (`TaskFormModal`) gated to managers/owners/admins (`project.role` from `/api/projects/:id`).
- `app/projects/[projectId]/tasks/[taskId]` — task detail. Description + tags, meta cards (due/priority/progress/assignee), **Move task** buttons rendered from `TRANSITIONS` (worker steps show a "waiting on assignee" hint when the viewer isn't the assignee; an **Approve** action is shown but the server's subtask precondition is surfaced as an error if work is still open), subtasks list with the shared `ProgressBar`, per-subtask weight chips, a weight breakdown, and the `SubtaskComposer` weight field with live "allocated / remaining" feedback. Add/toggle/delete, Edit + Delete (confirm modal). Backend errors surface instead of hiding buttons — the server stays source of truth.
- `app/tasks` (My Tasks) — status tabs across the workflow + legacy labels, counts, `isOverdue`/`isDueSoon` treat `APPROVED` (and `DONE`) as terminal; each row links into the project task detail.
- `components/workspace/TaskFormModal.jsx` — shared create/edit modal (title, description, priority, assignee, due date, tags, quick subtasks on create; read-only status on edit).
- `components/workspace/Kanban/TaskModal.jsx` — board-flavored create/edit: create status restricted to `ASSIGNED`/`IN_PROGRESS` (column maps through `columnToStatus`), read-only status pill on edit, uppercase priorities.
- `components/workspace/ProgressBar.jsx` — the single progress renderer (`role="progressbar"`, `aria-valuenow/min/max`, `xs|sm|md|lg` sizes, tone colors). No page computes a percentage itself.
- `lib/workspaceApi.js` — `TASK_STATUSES`, `TASK_STATUS_META`, `TASK_PRIORITY_META`, `SUBTASK_STATUS_META`, `taskStatusMeta()`, `taskPriorityMeta()`, `formatWeight()` (renders `33` and `33.3` without floating-point noise); `STATUS_COLORS` extended with workflow keys; `PRIORITY_COLORS` accepts title and upper case.

---

## 7. Seed & tests

- `npm run db:seed` seeds **17 tasks**: 4 legacy-status board tasks plus 13 workflow tasks covering **every state** (`ASSIGNED` → `APPROVED` and `CHANGES_REQUESTED`) across the platform, benchmark, and design-system projects, with embedded subtasks. Every seeded task allocates exactly `100` points, so the demo shows `70%` (`Design authentication flow` — 20 + 50 of 100), `80%` (`Implement Socket.IO auth`), `100%` (`Ship login form UI`) and `0%` tasks. Also: `TASK_STATUS_CHANGED` notifications and `TASK_STARTED` / `TASK_COMPLETED` / `TASK_UPDATED` activity entries.
- `backend/test/tasks.test.js` (`nexus_tasks_test`): task CRUD with member-assignment enforcement, the dedicated status endpoint (valid/invalid/one-hop-only transitions, assignee-only worker steps, reviewer-only review steps), subtask CRUD + completion, the subtask serialized-id regression, and the Phase-11 invariant that an approved task refuses new open work. The subtask suite runs against a still-`ASSIGNED` task precisely because the workflow test in the same file approves the other one.
- `backend/test/progress.test.js` (**35 tests**, `nexus_progress_test`): the formula itself (unit), the no-normalization guarantee, the weight ceiling, the full HTTP surface (task, subtask, board, project, dashboard), `APPROVED` gating and drift, legacy-count fallback, client manipulation attempts, and authorization (401/403, no cross-project leakage). `makeProject()` gives a deterministic single-`IN_PROGRESS` task so the averaging assertions are exact.
- The authz suite covers the same workflow from the permission side. **Full backend suite: 152/152 pass** (`cd backend && npm test`); `next build` + ESLint green on both sides.

---

## 8. Edge cases handled

- `PATCH /api/tasks/:id` silently ignores `status`; reorder/move never mutate workflow state.
- Legacy `"IN PROGRESS"` (space) vs workflow `"IN_PROGRESS"` (underscore) both validate; legacy only at creation, workflow everywhere else.
- Non-member assignment rejected at task *and* subtask level; manager reassignment still requires membership.
- Subtask `id` serialization regression covered by test (never the literal string `"undefined"`).
- Board "Add task" from any column still lands in the clicked column (`defaultColumnId`) no matter the created workflow status.
- A task at `100%` is **not** auto-approved, and a project at `100%` does not change status: progress and workflow are independent axes.
- A project-wide bulk subtask replacement on the board (drag a card over a column) runs the same ceiling, membership, and approval rules as the single-subtask routes — the fast path can't be used to bypass them.
- Fractional weights round (`33 + 34 → 67`); the sum of completed weights is rounded once, at the end.
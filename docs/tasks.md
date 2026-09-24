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

- `progress` is **derived, not stored**: the percentage of `COMPLETED` subtasks, `null` when a task has none.
- Subtask routes resolve the owning task from `:subtaskId` then apply the **same project-access rules** as the task itself (`subtaskTaskAccess`). Mutations need `create_subtask` / `update_subtask` / `delete_subtask` **plus** task ownership (`requireTaskOwnership`).
- Deleting a task cascades its deliverables, reviews, and comments. Subtasks go with the task (embedded) automatically.

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
| `GET /api/tasks/:taskId/subtasks` | `view_task`. Returns `{ subtasks, progress }`. |
| `POST /api/tasks/:taskId/subtasks` | `create_subtask` + ownership. |
| `GET /api/subtasks/:subtaskId` | `subtaskTaskAccess` + `view_task`. |
| `PATCH /api/subtasks/:subtaskId` | `subtaskTaskAccess` + `update_subtask` + ownership. |
| `DELETE /api/subtasks/:subtaskId` | `subtaskTaskAccess` + `delete_subtask` + ownership. |

Every list is authorized and filtered server-side to the requester's accessible projects (`getAccessibleProjectIds`); nothing is trusted from the client.

### Payload shape (`serializeTask`)

```js
{
  id, projectId, workspaceId, title, description,
  priority, status, position, dueDate: ISO?, tags: [],
  assignedTo: id?, assignee: { id, name, email }?,
  subtasks: [{ id, title, description, completed, status, assigneeId, assignee, dueDate, weight }],
  progress: 0-100 | null, createdBy: id?, createdAt, updatedAt
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
- `app/projects/[projectId]/tasks/[taskId]` — task detail. Description + tags, meta cards (due/priority/progress/assignee), **Move task** buttons rendered from `TRANSITIONS` (worker steps show a "waiting on assignee" hint when the viewer isn't the assignee), subtasks list with progress bar + add/toggle/delete, Edit + Delete (confirm modal). Backend errors surface instead of hiding buttons — the server stays source of truth.
- `app/tasks` (My Tasks) — status tabs across the workflow + legacy labels, counts, `isOverdue`/`isDueSoon` treat `APPROVED` (and `DONE`) as terminal; each row links into the project task detail.
- `components/workspace/TaskFormModal.jsx` — shared create/edit modal (title, description, priority, assignee, due date, tags, quick subtasks on create; read-only status on edit).
- `components/workspace/Kanban/TaskModal.jsx` — board-flavored create/edit: create status restricted to `ASSIGNED`/`IN_PROGRESS` (column maps through `columnToStatus`), read-only status pill on edit, uppercase priorities.
- `lib/workspaceApi.js` — `TASK_STATUSES`, `TASK_STATUS_META`, `TASK_PRIORITY_META`, `SUBTASK_STATUS_META`, `taskStatusMeta()`, `taskPriorityMeta()`; `STATUS_COLORS` extended with workflow keys; `PRIORITY_COLORS` accepts title and upper case.

---

## 7. Seed & tests

- `npm run db:seed` seeds **17 tasks**: 4 legacy-status board tasks plus 13 workflow tasks covering **every state** (`ASSIGNED` → `APPROVED` and `CHANGES_REQUESTED`) across the platform, benchmark, and design-system projects, with embedded subtasks. Also: `TASK_STATUS_CHANGED` notifications and `TASK_STARTED` / `TASK_COMPLETED` / `TASK_UPDATED` activity entries.
- `backend/test/tasks.test.js` (17 tests, `nexus_tasks_test`): task CRUD with member-assignment enforcement, the dedicated status endpoint (valid/invalid/one-hop-only transitions, assignee-only worker steps, reviewer-only review steps), subtask CRUD + completion + progress, the subtask serialized-id regression, board task-count consistency after deletion.
- The authz suite covers the same workflow from the permission side. **Full backend suite: 117/117 pass** (`cd backend && npm test`); `next build` + ESLint green on both sides.

---

## 8. Edge cases handled

- `PATCH /api/tasks/:id` silently ignores `status`; reorder/move never mutate workflow state.
- Legacy `"IN PROGRESS"` (space) vs workflow `"IN_PROGRESS"` (underscore) both validate; legacy only at creation, workflow everywhere else.
- Non-member assignment rejected at task *and* subtask level; manager reassignment still requires membership.
- Subtask `id` serialization regression covered by test (never the literal string `"undefined"`).
- Board "Add task" from any column still lands in the clicked column (`defaultColumnId`) no matter the created workflow status.
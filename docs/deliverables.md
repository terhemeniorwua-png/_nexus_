# Nexus Deliverables & Reviews (Phase 12)

This document covers the **deliverable submission and review** feature: the versioned deliverable aggregate, multipart file upload, the review lifecycle that mirrors the task workflow, and the task-detail UI that drives it.

Stack note: like the rest of Nexus this is built on **MongoDB + Mongoose** (`docs/database.md`). Three collections are involved — `deliverables` (the aggregate), `deliverableversions` (one per file upload) and `deliverablereviews` (one per decision). Uploaded bytes live on disk (or behind a storage driver), never in MongoDB.

---

## 1. The lifecycle

A deliverable is one aggregate with an append-only version history:

```
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED          (terminal)
                             └──→ CHANGES_REQUESTED → (new DRAFT version)
```

- The **deliverable** carries the current state of the aggregate; each **version** carries the state of one file.
- The rules live in `VERSION_TRANSITIONS` in `backend/src/services/deliverable.service.js` — the version state machine is a plain map, and a version can never jump `DRAFT → APPROVED`.
- `CHANGES_REQUESTED` is **not** an edit: it records a review against the version that was judged, and the submitter uploads a **new version** alongside it. v1 stays byte-for-byte unchanged, so the audit trail survives every round.

### Task-status mirror

Every deliverable move also moves the owning task, through Phase 10's `transitionTaskStatus` — never a second copy of the workflow rules (`TASK_STATUS_FOR_DELIVERABLE`):

| Deliverable / version state | Task becomes |
| --- | --- |
| `DRAFT` | `IN_PROGRESS` |
| `SUBMITTED` | `SUBMITTED` |
| `UNDER_REVIEW` | `UNDER_REVIEW` |
| `CHANGES_REQUESTED` | `CHANGES_REQUESTED` |
| `APPROVED` | `APPROVED` |

Two extra guards ride on top:

- **Submitting requires work in progress.** `IN_PROGRESS` is the only task status from which a deliverable may be submitted (`ASSIGNED` answers *"Start the task before submitting a deliverable"*).
- **Approving requires finished subtasks.** The Phase 11 `assertSubtasksCompleteForApproval` precondition is reused, so a deliverable can never be approved at 70% of the work.

### `currentVersion` vs `approvedVersion`

They are separate fields on purpose. `currentVersion` is the latest upload; `approvedVersion` is the last version that reached `APPROVED` (`null` until the first approval). No new version may be created once the deliverable is approved, so they only diverge while changes are being requested — and "latest" can never be mistaken for "approved".

---

## 2. Aggregate & storage model

| Document | Key fields | Notes |
| --- | --- | --- |
| `deliverables` | `taskId` (**unique**), `workspaceId`, `projectId`, `createdBy`, `title`, `status`, `currentVersion`, `approvedVersion` | One per task. The unique index on `taskId` *is* the concurrency guard for creation. |
| `deliverableversions` | `deliverableId`, `versionNumber`, `status`, `description`, `fileName`, `storageKey`, `fileUrl`, `fileSize`, `mimeType`, `checksum`, `submittedBy/At`, `reviewedAt` | Append-only. Unique on `(deliverableId, versionNumber)`. |
| `deliverablereviews` | `deliverableId`, `deliverableVersionId`, `versionNumber`, `reviewerId`, `decision`, `feedback`, `reviewedAt` | Append-only. Unique on `(deliverableVersionId, reviewerId)`. |

`workspaceId` / `projectId` on the deliverable are denormalized from the task → project → workspace chain: list queries never need a join, and they are never the authorization source of truth (that is always the live chain).

`fileUrl` is **never a filesystem path**. It is the API route that serves the file *after* authorization, so it is safe to hand to a client; `storageKey` (the real path) never leaves the server.

### File storage

`backend/src/services/storage.service.js` owns the bytes. Files are written under `UPLOAD_DIR` with a generated, collision-proof key:

```
deliverables/<workspaceId>/<projectId>/<deliverableId>/v<versionNumber>-<16 hex chars><ext>
```

- Uploads arrive in **memory** (`multer.memoryStorage`) so validation happens before anything touches the disk.
- Validation order: file present → size (`DELIVERABLE_MAX_FILE_SIZE`, default **10 MiB**) → MIME allowlist (`DELIVERABLE_ALLOWED_MIME_TYPES`, exact matches, no wildcards) → **magic bytes**. Text-like types (`text/plain`, `text/csv`, `text/markdown`, `text/html`, `application/json`) are exempt from the signature check; everything else must actually look like what it claims, so a `.pdf` renamed to `.png` is rejected.
- Names are sanitized (directory components and traversal stripped, control characters dropped, conservative charset), but the stored name is still server-generated.
- `UPLOAD_DRIVER` is the seam for object storage later; anything other than `local` fails loudly rather than writing to the wrong place.

---

## 3. API

Global routes are mounted in `app.js` before the task routes (`deliverableGlobal.route.js`); task-scoped routes live in `task.route.js`.

| Method & path | Permission | Notes |
| --- | --- | --- |
| `GET /api/tasks/:taskId/deliverable` | `view_deliverable` | The task's deliverable with its full history, or `{ deliverable: null }`. |
| `POST /api/tasks/:taskId/deliverables` | `create_deliverable` | multipart: `file` (required), `title`, `description`, `submit`. Creates the aggregate + v1. A second deliverable for the same task is **409**. |
| `GET /api/deliverables/:deliverableId` | `view_deliverable` | Aggregate + history. |
| `GET /api/deliverables/:deliverableId/versions` | `view_deliverable` | Chronological versions + reviews. |
| `POST /api/deliverables/:deliverableId/versions` | `create_deliverable_version` | multipart: `file`, `description`. Only after `CHANGES_REQUESTED`; always lands as a `DRAFT`. |
| `GET /api/deliverables/:deliverableId/versions/:versionNumber` | `view_deliverable` | One version with its reviews. |
| `GET /api/deliverables/:deliverableId/versions/:versionNumber/download` | `view_deliverable` | Streams the file with a sanitized `Content-Disposition`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`. |
| `PATCH /api/deliverables/:deliverableId/versions/:versionNumber` | `upload_deliverable` | Edits a draft's description. Anything past `DRAFT` is frozen. |
| `PATCH .../versions/:versionNumber/submit` | `submit_deliverable` | `DRAFT → SUBMITTED`. |
| `PATCH .../versions/:versionNumber/review` | `review_deliverable` | `SUBMITTED → UNDER_REVIEW`. |
| `PATCH .../versions/:versionNumber/approve` | `approve_deliverable` | `UNDER_REVIEW → APPROVED` (subtasks must be complete). |
| `PATCH .../versions/:versionNumber/request-changes` | `request_deliverable_changes` | `UNDER_REVIEW → CHANGES_REQUESTED`; feedback ≥ 10 characters. |
| `GET /api/workspaces/:workspaceId/projects/:projectId/deliverables` | `view_deliverable` | Project list, latest version inlined, no N+1. |

### Authorization

`deliverableAccess` resolves Deliverable → Task → Project → Workspace and applies the Phase 9 access model *before* any handler runs, so a deliverable id from another project is a plain **404**, never a 403 that would confirm it exists. It is attached **per route**, not with `router.use`: a `use` middleware runs before Express has matched the route, so `req.params` is still empty.

On top of the project permission each route asks for, the service enforces:

- **Ownership before state.** `submit`, `startReview`, `decide` and `createNextVersion` check who you are *before* the state machine, so an unauthorized caller cannot learn a version's current status from an error message.
- **Submitter-only.** Only the task's assignee, its creator, or someone with `assign_task` may submit or upload a new version.
- **No self-review.** A reviewer can never decide on a version they submitted — unconditional, with no admin bypass (§38).

### Response shape

Every deliverable response has the same envelope, so a client never has to diff two lists to learn what changed:

```js
{ success: true,
  deliverable: { id, taskId, projectId, title, status, currentVersion, approvedVersion,
                 versionCount, createdBy, currentVersionData, approvedVersionData, versions: [...] },
  versions: [ { versionNumber, status, fileName, fileSize, mimeType, checksum, downloadUrl,
                submittedBy, submittedAt, reviewedAt, isCurrent, isApproved, reviews: [...] } ],
  version: <the version this request acted on, or null>,
  task: { id, status, title } | null,
  decision?: "APPROVED" | "CHANGES_REQUESTED", review?: { ... } }
```

### Side effects

- **Activity** (`targetType: "deliverable"`, `targetId` = the deliverable, version in metadata): `DELIVERABLE_CREATED`, `DELIVERABLE_SUBMITTED`, `DELIVERABLE_REVIEW_STARTED`, `DELIVERABLE_VERSION_CREATED`, `DELIVERABLE_APPROVED`, `DELIVERABLE_CHANGES_REQUESTED`.
- **Notifications**: the reviewer set is notified when work is submitted or a new version arrives; the submitter is notified on every decision, with the reviewer's feedback in the body.
- **Socket**: each move publishes a task update to the project board room, so the card moves without a refresh.
- **Cascade**: deleting a task deletes its deliverable, its versions and its reviews (`deleteTaskDeliverables`, shared by the task and board controllers).

---

## 4. Atomicity without transactions

Nexus runs on a standalone MongoDB, so multi-document writes cannot be transactional. `backend/src/services/unitOfWork.service.js` provides `runAtomically`, which:

- uses a real session/transaction when the deployment supports one (replica set), and
- otherwise registers compensating undos (`registerUndo`) that run in reverse order if any step throws, together with compare-and-set guards on the version status so a concurrent decision cannot interleave.

Every multi-write move (create + submit, review, decide, new version) goes through it, including the task-status mirror. Failed uploads are removed from disk, and a duplicate-key race on `(deliverableId, versionNumber)` becomes a **409**, never two v2s.

---

## 5. Permissions

Full matrix in `docs/authorization.md`. New Phase 12 actions: `view_deliverable`, `upload_deliverable`, `create_deliverable`, `submit_deliverable`, `create_deliverable_version`, `review_deliverable`, `approve_deliverable`, `request_deliverable_changes`.

- **PM / workspace owner / admin**: all of them, for every task in the project.
- **MEMBER / COLLABORATOR**: view, and upload/create/submit **only for tasks assigned to them** (enforced by the service, not just the permission).
- **VIEWER**: `view_deliverable` only.

---

## 6. Frontend

- `components/workspace/Deliverables/DeliverablePanel.jsx` — the whole feature surface: the deliverable header with status and `vN of M`, the version history (newest first) with file name, size, submitter, timestamps, per-version review cards, and the actions for the current state (submit, begin review, approve, request changes, new version). Uploads and decisions use the shared `Modal`; errors and confirmations render inline.
- It is task-status aware: submission is only offered while the task is in progress, because the server will only accept it there. Outside that window the upload lands as a `DRAFT` and the user submits it themselves.
- `lib/api.js` — `apiRequest` now passes a `FormData` body through untouched and omits `Content-Type` for it (the browser generates the multipart boundary; setting the header by hand corrupts the request).
- `lib/workspaceApi.js` — `DELIVERABLE_STATUS_META`, `deliverableStatusMeta()`, `DELIVERABLE_ENDPOINTS` (every path in one place), `DELIVERABLE_ACCEPT`, `REVIEWER_ROLES` / `CONTRIBUTOR_ROLES` (mirroring the server matrix), `workflowStatus()` / `canSubmitDeliverable()` (the legacy-status table the server uses), `formatFileSize()`, `formatDateTime()`.
- `app/projects/[projectId]/tasks/[taskId]` — hosts the panel under the subtasks section and refetches the task after every move, so the status badge, progress and deliverable stay in sync.

The server stays the source of truth: buttons are hidden for roles that cannot use them, but every error the API returns is shown rather than swallowed.

---

## 7. Seed & tests

- `npm run db:seed` seeds **4 deliverables / 6 versions / 3 reviews** covering every state, and writes real placeholder files through the storage service so a seeded demo can download them: rework after changes (`Auth flow specification`: v1 changes requested → v2 submitted), a draft never submitted (`Module router refactor notes`), changes requested then approved (`Login form UI`: v2 approved, `approvedVersion: 2`), and a review in flight (`Type scale proposal`). Task statuses mirror their deliverable exactly, and the seeded task list keeps the Phase 11 progress figures intact.
- `backend/test/deliverables.test.js` (**21 tests**): the happy path end to end, transition guards, draft editing, the description/file freeze after submission, self-review refusal, ownership, feedback length, the duplicate-deliverable and concurrent-version 409s, compensation on failure, upload validation (size, MIME, magic bytes, traversal names), and a real download streamed back from disk.
- `backend/test/authz.test.js` (**23 tests**) covers the Phase 12 endpoints from the permission side (401/403, cross-project 404, viewer read-only, member scoped to their own tasks).
- **Full backend suite: 173/173 pass** (`cd backend && npm test`); ESLint clean on both sides; `next build` green.

---

## 8. Edge cases handled

- A second deliverable for the same task is **409** (unique `taskId`), and two concurrent "next version" requests produce one v2 and one **409** (unique `(deliverableId, versionNumber)`).
- A file whose extension lies about its content is rejected by the magic-byte check; a rejected upload leaves nothing on disk.
- Requesting changes never mutates the reviewed version — the file, description, submitter and timestamps of v1 are unchanged after v2 exists.
- Approval is refused while any subtask is open, and the deliverable is frozen afterwards ("approved work is final").
- Reviewer feedback is mandatory (≥ 10 characters) on a change request, so the submitter is never handed an empty verdict.
- Nobody can review their own submission, and a caller without permission never learns the version's status.
- A rejected transition (e.g. submitting an already-submitted version) answers **400** without side effects: no activity row, no notification, no task move.
- Version numbers are server-computed; a client-sent number is ignored.
- `router.use` runs before route params exist, so `deliverableAccess` is attached per route — a detail that otherwise 404s every deliverable route.

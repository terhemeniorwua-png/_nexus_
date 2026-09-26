"use strict";

const mongoose = require("mongoose");
const Task = require("../models/task.model");
const Project = require("../models/project.model");
const User = require("../models/user.model");
const ProjectMember = require("../models/projectMember.model");
const BoardColumn = require("../models/boardColumn.model");
const { ensureDefaultColumns } = require("./board.service");
const { hasProjectPermission } = require("../permissions/permissions");
const { ApiError } = require("../middleware/errorHandler");
const {
  taskProgress,
  subtaskWeightSummary,
  assertSubtasksCompleteForApproval,
} = require("./progress.service");

const {
  WORKFLOW_STATUSES,
  PRIORITY_MAP,
  SUBTASK_STATUSES,
} = Task;

// ---------------------------------------------------------------------------
// Status workflow — single source of truth for allowed transitions.
// Worker steps (assignee-only) vs. reviewer steps (PM / derived owner+admin).
// ---------------------------------------------------------------------------
const TRANSITION_RULES = {
  "ASSIGNED:IN_PROGRESS": { permission: "update_task", worker: true },
  "IN_PROGRESS:SUBMITTED": { permission: "submit_task", worker: true },
  "SUBMITTED:UNDER_REVIEW": { permission: "review_task", worker: false },
  "UNDER_REVIEW:APPROVED": { permission: "approve_task", worker: false },
  "UNDER_REVIEW:CHANGES_REQUESTED": { permission: "request_task_changes", worker: false },
  "CHANGES_REQUESTED:IN_PROGRESS": { permission: "update_task", worker: true },
};

// Legacy board statuses accepted on task creation map into the workflow so
// every task starts (or resumes) in a governed workflow state.
const LEGACY_STATUS_TO_WORKFLOW = {
  "TO DO": "ASSIGNED",
  "IN PROGRESS": "IN_PROGRESS",
  REVIEW: "SUBMITTED",
  DONE: "APPROVED",
  BLOCKED: "ASSIGNED",
};

function isWorkflowStatus(status) {
  return WORKFLOW_STATUSES.includes(status);
}

function canTransition(fromStatus, toStatus) {
  return Boolean(TRANSITION_RULES[`${fromStatus}:${toStatus}`]);
}

/**
 * Normalize an API-supplied priority (case-insensitive) to the canonical
 * uppercase value. Throws 400 on unknown priorities.
 */
function normalizePriority(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const key = String(value).toLowerCase();
  const normalized = PRIORITY_MAP[key];
  if (!normalized) {
    throw new ApiError(400, "Priority must be one of: LOW, MEDIUM, HIGH, URGENT");
  }
  return normalized;
}

function coerceTagArray(tags) {
  if (tags === undefined || tags === null) return undefined;
  const arr = Array.isArray(tags) ? tags : [tags];
  return arr.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
}

function coerceOptionalDate(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, "Due date must be a valid date");
  }
  return d;
}

/**
 * Assert the user may run a status transition for the given task.
 * Throws 400 (invalid/unachieviable transition) or 403 (no permission /
 * not the assignee).
 */
async function assertStatusTransition({ task, toStatus, user, projectRole }) {
  if (!isWorkflowStatus(task.status)) {
    throw new ApiError(
      400,
      `Task "${task.title}" is not in a workflow state (status: ${task.status})`
    );
  }

  const rule = TRANSITION_RULES[`${task.status}:${toStatus}`];
  if (!rule) {
    throw new ApiError(
      400,
      `Invalid status transition ${task.status} → ${toStatus}`
    );
  }

  if (!projectRole || !hasProjectPermission(projectRole, rule.permission)) {
    throw new ApiError(403, "You do not have permission to perform this action.");
  }

  if (rule.worker) {
    if (!task.assignedTo) {
      throw new ApiError(
        403,
        "Assign a project member to the task before starting work"
      );
    }
    if (String(task.assignedTo) !== String(user._id)) {
      throw new ApiError(
        403,
        "Only the assigned member can move this task between work states"
      );
    }
  }

  return { allowed: true, permission: rule.permission, worker: rule.worker };
}

/**
 * Deliverable-aware task states (Phase 12).
 *
 * A task and its deliverable share one state machine: the task's review phase
 * always mirrors the current deliverable version. This map is what makes
 * "Task = APPROVED while Deliverable = CHANGES_REQUESTED" impossible (§33) —
 * both the task status endpoint and the deliverable service consult it.
 */
const DELIVERABLE_COMPATIBLE_STATUSES = {
  ASSIGNED: [],
  IN_PROGRESS: ["DRAFT", "CHANGES_REQUESTED"],
  SUBMITTED: ["SUBMITTED"],
  UNDER_REVIEW: ["UNDER_REVIEW"],
  CHANGES_REQUESTED: ["CHANGES_REQUESTED"],
  APPROVED: ["APPROVED"],
};

/**
 * Reject a task move that would contradict the task's deliverable. `source:
 * "deliverable"` means the deliverable workflow itself is driving this change,
 * so the check is skipped (it updates both records in one unit of work).
 */
function assertTaskDeliverableConsistency({ deliverable, toStatus, source = "task" }) {
  if (!deliverable) return;
  if (source === "deliverable") return;

  const allowed = DELIVERABLE_COMPATIBLE_STATUSES[toStatus] || [];
  if (allowed.includes(deliverable.status)) return;

  const hint = allowed.length
    ? `Resolve the open deliverable (currently ${deliverable.status}) first`
    : "Remove the task's deliverable before moving it back to Assigned";

  throw new ApiError(
    400,
    `Cannot move the task to ${toStatus} while its deliverable is ${deliverable.status}. ${hint}.`
  );
}

/**
 * Apply a workflow transition once it has been authorized. Shared by the HTTP
 * status endpoint (Phase 10) and the deliverable service (Phase 12) so the two
 * paths can never drift, and so the Phase 11 approval precondition applies to
 * both.
 */
async function transitionTaskStatus({
  task,
  toStatus,
  user,
  projectRole,
  session = null,
  deliverable = null,
  source = "task",
  requireCompleteSubtasks = true,
}) {
  await assertStatusTransition({ task, toStatus, user, projectRole });

  // Phase 11: approval is the task's completion state, so it requires the work
  // to be done. An APPROVED task with open subtasks would report progress
  // < 100 and contradict itself.
  if (toStatus === "APPROVED" && requireCompleteSubtasks) {
    assertSubtasksCompleteForApproval(task);
  }

  assertTaskDeliverableConsistency({ deliverable, toStatus, source });

  const fromStatus = task.status;
  task.status = toStatus;
  if (session) {
    await task.save({ session });
  } else {
    await task.save();
  }

  return { task, fromStatus, toStatus };
}

/**
 * Validate that a user may be assigned work on a project. A user is eligible
 * when they themselves have project access: a ProjectMember row, the
 * project's manager, or a workspace owner/admin (derived project access).
 * Throws 400 when the user is not eligible.
 */
async function assertAssigneeInProject({ assigneeId, project }) {
  if (!assigneeId) return;

  if (!mongoose.isValidObjectId(String(assigneeId))) {
    throw new ApiError(400, "Assignee must be a valid user");
  }

  if (project.managerId && String(project.managerId) === String(assigneeId)) {
    return;
  }

  const membership = await ProjectMember.findOne({
    projectId: project._id,
    userId: assigneeId,
  });

  if (membership) return;

  // Workspace owner / admin have derived access to every project in the
  // workspace, so they are also assignable.
  const assigneeUser = await User.findById(assigneeId).select("_id");
  if (!assigneeUser) throw new ApiError(404, "Assignee not found");

  const WorkspaceMember = require("../models/workspaceMember.model");
  const Workspace = require("../models/workspace.model");
  const workspace = await Workspace.findById(project.workspaceId).select("ownerId _id");
  if (!workspace) throw new ApiError(404, "Workspace not found");
  if (String(workspace.ownerId) === String(assigneeId)) return;

  const wsRow = await WorkspaceMember.findOne({
    workspaceId: workspace._id,
    userId: assigneeId,
  });
  if (wsRow && wsRow.role === "Admin") return;

  throw new ApiError(400, "Assignee must be a member of this project");
}

/**
 * Resolve the set of users who may be assigned work in a project:
 * project members (ProjectMember rows), the project manager, and for
 * owners/admins the whole workspace membership is considered eligible.
 * Returns user docs { id, name, email }.
 */
async function getAssignableUsers({ project, isOwner = false, workspaceMemberRole = null, workspace = null }) {
  const userIds = new Set(
    project.managerId ? [String(project.managerId)] : []
  );

  const rows = await ProjectMember.find({ projectId: project._id }).select("userId").lean();
  rows.forEach((r) => userIds.add(String(r.userId)));

  if ((isOwner || workspaceMemberRole === "Admin") && workspace) {
    const WorkspaceMember = require("../models/workspaceMember.model");
    const wsRows = await WorkspaceMember.find({ workspaceId: workspace._id }).select("userId").lean();
    wsRows.forEach((r) => userIds.add(String(r.userId)));
    if (workspace.ownerId) userIds.add(String(workspace.ownerId));
  }

  const users = await User.find({ _id: { $in: [...userIds] } })
    .select("name email")
    .sort({ name: 1 })
    .lean();

  return users.map((u) => ({ id: String(u._id), name: u.name, email: u.email }));
}

function getSubtaskStatusFromCompleted(completed) {
  return completed ? "COMPLETED" : "TODO";
}

/**
 * Build the enriched API representation of a task. Expects tasks where
 * `assignedTo` may be an ObjectId or a populated User doc.
 */
function serializeTask(task) {
  const raw = task.toJSON ? task.toJSON() : task;
  const rawAssignee = raw.assignedTo && typeof raw.assignedTo === "object" ? raw.assignedTo : null;
  const assignee = rawAssignee && (rawAssignee._id || rawAssignee.id)
    ? {
        id: String(rawAssignee._id || rawAssignee.id),
        name: rawAssignee.name,
        email: rawAssignee.email,
      }
    : null;
  const assigneeId = rawAssignee
    ? String(rawAssignee._id || rawAssignee.id)
    : raw.assignedTo
      ? String(raw.assignedTo)
      : null;

  const subtasks = (raw.subtasks || []).map((s) => ({
    id: s ? String(s._id || s.id) : "",
    title: s.title,
    description: s.description || "",
    completed: s.status === "COMPLETED" || Boolean(s.completed),
    status: s.status || getSubtaskStatusFromCompleted(s.completed),
    assigneeId: s.assigneeId ? String(s.assigneeId) : null,
    assignee: null,
    dueDate: hasDueDateValue(s.dueDate) ? new Date(s.dueDate).toISOString() : null,
    weight: Number(s.weight) || 0,
  }));

  return {
    id: String(raw.id),
    projectId: String(raw.projectId),
    workspaceId: String(raw.workspaceId || (raw.project && raw.project.workspaceId) || ""),
    title: raw.title,
    description: raw.description || "",
    priority: raw.priority || "MEDIUM",
    status: raw.status,
    position: Number(raw.position) || 0,
    dueDate: hasDueDateValue(raw.dueDate) ? new Date(raw.dueDate).toISOString() : null,
    tags: raw.tags || [],
    assignedTo: assigneeId,
    assignee,
    subtasks,
    // Phase 11: `progress` is always a number (0-100) and is derived, never
    // read from the request. `weights` lets the UI show the weight allocation
    // (total / remaining) without recomputing anything.
    progress: taskProgress(raw),
    weights: subtaskWeightSummary(raw.subtasks || []),
    createdBy: raw.createdBy ? String(raw.createdBy) : null,
    createdAt: new Date(raw.createdAt || Date.now()).toISOString(),
  };
}

function hasDueDateValue(value) {
  return Boolean(value) && !Number.isNaN(new Date(value).getTime());
}

/**
 * Validation + creation of a task (shared by board and global routes).
 * Status is normalized into the workflow (default ASSIGNED); arbitrary
 * workflow statuses can never be set at creation.
 */
async function createTaskData({ project, workspaceId, data, createdBy }) {
  const title = typeof data.title === "string" ? data.title.trim() : data.title;
  if (!title) throw new ApiError(400, "Task title is required");
  if (title.length > 300) throw new ApiError(400, "Task title cannot exceed 300 characters");

  const status = normalizeCreationStatus(data.status);
  const priority = normalizePriority(data.priority) || "MEDIUM";

  let assignee = data.assigneeId ?? data.assignedTo ?? null;
  if (assignee !== null && assignee !== undefined) {
    if (typeof assignee === "object") assignee = assignee.id || assignee._id;
    await assertAssigneeInProject({ assigneeId: assignee, project });
  }

  const columnId = await resolveDefaultColumn(project._id);
  const position = await getNextPosition(columnId);

  const task = await Task.create({
    projectId: project._id,
    workspaceId,
    columnId,
    title,
    description: typeof data.description === "string" ? data.description.trim() : "",
    assignedTo: assignee || null,
    status,
    priority,
    position,
    dueDate: coerceOptionalDate(data.dueDate) || null,
    tags: coerceTagArray(data.tags) || [],
    createdBy,
  });

  return task;
}

function normalizeCreationStatus(status) {
  if (status) {
    const key = String(status).toUpperCase();
    // A task may be created directly into the first two workflow states
    // (e.g. dropped straight onto an "In Progress" column); every later state
    // (SUBMITTED / UNDER_REVIEW / APPROVED / CHANGES_REQUESTED) must be
    // reached through the workflow — no creating an already-approved task.
    if (key === "IN PROGRESS") return "IN_PROGRESS";
  }
  return "ASSIGNED";
}

async function resolveDefaultColumn(projectId) {
  let columns = await BoardColumn.find({ projectId }).sort({ position: 1 });
  if (columns.length === 0) {
    await ensureDefaultColumns(projectId);
    columns = await BoardColumn.find({ projectId }).sort({ position: 1 });
  }
  if (!columns.length) {
    throw new ApiError(500, "Project has no board columns configured");
  }
  return columns[0]._id;
}

function getNextPosition(columnId) {
  return Task.countDocuments({ columnId });
}

// ---------------------------------------------------------------------------
// Subtasks (embedded subdocuments)
// ---------------------------------------------------------------------------
function findSubtaskIndex(task, subtaskId) {
  if (!mongoose.isValidObjectId(String(subtaskId))) {
    throw new ApiError(404, "Subtask not found");
  }
  const index = (task.subtasks || []).findIndex((s) => String(s._id) === String(subtaskId));
  if (index === -1) throw new ApiError(404, "Subtask not found");
  return index;
}

/**
 * Validate subtask payload against the embedded schema; returns the final
 * (normalized) values for the caller to assign. Throws 400 on invalid input.
 */
/**
 * Validate a subtask payload. Returns an object containing ONLY the fields the
 * caller explicitly supplied (validated + normalized), so it works for both
 * create (every field present) and partial updates. Throws 400 on invalid.
 */
async function validateSubtaskFields({ data, project }) {
  const out = {};

  if (data.title !== undefined) {
    const title = typeof data.title === "string" ? data.title.trim() : data.title;
    if (!title) throw new ApiError(400, "Subtask title is required");
    if (title.length > 300) throw new ApiError(400, "Subtask title cannot exceed 300 characters");
    out.title = title;
  }

  if (data.description !== undefined) {
    const description =
      typeof data.description === "string" ? data.description.trim() : String(data.description || "");
    if (description.length > 4000) throw new ApiError(400, "Subtask description cannot exceed 4000 characters");
    out.description = description;
  }

  let status = data.status;
  if (status === undefined && data.completed !== undefined) {
    status = data.completed ? "COMPLETED" : "TODO";
  }
  if (status !== undefined) {
    const normalizedStatus = String(status).toUpperCase() === "COMPLETE" ? "COMPLETED" : String(status).toUpperCase();
    if (!SUBTASK_STATUSES.includes(normalizedStatus)) {
      throw new ApiError(400, "Subtask status must be TODO, IN_PROGRESS, or COMPLETED");
    }
    out.status = normalizedStatus;
  }

  if (data.assigneeId !== undefined && data.assigneeId !== null) {
    let assigneeId = data.assigneeId;
    if (typeof assigneeId === "object") assigneeId = assigneeId.id || assigneeId._id;
    await assertAssigneeInProject({ assigneeId, project });
    out.assigneeId = String(assigneeId);
  } else if (data.assigneeId !== undefined) {
    out.assigneeId = null;
  }

  if (data.dueDate !== undefined) {
    const due = data.dueDate === null || data.dueDate === "" ? null : coerceOptionalDate(data.dueDate);
    if (due === undefined) throw new ApiError(400, "Subtask due date must be a valid date");
    out.dueDate = due;
  }

  if (data.weight !== undefined) {
    const w = Number(data.weight);
    if (!Number.isFinite(w) || w < 0 || w > 100) {
      throw new ApiError(400, "Subtask weight must be between 0 and 100");
    }
    out.weight = w;
  }

  return out;
}

function serializeSubtask(subtask) {
  return {
    id: String(subtask._id),
    title: subtask.title,
    description: subtask.description || "",
    completed: subtask.status === "COMPLETED" || Boolean(subtask.completed),
    status: subtask.status || "TODO",
    assigneeId: subtask.assigneeId ? String(subtask.assigneeId) : null,
    assignee: null,
    dueDate: hasDueDateValue(subtask.dueDate) ? new Date(subtask.dueDate).toISOString() : null,
    weight: Number(subtask.weight) || 0,
  };
}

module.exports = {
  WORKFLOW_STATUSES,
  SUBTASK_STATUSES,
  TRANSITION_RULES,
  LEGACY_STATUS_TO_WORKFLOW,
  isWorkflowStatus,
  canTransition,
  transitionTaskStatus,
  assertTaskDeliverableConsistency,
  DELIVERABLE_COMPATIBLE_STATUSES,
  normalizePriority,
  coerceTagArray,
  coerceOptionalDate,
  assertStatusTransition,
  assertAssigneeInProject,
  getAssignableUsers,
  serializeTask,
  createTaskData,
  normalizeCreationStatus,
  findSubtaskIndex,
  validateSubtaskFields,
  serializeSubtask,
};
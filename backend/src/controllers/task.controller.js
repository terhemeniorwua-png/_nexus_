"use strict";

const mongoose = require("mongoose");
const Task = require("../models/task.model");
const Deliverable = require("../models/deliverable.model");
const Review = require("../models/review.model");
const Comment = require("../models/comment.model");
const { ApiError } = require("../middleware/errorHandler");
const { hasProjectPermission } = require("../permissions/permissions");
const { recordActivity } = require("../services/activity.service");
const { createNotification } = require("../services/notification.service");
const { reindexColumn } = require("../services/board.service");
const { getIO } = require("../sockets/store");
const {
  assertStatusTransition,
  assertAssigneeInProject,
  createTaskData,
  serializeTask,
  findSubtaskIndex,
  validateSubtaskFields,
  serializeSubtask,
  normalizePriority,
  coerceTagArray,
  coerceOptionalDate,
} = require("../services/task.service");
const { boardRoom } = require("./board.controller");
const {
  assertWeightTotalWithinLimit,
  assertSubtasksCompleteForApproval,
  assertApprovedTaskStaysComplete,
  taskProgress,
  subtaskWeightSummary,
} = require("../services/progress.service");

function taskLink(req, task) {
  return `/projects/${String(req.project._id)}/tasks/${String(task._id)}`;
}

async function publishTaskEmit(event, req, task) {
  const populated = await Task.findById(task._id).populate("assignedTo", "name email avatar");
  getIO()?.to(boardRoom(req.project._id)).emit(event, { task: populated });
}

async function recordTaskActivity(req, task, action, metadata = {}) {
  await recordActivity({
    workspaceId: req.workspace._id,
    projectId: req.project._id,
    userId: req.user._id,
    action,
    targetType: "task",
    targetId: task._id,
    metadata: { title: task.title, projectId: req.project._id, projectName: req.project.name, ...metadata },
  });
}

// ---------------------------------------------------------------------------
// List / create — project-scoped (mounted on /api/projects/:projectId/tasks)
// ---------------------------------------------------------------------------
async function listProjectTasks(req, res, next) {
  try {
    const query = { projectId: req.project._id };
    const { status, priority, assigneeId } = req.query;

    if (status && status !== "ALL") {
      if (!Task.STATUSES.includes(status)) {
        return next(new ApiError(400, "Unknown task status filter"));
      }
      query.status = status;
    }
    if (priority && priority !== "ALL") {
      const normalized = normalizePriority(priority);
      query.priority = normalized;
    }
    if (assigneeId && assigneeId !== "ALL") {
      if (!mongoose.isValidObjectId(assigneeId)) {
        return next(new ApiError(400, "Invalid assignee filter"));
      }
      query.assignedTo = assigneeId;
    }

    const tasks = await Task.find(query)
      .sort({ priority: -1, position: 1, updatedAt: -1 })
      .populate("assignedTo", "name email avatar");

    const assignableMembers = await getAssignables(req);

    res.json({
      success: true,
      count: tasks.length,
      tasks: tasks.map((t) => serializeTask(t)),
      assignableMembers,
    });
  } catch (error) {
    next(error);
  }
}

async function getAssignables(req) {
  const { getAssignableUsers } = require("../services/task.service");
  return getAssignableUsers({
    project: req.project,
    isOwner: Boolean(req.isOwner),
    workspaceMemberRole: req.memberRole,
    workspace: req.workspace,
  });
}

async function createProjectTask(req, res, next) {
  try {
    const task = await createTaskData({
      project: req.project,
      data: req.body,
      createdBy: req.user._id,
    });

    await recordTaskActivity(req, task, "TASK_CREATED");

    if (task.assignedTo) {
      await createNotification({
        userId: task.assignedTo,
        actorId: req.user._id,
        workspaceId: req.workspace._id,
        type: "TASK_ASSIGNED",
        title: `${req.user.name} assigned you a task`,
        body: task.title,
        link: taskLink(req, task),
      });
    }

    await publishTaskEmit("task:created", req, task);

    const assignableMembers = await getAssignables(req);
    res.status(201).json({
      success: true,
      task: serializeTask(await Task.findById(task._id).populate("assignedTo", "name email avatar")),
      assignableMembers,
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Task detail routes (mounted on /api/tasks/:taskId)
// ---------------------------------------------------------------------------
async function getTask(req, res, next) {
  try {
    const task = await Task.findById(req.task._id).populate("assignedTo", "name email avatar");
    res.json({ success: true, task: serializeTask(task) });
  } catch (error) {
    next(error);
  }
}

async function updateTaskDetails(req, res, next) {
  try {
    const task = req.task;
    const { title, description, priority, dueDate, tags, assignedTo } = req.body;

    if (title !== undefined) {
      if (!String(title).trim()) return next(new ApiError(400, "Task title cannot be empty"));
      task.title = String(title).trim();
    }
    if (description !== undefined) task.description = String(description);
    if (priority !== undefined) task.priority = normalizePriority(priority);
    if (dueDate !== undefined) task.dueDate = coerceOptionalDate(dueDate) || null;
    if (tags !== undefined) task.tags = coerceTagArray(tags) || [];

    // Reassignment requires assign_task (owner/admin/PM). Validate that the
    // new assignee has project access before persisting.
    if (assignedTo !== undefined && hasProjectPermission(req.projectRole, "assign_task")) {
      const nextAssignee = assignedTo ? String(assignedTo) : null;
      if (nextAssignee) {
        await assertAssigneeInProject({
          assigneeId: nextAssignee,
          project: req.project,
        });
      }
      task.assignedTo = nextAssignee;
    }

    await task.save();
    await recordTaskActivity(req, task, "TASK_UPDATED");

    const newAssignee = task.assignedTo ? String(task.assignedTo) : null;
    if (newAssignee && newAssignee !== String(req.user._id)) {
      await createNotification({
        userId: task.assignedTo,
        actorId: req.user._id,
        workspaceId: req.workspace._id,
        type: "TASK_ASSIGNED",
        title: `${req.user.name} assigned you a task`,
        body: task.title,
        link: taskLink(req, task),
      });
    }

    await publishTaskEmit("task:updated", req, task);
    res.json({ success: true, task: serializeTask(await Task.findById(task._id).populate("assignedTo", "name email avatar")) });
  } catch (error) {
    next(error);
  }
}

async function deleteTask(req, res, next) {
  try {
    const task = req.task;

    // Cascade: deliverables of the task, reviews of those deliverables, and
    // comments on the task. Subtasks are embedded so they die with the task.
    const deliverables = await Deliverable.find({ taskId: task._id }).distinct("_id");
    if (deliverables.length) {
      await Review.deleteMany({ deliverableId: { $in: deliverables } });
      await Deliverable.deleteMany({ _id: { $in: deliverables } });
    }
    await Comment.deleteMany({ taskId: task._id });

    await Task.deleteOne({ _id: task._id });
    await reindexColumn(task.columnId);

    await recordTaskActivity(req, task, "TASK_DELETED");

    getIO()?.to(boardRoom(req.project._id)).emit("task:deleted", { taskId: String(task._id) });
    res.json({ success: true, message: "Task deleted" });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Status workflow (PATCH /api/tasks/:taskId/status)
// ---------------------------------------------------------------------------
async function changeTaskStatus(req, res, next) {
  try {
    const task = req.task;
    const toStatus = String(req.body.status || "").toUpperCase();

    if (!Task.WORKFLOW_STATUSES.includes(toStatus)) {
      return next(new ApiError(400, "Unknown task status"));
    }

    await assertStatusTransition({
      task,
      toStatus,
      user: req.user,
      projectRole: req.projectRole,
    });

    // Phase 11: approval is the task's completion state, so it requires the
    // work to be done. An APPROVED task with open subtasks would report
    // progress < 100 and contradict itself.
    if (toStatus === "APPROVED") {
      assertSubtasksCompleteForApproval(task);
    }

    const fromStatus = task.status;
    task.status = toStatus;
    await task.save();

    const activityAction =
      toStatus === "IN_PROGRESS"
        ? "TASK_STARTED"
        : toStatus === "APPROVED"
          ? "TASK_COMPLETED"
          : "TASK_UPDATED";
    await recordTaskActivity(req, task, activityAction, { fromStatus, toStatus });

    if ((toStatus === "APPROVED" || toStatus === "CHANGES_REQUESTED") && task.assignedTo) {
      await createNotification({
        userId: task.assignedTo,
        actorId: req.user._id,
        workspaceId: req.workspace._id,
        type: "TASK_STATUS_CHANGED",
        title: toStatus === "APPROVED" ? "Your task was approved" : "Changes requested on your task",
        body: task.title,
        link: taskLink(req, task),
      });
    }

    await publishTaskEmit("task:updated", req, task);
    res.json({
      success: true,
      message: `Task moved from ${fromStatus} to ${toStatus}`,
      task: serializeTask(await Task.findById(task._id).populate("assignedTo", "name email avatar")),
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Subtasks (embedded within the owning task)
// ---------------------------------------------------------------------------
async function listSubtasks(req, res, next) {
  try {
    const task = req.task;
    res.json({
      success: true,
      subtasks: task.subtasks.map((s) => serializeSubtask(s)),
      progress: taskProgress(task),
      weights: subtaskWeightSummary(task.subtasks),
    });
  } catch (error) {
    next(error);
  }
}

async function createSubtask(req, res, next) {
  try {
    const task = req.task;
    const fields = await validateSubtaskFields({
      data: req.body,
      project: req.project,
    });

    if (!fields.title) return next(new ApiError(400, "Subtask title is required"));

    task.subtasks.push({
      title: fields.title,
      description: fields.description ?? "",
      status: fields.status ?? "TODO",
      assigneeId: fields.assigneeId ?? null,
      dueDate: fields.dueDate ?? null,
      weight: fields.weight ?? 0,
    });

    // Phase 11: a task's weights may never total more than 100.
    assertWeightTotalWithinLimit(task.subtasks);

    // Phase 11: a new TODO subtask would silently un-complete an approved task.
    assertApprovedTaskStaysComplete(task);

    await task.save();

    const created = task.subtasks[task.subtasks.length - 1];
    await recordTaskActivity(req, task, "TASK_UPDATED", { subtask: created.title });

    await publishTaskEmit("task:updated", req, task);

    res.status(201).json({
      success: true,
      subtask: serializeSubtask(created),
      progress: taskProgress(task),
      weights: subtaskWeightSummary(task.subtasks),
    });
  } catch (error) {
    next(error);
  }
}

async function getSubtask(req, res, next) {
  try {
    res.json({ success: true, subtask: serializeSubtask(req.subtask) });
  } catch (error) {
    next(error);
  }
}

async function updateSubtask(req, res, next) {
  try {
    const task = req.task;
    const index = findSubtaskIndex(task, req.params.subtaskId);
    const subtask = task.subtasks[index];

    const fields = await validateSubtaskFields({
      data: req.body,
      project: req.project,
    });

    if (fields.title !== undefined) subtask.title = fields.title;
    if (fields.description !== undefined) subtask.description = fields.description;
    if (fields.status !== undefined) subtask.status = fields.status;
    if (fields.assigneeId !== undefined) subtask.assigneeId = fields.assigneeId;
    if (fields.dueDate !== undefined) subtask.dueDate = fields.dueDate;
    if (fields.weight !== undefined) subtask.weight = fields.weight;

    if (subtask.status === "COMPLETED") {
      subtask.completed = true;
    } else if (fields.status !== undefined) {
      subtask.completed = false;
    }

    task.markModified("subtasks");

    // Phase 11: an adjusted weight must keep the combined total ≤ 100.
    assertWeightTotalWithinLimit(task.subtasks);

    // Phase 11: an approved task must stay complete (see progress.service).
    assertApprovedTaskStaysComplete(task);

    await task.save();

    await recordTaskActivity(req, task, "TASK_UPDATED", { subtask: subtask.title });
    await publishTaskEmit("task:updated", req, task);

    res.json({
      success: true,
      subtask: serializeSubtask(subtask),
      progress: taskProgress(task),
      weights: subtaskWeightSummary(task.subtasks),
    });
  } catch (error) {
    next(error);
  }
}

async function deleteSubtask(req, res, next) {
  try {
    const task = req.task;
    const index = findSubtaskIndex(task, req.params.subtaskId);

    const [removed] = task.subtasks.splice(index, 1);
    task.markModified("subtasks");
    await task.save();

    await recordTaskActivity(req, task, "TASK_UPDATED", { removedSubtask: removed.title });
    await publishTaskEmit("task:updated", req, task);

    res.json({
      success: true,
      message: "Subtask deleted",
      progress: taskProgress(task),
      weights: subtaskWeightSummary(task.subtasks),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listProjectTasks,
  createProjectTask,
  getTask,
  updateTaskDetails,
  deleteTask,
  changeTaskStatus,
  listSubtasks,
  createSubtask,
  getSubtask,
  updateSubtask,
  deleteSubtask,
};
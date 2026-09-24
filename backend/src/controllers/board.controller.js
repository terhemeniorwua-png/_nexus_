const Task = require("../models/task.model");
const BoardColumn = require("../models/boardColumn.model");
const Deliverable = require("../models/deliverable.model");
const Review = require("../models/review.model");
const Comment = require("../models/comment.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const mongoose = require("mongoose");
const { ApiError } = require("../middleware/errorHandler");
const { hasProjectPermission } = require("../permissions/permissions");
const { resolveProjectRole } = require("../services/access.service");
const {
  ensureDefaultColumns,
  getBoard,
  getNextPosition,
  moveTask,
  reindexColumn,
} = require("../services/board.service");
const {
  normalizePriority,
  normalizeCreationStatus,
  assertAssigneeInProject,
  coerceOptionalDate,
  coerceTagArray,
} = require("../services/task.service");
const { recordActivity } = require("../services/activity.service");
const { createNotification } = require("../services/notification.service");
const { getIO } = require("../sockets/store");

const boardRoom = (projectId) => `board:${String(projectId)}`;

async function assertProjectInWorkspace(req, projectId) {
  const Project = require("../models/project.model");
  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, "Project not found");
  if (String(project.workspaceId) !== String(req.workspace._id)) {
    throw new ApiError(403, "Project does not belong to this workspace");
  }
  return project;
}

async function resolveMentions(req, text) {
  try {
    const members = await WorkspaceMember.find({ workspaceId: req.workspace._id }).populate("userId", "name");
    const mentioned = members
      .filter((m) => m.userId && m.userId.name)
      .filter((m) => new RegExp(`@${m.userId.name.replace(/\s+/g, "_")}|@${m.userId.name.split(" ")[0]}`, "i").test(String(text)));
    return mentioned.filter((m) => String(m.userId._id) !== String(req.user._id));
  } catch {
    return [];
  }
}

async function getBoardHandler(req, res, next) {
  try {
    await assertProjectInWorkspace(req, req.params.projectId);
    const { columns, tasks } = await getBoard(req.params.projectId);
    res.json({ success: true, columns, tasks });
  } catch (error) {
    next(error);
  }
}

async function createColumn(req, res, next) {
  try {
    const project = await assertProjectInWorkspace(req, req.params.projectId);
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return next(new ApiError(400, "Column name is required"));
    }

    const last = await BoardColumn.findOne({ projectId: project._id }).sort({ position: -1 });
    const column = await BoardColumn.create({
      projectId: project._id,
      name: String(name).trim(),
      position: last ? last.position + 1 : 0,
    });

    getIO()?.to(boardRoom(project._id)).emit("column:created", { column });
    res.status(201).json({ success: true, column });
  } catch (error) {
    next(error);
  }
}

async function updateColumn(req, res, next) {
  try {
    await assertProjectInWorkspace(req, req.params.projectId);

    const column = await BoardColumn.findById(req.params.columnId);
    if (!column) return next(new ApiError(404, "Column not found"));

    const { name } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return next(new ApiError(400, "Column name cannot be empty"));
      column.name = String(name).trim();
    }
    await column.save();

    getIO()?.to(boardRoom(req.params.projectId)).emit("column:updated", { column });
    res.json({ success: true, column });
  } catch (error) {
    next(error);
  }
}

async function deleteColumn(req, res, next) {
  try {
    const project = await assertProjectInWorkspace(req, req.params.projectId);

    const column = await BoardColumn.findById(req.params.columnId);
    if (!column) return next(new ApiError(404, "Column not found"));

    await Task.deleteMany({ columnId: column._id });
    await BoardColumn.deleteOne({ _id: column._id });

    getIO()?.to(boardRoom(project._id)).emit("column:deleted", { columnId: String(column._id) });
    res.json({ success: true, message: "Column deleted" });
  } catch (error) {
    next(error);
  }
}

async function createTask(req, res, next) {
  try {
    const project = await assertProjectInWorkspace(req, req.params.projectId);

    const { title, description, columnId, status, priority, dueDate, tags, assignedTo, subtasks } = req.body;

    if (!title || !String(title).trim()) {
      return next(new ApiError(400, "Task title is required"));
    }

    let targetColumn = columnId ? await BoardColumn.findById(columnId) : null;
    if (!targetColumn || String(targetColumn.projectId) !== String(project._id)) {
      const first = await BoardColumn.findOne({ projectId: project._id }).sort({ position: 1 });
      targetColumn = first || (await BoardColumn.create({ projectId: project._id, name: "TO DO", position: 0 }));
    }

    const position = await getNextPosition(targetColumn._id);

    // Assignment requires assign_task. Without it a new task is never assigned
    // to someone else — it falls back to the creator.
    let effectiveAssignee = assignedTo || null;
    if (
      assignedTo &&
      String(assignedTo) !== String(req.user._id) &&
      !hasProjectPermission(req.projectRole, "assign_task")
    ) {
      effectiveAssignee = req.user._id;
    }

    // Phase 10: statuses normalize into the workflow (e.g. "TO DO" → ASSIGNED)
    // and the assignee must be an eligible project member.
    if (effectiveAssignee) {
      await assertAssigneeInProject({
        assigneeId: effectiveAssignee,
        project,
      });
    }

    const cleanSubtasks = Array.isArray(subtasks)
      ? subtasks
          .filter((s) => s && String(s.title).trim())
          .map((s) => ({
            title: String(s.title).trim(),
            completed: Boolean(s.completed),
            weight: Number(s.weight) > 0 ? Number(s.weight) : 0,
          }))
      : [];

    const task = await Task.create({
      projectId: project._id,
      workspaceId: req.workspace._id,
      columnId: targetColumn._id,
      title: String(title).trim(),
      description: String(description || ""),
      status: normalizeCreationStatus(status),
      priority: normalizePriority(priority) || "MEDIUM",
      position,
      dueDate: coerceOptionalDate(dueDate) || null,
      tags: coerceTagArray(tags) || [],
      subtasks: cleanSubtasks,
      assignedTo: effectiveAssignee,
      createdBy: req.user._id,
    });

    const populated = await Task.findById(task._id).populate("assignedTo", "name email avatar");

    await recordActivity({
      workspaceId: req.workspace._id,
      projectId: project._id,
      userId: req.user._id,
      action: "TASK_CREATED",
      targetType: "task",
      targetId: task._id,
      metadata: { title: task.title, projectId: project._id, projectName: project.name },
    });

    if (task.assignedTo) {
      await createNotification({
        userId: task.assignedTo,
        actorId: req.user._id,
        workspaceId: req.workspace._id,
        type: "TASK_ASSIGNED",
        title: `${req.user.name} assigned you a task`,
        body: task.title,
        link: `/workspaces/${req.workspace._id}/projects/${project._id}/board`,
      });
    }

    getIO()?.to(boardRoom(project._id)).emit("task:created", { task: populated });
    res.status(201).json({ success: true, task: populated });
  } catch (error) {
    next(error);
  }
}

async function updateTask(req, res, next) {
  try {
    const project = await assertProjectInWorkspace(req, req.params.projectId);

    const task = await Task.findById(req.params.taskId);
    if (!task) return next(new ApiError(404, "Task not found"));

    const { title, description, priority, dueDate, tags, subtasks, assignedTo } = req.body;

    if (title !== undefined) {
      if (!String(title).trim()) return next(new ApiError(400, "Task title cannot be empty"));
      task.title = String(title).trim();
    }
    if (description !== undefined) task.description = String(description);
    if (priority !== undefined) task.priority = normalizePriority(priority);
    if (dueDate !== undefined) task.dueDate = coerceOptionalDate(dueDate) || null;
    if (tags !== undefined) task.tags = coerceTagArray(tags) || [];
    if (subtasks !== undefined) task.subtasks = Array.isArray(subtasks) ? subtasks : [];

    // Status is governed exclusively by PATCH /api/tasks/:taskId/status —
    // generic updates never apply a status, which prevents workflow bypass
    // (e.g. jumping straight to APPROVED).
    const previousAssignee = task.assignedTo ? String(task.assignedTo) : null;
    // Reassignment requires the assign_task permission. Do not trust client input.
    if (assignedTo !== undefined && hasProjectPermission(req.projectRole, "assign_task")) {
      const nextAssignee = assignedTo ? String(assignedTo) : null;
      if (nextAssignee) {
        await assertAssigneeInProject({
          assigneeId: nextAssignee,
          project,
        });
      }
      task.assignedTo = nextAssignee;
    }

    await task.save();

    const populated = await Task.findById(task._id).populate("assignedTo", "name email avatar");

    await recordActivity({
      workspaceId: req.workspace._id,
      projectId: project._id,
      userId: req.user._id,
      action: "TASK_UPDATED",
      targetType: "task",
      targetId: task._id,
      metadata: { title: task.title },
    });

    const newAssignee = task.assignedTo ? String(task.assignedTo) : null;
    if (newAssignee && newAssignee !== previousAssignee && newAssignee !== String(req.user._id)) {
      await createNotification({
        userId: task.assignedTo,
        actorId: req.user._id,
        workspaceId: req.workspace._id,
        type: "TASK_ASSIGNED",
        title: `${req.user.name} assigned you a task`,
        body: task.title,
        link: `/workspaces/${req.workspace._id}/projects/${project._id}/board`,
      });
    }

    getIO()?.to(boardRoom(project._id)).emit("task:updated", { task: populated });
    res.json({ success: true, task: populated });
  } catch (error) {
    next(error);
  }
}

async function deleteTask(req, res, next) {
  try {
    const project = await assertProjectInWorkspace(req, req.params.projectId);

    const task = await Task.findById(req.params.taskId);
    if (!task) return next(new ApiError(404, "Task not found"));

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

    await recordActivity({
      workspaceId: req.workspace._id,
      projectId: project._id,
      userId: req.user._id,
      action: "TASK_DELETED",
      targetType: "task",
      targetId: task._id,
      metadata: { title: task.title },
    });

    getIO()?.to(boardRoom(project._id)).emit("task:deleted", { taskId: String(task._id) });
    res.json({ success: true, message: "Task deleted" });
  } catch (error) {
    next(error);
  }
}

async function handleMoveTask(req, res, next) {
  try {
    const project = await assertProjectInWorkspace(req, req.params.projectId);

    const { columnId, position } = req.body;
    if (!columnId) return next(new ApiError(400, "Target column is required"));

    const task = await moveTask(req.params.taskId, columnId, typeof position === "number" ? position : undefined);

    const populated = await Task.findById(task._id).populate("assignedTo", "name email avatar");

    await recordActivity({
      workspaceId: req.workspace._id,
      projectId: project._id,
      userId: req.user._id,
      action: "TASK_MOVED",
      targetType: "task",
      targetId: task._id,
      metadata: { title: task.title, columnId, projectName: project.name },
    });

    getIO()?.to(boardRoom(project._id)).emit("task:moved", { task: populated, actorId: String(req.user._id) });
    res.json({ success: true, task: populated });
  } catch (error) {
    next(error);
  }
}

async function reorderTask(req, res, next) {
  try {
    const { taskId, destinationColumnId, newPosition } = req.body;

    if (!taskId || !destinationColumnId) {
      return next(new ApiError(400, "taskId and destinationColumnId are required"));
    }

    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, "Task not found");

    const Project = require("../models/project.model");
    const project = await Project.findById(task.projectId);
    if (!project) throw new ApiError(404, "Project not found");

    const Workspace = require("../models/workspace.model");
    const workspace = await Workspace.findById(project.workspaceId);
    if (!workspace) throw new ApiError(404, "Workspace not found");

    const isOwner = String(workspace.ownerId) === String(req.user._id);
    const membership = await WorkspaceMember.findOne({
      workspaceId: workspace._id,
      userId: req.user._id,
    });
    if (!membership && !isOwner) {
      throw new ApiError(403, "You do not have access to this workspace");
    }

    const resolved = await resolveProjectRole({
      user: req.user,
      project,
      isOwner,
      workspaceMemberRole: membership ? membership.role : null,
    });
    if (!resolved) {
      throw new ApiError(403, "You do not have access to this project");
    }
    if (!hasProjectPermission(resolved.role, "update_task")) {
      throw new ApiError(403, "You do not have permission to perform this action.");
    }
    const canManage = hasProjectPermission(resolved.role, "assign_task");
    if (!canManage) {
      const isAssignee = task.assignedTo && String(task.assignedTo) === String(req.user._id);
      const isCreator = task.createdBy && String(task.createdBy) === String(req.user._id);
      if (!isAssignee && !isCreator) {
        throw new ApiError(403, "You can only modify tasks assigned to you");
      }
    }

    let targetColumn = mongoose.isValidObjectId(destinationColumnId)
      ? await BoardColumn.findById(destinationColumnId)
      : null;
    if (!targetColumn || String(targetColumn.projectId) !== String(project._id)) {
      const normalize = (value) =>
        String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
      const columns = await BoardColumn.find({ projectId: project._id });
      targetColumn = columns.find(
        (column) =>
          String(column.name) && normalize(column.name) === normalize(destinationColumnId)
      );
    }
    if (!targetColumn) throw new ApiError(404, "Destination column not found");

    const moved = await moveTask(taskId, targetColumn._id, typeof newPosition === "number" ? newPosition : undefined);

    const populated = await Task.findById(moved._id).populate("assignedTo", "name email avatar");

    await recordActivity({
      workspaceId: workspace._id,
      projectId: project._id,
      userId: req.user._id,
      action: "TASK_MOVED",
      targetType: "task",
      targetId: moved._id,
      metadata: {
        title: moved.title,
        columnId: String(targetColumn._id),
        projectName: project.name,
      },
    });

    getIO()
      ?.to(boardRoom(project._id))
      .emit("task:moved", { task: populated, actorId: String(req.user._id) });

    res.json({ success: true, task: populated });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBoardHandler,
  createColumn,
  updateColumn,
  deleteColumn,
  createTask,
  updateTask,
  deleteTask,
  handleMoveTask,
  reorderTask,
  resolveMentions,
  boardRoom,
};
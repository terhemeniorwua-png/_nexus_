const Task = require("../models/task.model");
const Comment = require("../models/comment.model");
const { ApiError } = require("../middleware/errorHandler");
const { hasProjectPermission } = require("../permissions/permissions");
const { recordActivity } = require("../services/activity.service");
const { createNotification } = require("../services/notification.service");
const { getIO } = require("../sockets/store");

const commentRoom = (projectId) => `board:${String(projectId)}`;

async function assertTask(req) {
  const Project = require("../models/project.model");

  const project = await Project.findById(req.params.projectId);
  if (!project) throw new ApiError(404, "Project not found");
  if (String(project.workspaceId) !== String(req.workspace._id)) {
    throw new ApiError(403, "Project does not belong to this workspace");
  }

  const task = await Task.findById(req.params.taskId);
  if (!task) throw new ApiError(404, "Task not found");
  if (String(task.projectId) !== String(project._id)) {
    throw new ApiError(403, "Task does not belong to this project");
  }

  return { project, task };
}

async function listComments(req, res, next) {
  try {
    await assertTask(req);

    const comments = await Comment.find({ taskId: req.params.taskId })
      .sort({ createdAt: 1 })
      .populate("userId", "name email avatar");

    res.json({ success: true, comments });
  } catch (error) {
    next(error);
  }
}

async function addComment(req, res, next) {
  try {
    const { project, task } = await assertTask(req);

    const content = String(req.body?.content || "").trim();
    if (!content) return next(new ApiError(400, "Comment content is required"));

    const comment = await Comment.create({
      taskId: task._id,
      userId: req.user._id,
      content,
    });

    const populated = await Comment.findById(comment._id).populate("userId", "name email avatar");

    await recordActivity({
      workspaceId: req.workspace._id,
      projectId: req.project._id,
      userId: req.user._id,
      action: "COMMENT_ADDED",
      targetType: "comment",
      targetId: task._id,
      metadata: {
        taskId: task._id,
        taskTitle: task.title,
        projectId: project._id,
        projectName: project.name,
        preview: content.slice(0, 120),
      },
    });

    if (task.assignedTo && String(task.assignedTo) !== String(req.user._id)) {
      await createNotification({
        userId: task.assignedTo,
        actorId: req.user._id,
        workspaceId: req.workspace._id,
        type: "MENTION",
        title: `${req.user.name} commented on "${task.title}"`,
        body: content.slice(0, 140),
        link: `/workspaces/${req.workspace._id}/projects/${project._id}/board`,
      });
    }

    getIO()?.to(commentRoom(project._id)).emit("comment:added", { comment: populated });
    res.status(201).json({ success: true, comment: populated });
  } catch (error) {
    next(error);
  }
}

async function deleteComment(req, res, next) {
  try {
    const { project } = await assertTask(req);

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return next(new ApiError(404, "Comment not found"));

    const isAuthor = String(comment.userId) === String(req.user._id);
    const isModerator = hasProjectPermission(req.projectRole, "update_project");
    if (!isAuthor && !isModerator) {
      return next(new ApiError(403, "You can only delete your own comments"));
    }

    await Comment.deleteOne({ _id: comment._id });

    getIO()?.to(commentRoom(project._id)).emit("comment:deleted", { commentId: String(comment._id) });
    res.json({ success: true, message: "Comment deleted" });
  } catch (error) {
    next(error);
  }
}

module.exports = { listComments, addComment, deleteComment, commentRoom };
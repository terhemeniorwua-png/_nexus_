"use strict";

const mongoose = require("mongoose");
const Task = require("../models/task.model");
const Deliverable = require("../models/deliverable.model");
const Review = require("../models/review.model");
const { ApiError } = require("../middleware/errorHandler");
const { recordActivity } = require("../services/activity.service");
const { createNotification } = require("../services/notification.service");
const { hasProjectPermission } = require("../permissions/permissions");

async function assertDeliverableInProject(req, deliverableId) {
  if (!deliverableId || !mongoose.isValidObjectId(deliverableId)) {
    throw new ApiError(404, "Deliverable not found");
  }
  const deliverable = await Deliverable.findById(deliverableId);
  if (!deliverable) throw new ApiError(404, "Deliverable not found");

  const task = await Task.findById(deliverable.taskId).select("projectId title");
  if (!task) throw new ApiError(404, "Task not found");
  if (String(task.projectId) !== String(req.project._id)) {
    throw new ApiError(403, "Deliverable does not belong to this project");
  }
  return { deliverable, task };
}

async function listProjectDeliverables(req, res, next) {
  try {
    const taskIds = await Task.find({ projectId: req.project._id }).distinct("_id");
    const deliverables = await Deliverable.find({ taskId: { $in: taskIds } })
      .sort({ submittedAt: -1 })
      .populate("taskId", "title")
      .populate("submittedBy", "name email avatar");

    res.json({ success: true, deliverables });
  } catch (error) {
    next(error);
  }
}

async function getDeliverable(req, res, next) {
  try {
    const { deliverable } = await assertDeliverableInProject(req, req.params.deliverableId);
    const populated = await Deliverable.findById(deliverable._id)
      .populate("taskId", "title")
      .populate("submittedBy", "name email avatar");
    res.json({ success: true, deliverable: populated });
  } catch (error) {
    next(error);
  }
}

async function submitDeliverable(req, res, next) {
  try {
    const task = req.task;
    if (!task) return next(new ApiError(404, "Task not found"));

    const { title, description, fileUrl } = req.body || {};
    if (!title || !String(title).trim()) {
      return next(new ApiError(400, "Deliverable title is required"));
    }

    const deliverable = await Deliverable.create({
      taskId: task._id,
      submittedBy: req.user._id,
      title: String(title).trim(),
      description: String(description || ""),
      fileUrl: String(fileUrl || ""),
      version: 1,
      status: "SUBMITTED",
      submittedAt: new Date(),
    });

    await recordActivity({
      workspaceId: req.workspace._id,
      projectId: req.project._id,
      userId: req.user._id,
      action: "DELIVERABLE_SUBMITTED",
      targetType: "deliverable",
      targetId: deliverable._id,
      metadata: { title: deliverable.title, taskId: task._id, taskTitle: task.title, projectName: req.project.name },
    });

    res.status(201).json({ success: true, deliverable: deliverable.toJSON() });
  } catch (error) {
    next(error);
  }
}

async function resubmitDeliverable(req, res, next) {
  try {
    const { deliverable } = await assertDeliverableInProject(req, req.params.deliverableId);

    const isOwner = String(deliverable.submittedBy) === String(req.user._id);
    const canManage = hasProjectPermission(req.projectRole, "assign_task");
    if (!canManage && !isOwner) {
      return next(new ApiError(403, "You can only update your own deliverables"));
    }

    const { title, description, fileUrl, status } = req.body || {};
    if (title !== undefined) deliverable.title = String(title).trim() || deliverable.title;
    if (description !== undefined) deliverable.description = String(description);
    if (fileUrl !== undefined) deliverable.fileUrl = String(fileUrl);

    // Only a submitter/PM may move a deliverable back into the review queue.
    if (status === "SUBMITTED") {
      deliverable.status = "SUBMITTED";
      deliverable.version += 1;
      deliverable.submittedAt = new Date();
    } else if (status !== undefined && status !== deliverable.status) {
      return next(new ApiError(400, "Only resubmission to SUBMITTED is allowed here"));
    }

    await deliverable.save();

    res.json({ success: true, deliverable: deliverable.toJSON() });
  } catch (error) {
    next(error);
  }
}

async function reviewDeliverable(req, res, next) {
  try {
    const { deliverable } = await assertDeliverableInProject(req, req.params.deliverableId);

    const decision = String(req.body?.decision || "").toUpperCase();
    if (!["APPROVED", "CHANGES_REQUESTED"].includes(decision)) {
      return next(new ApiError(400, "decision must be APPROVED or CHANGES_REQUESTED"));
    }

    const requiredPermission = decision === "APPROVED" ? "approve_deliverable" : "request_changes";
    if (!hasProjectPermission(req.projectRole, requiredPermission)) {
      return next(new ApiError(403, "You do not have permission to perform this action."));
    }

    const feedback = String(req.body?.feedback || "");

    const review = await Review.create({
      deliverableId: deliverable._id,
      reviewerId: req.user._id,
      decision,
      feedback,
    });

    deliverable.status = decision;
    if (decision === "APPROVED") {
      deliverable.submittedAt = deliverable.submittedAt || new Date();
    }
    await deliverable.save();

    await recordActivity({
      workspaceId: req.workspace._id,
      projectId: req.project._id,
      userId: req.user._id,
      action: decision === "APPROVED" ? "DELIVERABLE_APPROVED" : "DELIVERABLE_SUBMITTED",
      targetType: "review",
      targetId: review._id,
      metadata: {
        decision,
        deliverableId: deliverable._id,
        title: deliverable.title,
        projectName: req.project.name,
      },
    });

    if (String(deliverable.submittedBy) !== String(req.user._id)) {
      await createNotification({
        userId: deliverable.submittedBy,
        actorId: req.user._id,
        workspaceId: req.workspace._id,
        type: "DELIVERABLE_REVIEWED",
        title: decision === "APPROVED" ? "Your deliverable was approved" : "Changes requested on your deliverable",
        body: deliverable.title,
        link: `/workspaces/${req.workspace._id}/projects/${req.project._id}`,
        entityType: "deliverable",
        entityId: deliverable._id,
      });
    }

    res.json({ success: true, review: review.toJSON(), deliverable: deliverable.toJSON() });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listProjectDeliverables,
  getDeliverable,
  submitDeliverable,
  resubmitDeliverable,
  reviewDeliverable,
};
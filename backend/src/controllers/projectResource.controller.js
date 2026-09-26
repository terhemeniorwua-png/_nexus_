"use strict";

const ProjectResource = require("../models/projectResource.model");
const { ApiError } = require("../middleware/errorHandler");
const { recordActivity } = require("../services/activity.service");

async function listResources(req, res, next) {
  try {
    const resources = await ProjectResource.find({ projectId: req.project._id })
      .populate("createdBy", "name email avatar")
      .sort({ createdAt: -1 });
    res.json({ success: true, resources });
  } catch (error) {
    next(error);
  }
}

async function createResource(req, res, next) {
  try {
    const { name, url, category, description } = req.body || {};

    if (!name || !String(name).trim()) {
      return next(new ApiError(400, "Resource name is required"));
    }

    const resource = await ProjectResource.create({
      projectId: req.project._id,
      name: String(name).trim(),
      url: String(url || ""),
      category: String(category || "OTHER").toUpperCase(),
      description: String(description || ""),
      createdBy: req.user._id,
    });

    await recordActivity({
      workspaceId: req.workspace._id,
      projectId: req.project._id,
      userId: req.user._id,
      action: "RESOURCE_ADDED",
      targetType: "resource",
      targetId: resource._id,
      metadata: { name: resource.name, projectName: req.project.name },
    });

    res.status(201).json({ success: true, resource: resource.toJSON() });
  } catch (error) {
    next(error);
  }
}

async function updateResource(req, res, next) {
  try {
    const resource = await ProjectResource.findOne({
      _id: req.params.resourceId,
      projectId: req.project._id,
    });
    if (!resource) return next(new ApiError(404, "Resource not found"));

    const { name, url, category, description } = req.body || {};
    if (name !== undefined) {
      if (!String(name).trim()) return next(new ApiError(400, "Resource name cannot be empty"));
      resource.name = String(name).trim();
    }
    if (url !== undefined) resource.url = String(url);
    if (category !== undefined) resource.category = String(category).toUpperCase();
    if (description !== undefined) resource.description = String(description);

    await resource.save();
    res.json({ success: true, resource: resource.toJSON() });
  } catch (error) {
    next(error);
  }
}

async function deleteResource(req, res, next) {
  try {
    const resource = await ProjectResource.findOne({
      _id: req.params.resourceId,
      projectId: req.project._id,
    });
    if (!resource) return next(new ApiError(404, "Resource not found"));

    await ProjectResource.deleteOne({ _id: resource._id });
    res.json({ success: true, message: "Resource deleted" });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listResources,
  createResource,
  updateResource,
  deleteResource,
};
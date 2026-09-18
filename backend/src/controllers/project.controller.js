const Project = require("../models/project.model");
const Task = require("../models/task.model");
const Document = require("../models/document.model");
const BoardColumn = require("../models/boardColumn.model");
const { ApiError } = require("../middleware/errorHandler");
const { recordActivity } = require("../services/activity.service");
const { ensureDefaultColumns } = require("../services/board.service");

async function listProjects(req, res, next) {
  try {
    const projects = await Project.find({ workspaceId: req.workspace._id }).sort({ createdAt: -1 });

    const data = await Promise.all(
      projects.map(async (project) => {
        const [taskCount, completedCount, documentCount] = await Promise.all([
          Task.countDocuments({ projectId: project._id }),
          Task.countDocuments({ projectId: project._id, status: "DONE" }),
          Document.countDocuments({ workspaceId: req.workspace._id, projectId: project._id }),
        ]);

        return {
          ...project.toJSON(),
          stats: { taskCount, completedCount, documentCount },
        };
      })
    );

    res.json({ success: true, projects: data });
  } catch (error) {
    next(error);
  }
}

async function createProject(req, res, next) {
  try {
    const { name, description } = req.body;

    if (!name || !String(name).trim()) {
      return next(new ApiError(400, "Project name is required"));
    }

    const project = await Project.create({
      workspaceId: req.workspace._id,
      name: String(name).trim(),
      description: String(description || "").trim(),
      createdBy: req.user._id,
    });

    await ensureDefaultColumns(project._id);

    await recordActivity({
      workspaceId: req.workspace._id,
      userId: req.user._id,
      action: "PROJECT_CREATED",
      targetType: "project",
      targetId: project._id,
      metadata: { name: project.name },
    });

    res.status(201).json({ success: true, project: project.toJSON() });
  } catch (error) {
    next(error);
  }
}

async function getProject(req, res, next) {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return next(new ApiError(404, "Project not found"));
    }

    if (String(project.workspaceId) !== String(req.workspace._id)) {
      return next(new ApiError(403, "Project does not belong to this workspace"));
    }

    const [taskCount, doneCount] = await Promise.all([
      Task.countDocuments({ projectId: project._id }),
      Task.countDocuments({ projectId: project._id, status: "DONE" }),
    ]);

    res.json({
      success: true,
      project: {
        ...project.toJSON(),
        stats: { taskCount, doneCount },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateProject(req, res, next) {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return next(new ApiError(404, "Project not found"));

    if (String(project.workspaceId) !== String(req.workspace._id)) {
      return next(new ApiError(403, "Project does not belong to this workspace"));
    }

    const { name, description } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return next(new ApiError(400, "Project name cannot be empty"));
      project.name = String(name).trim();
    }
    if (description !== undefined) project.description = String(description).trim();

    await project.save();

    await recordActivity({
      workspaceId: req.workspace._id,
      userId: req.user._id,
      action: "PROJECT_UPDATED",
      targetType: "project",
      targetId: project._id,
      metadata: { name: project.name },
    });

    res.json({ success: true, project: project.toJSON() });
  } catch (error) {
    next(error);
  }
}

async function deleteProject(req, res, next) {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return next(new ApiError(404, "Project not found"));

    if (String(project.workspaceId) !== String(req.workspace._id)) {
      return next(new ApiError(403, "Project does not belong to this workspace"));
    }

    await Project.deleteOne({ _id: project._id });
    await Task.deleteMany({ projectId: project._id });
    await BoardColumn.deleteMany({ projectId: project._id });
    await Document.deleteMany({ workspaceId: req.workspace._id, projectId: project._id });

    res.json({ success: true, message: "Project deleted" });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
};
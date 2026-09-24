"use strict";

const mongoose = require("mongoose");
const Workspace = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const Team = require("../models/team.model");
const TeamMember = require("../models/teamMember.model");
const Project = require("../models/project.model");
const Task = require("../models/task.model");
const Document = require("../models/document.model");
const { ApiError } = require("./errorHandler");
const {
  hasWorkspacePermission,
  hasProjectPermission,
  workspaceRole: workspaceRoleOf,
} = require("../permissions/permissions");
const {
  resolveProjectRole,
} = require("../services/access.service");

/**
 * Workspace-context authorization.
 *
 * Must run AFTER `authenticate` and `memberOf`. Checks whether the
 * authenticated user's workspace role permits the given action.
 *
 * Example: requirePermission("manage_workspace_members")
 */
function requirePermission(permission) {
  return (req, _res, next) => {
    const role = req.workspaceRole || workspaceRoleOf(req.memberRole, req.isOwner);
    if (!hasWorkspacePermission(role, permission)) {
      return next(new ApiError(403, "You do not have permission to perform this action."));
    }
    next();
  };
}

/**
 * Project-context gate.
 *
 * Must run AFTER `authenticate` and `memberOf`. Loads the project referenced
 * by :projectId, verifies it belongs to the current workspace, resolves the
 * user's project role and attaches:
 *   req.project, req.projectMember, req.projectRole
 *
 * A regular workspace member without a ProjectMember row is rejected with 403.
 */
async function projectAccess(req, _res, next) {
  try {
    const { projectId } = req.params;

    if (!projectId || !mongoose.isValidObjectId(projectId)) {
      return next(new ApiError(404, "Project not found"));
    }

    const project = await Project.findById(projectId);
    if (!project) return next(new ApiError(404, "Project not found"));

    if (String(project.workspaceId) !== String(req.workspace._id)) {
      return next(new ApiError(403, "Project does not belong to this workspace"));
    }

    const resolved = await resolveProjectRole({
      user: req.user,
      project,
      isOwner: Boolean(req.isOwner),
      workspaceMemberRole: req.memberRole,
    });

    if (!resolved) {
      return next(new ApiError(403, "You do not have access to this project"));
    }

    req.project = project;
    req.projectMember = resolved.member;
    req.projectRole = resolved.role;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Project-context action authorization. Must run AFTER `projectAccess`.
 *
 * Example: requireProjectPermission("create_task")
 */
function requireProjectPermission(permission) {
  return (req, _res, next) => {
    if (!req.projectRole) {
      return next(new ApiError(403, "You do not have access to this project"));
    }
    if (!hasProjectPermission(req.projectRole, permission)) {
      return next(new ApiError(403, "You do not have permission to perform this action."));
    }
    next();
  };
}

/**
 * Task ownership rule (section 15 of the Phase 6 brief).
 *
 * For roles without `assign_task` (MEMBER / COLLABORATOR), the task may only
 * be modified if it is assigned to the requesting user (or created by them).
 * Managers / owners / admins bypass the ownership restriction.
 *
 * Must run AFTER `projectAccess`.
 * Loads and attaches req.task.
 */
async function taskOwnership(req, _res, next) {
  try {
    const { taskId } = req.params;

    if (!taskId || !mongoose.isValidObjectId(taskId)) {
      return next(new ApiError(404, "Task not found"));
    }

    const task = await Task.findById(taskId);
    if (!task) return next(new ApiError(404, "Task not found"));

    if (String(task.projectId) !== String(req.project._id)) {
      return next(new ApiError(403, "Task does not belong to this project"));
    }

    req.task = task;

    const canManage = hasProjectPermission(req.projectRole, "assign_task");
    if (!canManage) {
      const isAssignee =
        task.assignedTo && String(task.assignedTo) === String(req.user._id);
      const isCreator = task.createdBy && String(task.createdBy) === String(req.user._id);
      if (!isAssignee && !isCreator) {
        return next(new ApiError(403, "You can only modify tasks assigned to you"));
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Document access gate. Handles both workspace-level documents
 * (projectId === null) and project-scoped documents. Runs AFTER authenticate.
 */
function documentAccess(permission) {
  const permissionName = String(permission);

  return async (req, _res, next) => {
    try {
      const doc = await Document.findOne({
        _id: req.params.docId,
        workspaceId: req.workspace._id,
      });

      if (!doc) return next(new ApiError(404, "Document not found"));

      if (doc.projectId) {
        const project = await Project.findById(doc.projectId);
        if (!project) return next(new ApiError(404, "Project not found"));

        const resolved = await resolveProjectRole({
          user: req.user,
          project,
          isOwner: Boolean(req.isOwner),
          workspaceMemberRole: req.memberRole,
        });

        if (!resolved || !hasProjectPermission(resolved.role, permissionName)) {
          return next(new ApiError(403, "You do not have permission to perform this action."));
        }

        req.document = doc;
        req.project = project;
        req.projectRole = resolved.role;
        return next();
      }

      const role = req.workspaceRole || workspaceRoleOf(req.memberRole, req.isOwner);
      if (!hasWorkspacePermission(role, permissionName)) {
        return next(new ApiError(403, "You do not have permission to perform this action."));
      }

      req.document = doc;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  requirePermission,
  projectAccess,
  requireProjectPermission,
  taskOwnership,
  documentAccess,
};
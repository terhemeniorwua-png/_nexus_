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
 * Attach the workspace authorization context for an arbitrary workspace
 * object onto `req` (workspace, memberRole, workspaceMember, isOwner,
 * workspaceRole). Rejects with 403 when the user is neither an owner nor a
 * workspace member.
 */
async function attachWorkspaceContext(req, workspace) {
  const isOwner = String(workspace.ownerId) === String(req.user._id);

  const member = await WorkspaceMember.findOne({
    workspaceId: workspace._id,
    userId: req.user._id,
  });

  if (!member && !isOwner) {
    throw new ApiError(403, "You do not have access to this workspace");
  }

  req.workspace = workspace;
  req.memberRole = member ? member.role : "Admin";
  req.workspaceMember = member || null;
  req.isOwner = isOwner;
  req.workspaceRole = workspaceRoleOf(req.memberRole, isOwner);
}

/**
 * Workspace-context resolver for team creation, where the workspace id comes
 * from the request body (`workspaceId`) instead of the route params.
 *
 * Must run AFTER `authenticate`. Rejects invalid/missing workspaces with 404
 * and non-members with 403.
 */
async function workspaceFromBody(req, _res, next) {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId || !mongoose.isValidObjectId(workspaceId)) {
      return next(new ApiError(404, "Workspace not found"));
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return next(new ApiError(404, "Workspace not found"));

    await attachWorkspaceContext(req, workspace);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Team-context gate. Must run AFTER `authenticate`. Loads the team referenced
 * by :teamId, attaches the team's workspace context, and flags whether the
 * requesting user is a TEAM_LEAD of the team:
 *   req.team, req.workspace, req.memberRole, req.isOwner, req.workspaceRole,
 *   req.isTeamLead
 */
async function teamAccess(req, _res, next) {
  try {
    const { teamId } = req.params;

    if (!teamId || !mongoose.isValidObjectId(teamId)) {
      return next(new ApiError(404, "Team not found"));
    }

    const team = await Team.findById(teamId);
    if (!team) return next(new ApiError(404, "Team not found"));

    const workspace = await Workspace.findById(team.workspaceId);
    if (!workspace) return next(new ApiError(404, "Workspace not found"));

    await attachWorkspaceContext(req, workspace);

    const teamMember = await TeamMember.findOne({
      teamId: team._id,
      userId: req.user._id,
    });

    req.team = team;
    req.isTeamLead = Boolean(teamMember && teamMember.role === "TEAM_LEAD");
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Team-member management gate. Must run AFTER `teamAccess`. Allows either a
 * workspace owner/admin (manage_team_members) or the TEAM_LEAD of that team.
 */
function requireTeamMemberManagement(req, _res, next) {
  const role = req.workspaceRole || workspaceRoleOf(req.memberRole, req.isOwner);
  if (req.isTeamLead || hasWorkspacePermission(role, "manage_team_members")) {
    return next();
  }
  return next(new ApiError(403, "You do not have permission to perform this action."));
}

/**
 * Team-context resolver for the global project-creation endpoint, where the
 * workspace is derived from the team referenced by `teamId` (never trusted
 * from the client). Must run AFTER `authenticate`. Sets req.team and the
 * workspace context (req.workspace, req.workspaceRole, ...). Rejects missing
 * teams with 400, unknown teams with 404, and non-members with 403.
 */
async function projectTeamContext(req, _res, next) {
  try {
    const { teamId } = req.body;

    if (!teamId || !mongoose.isValidObjectId(teamId)) {
      return next(new ApiError(400, "A team is required"));
    }

    const team = await Team.findById(teamId);
    if (!team) return next(new ApiError(404, "Team not found"));

    const workspace = await Workspace.findById(team.workspaceId);
    if (!workspace) return next(new ApiError(404, "Workspace not found"));

    await attachWorkspaceContext(req, workspace);
    req.team = team;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Global project-context gate (Phase 8). Same contract as `projectAccess`
 * but the workspace is resolved from the project itself instead of a
 * `:workspaceId` route param, enabling /api/projects/:projectId routes.
 *
 * Must run AFTER `authenticate`. Attaches:
 *   req.project, req.projectMember, req.projectRole
 *   plus the project's workspace context (req.workspace, req.workspaceRole)
 */
async function globalProjectAccess(req, _res, next) {
  try {
    const { projectId } = req.params;

    if (!projectId || !mongoose.isValidObjectId(projectId)) {
      return next(new ApiError(404, "Project not found"));
    }

    const project = await Project.findById(projectId);
    if (!project) return next(new ApiError(404, "Project not found"));

    const workspace = await Workspace.findById(project.workspaceId);
    if (!workspace) return next(new ApiError(404, "Workspace not found"));

    await attachWorkspaceContext(req, workspace);

    const resolved = await resolveProjectRole({
      user: req.user,
      project,
      isOwner: Boolean(req.isOwner),
      workspaceMemberRole: req.memberRole,
    });

    if (!resolved) {
      return next(new ApiError(403, "You do not have permission to view this project"));
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
  workspaceFromBody,
  teamAccess,
  requireTeamMemberManagement,
  projectTeamContext,
  projectAccess,
  globalProjectAccess,
  requireProjectPermission,
  taskOwnership,
  documentAccess,
};
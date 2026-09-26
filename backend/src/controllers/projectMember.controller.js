"use strict";

const User = require("../models/user.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const ProjectMember = require("../models/projectMember.model");
const { ApiError } = require("../middleware/errorHandler");
const { recordActivity } = require("../services/activity.service");
const { createNotification } = require("../services/notification.service");

const ALLOWED_ROLES = ["PROJECT_MANAGER", "MEMBER", "VIEWER", "COLLABORATOR"];
const GRANTABLE_ROLES = ["MEMBER", "VIEWER", "COLLABORATOR"];
const MANAGER_ROLE = "PROJECT_MANAGER";

function normalize(member, user) {
  return {
    id: member.id,
    role: member.role,
    joinedAt: member.joinedAt,
    user: user
      ? { id: user.id, name: user.name, email: user.email, avatar: user.avatar || "" }
      : { id: String(member.userId) },
  };
}

function canGrantManagerRole(req) {
  return req.isOwner || req.workspaceRole === "ADMIN";
}

async function listProjectMembers(req, res, next) {
  try {
    const members = await ProjectMember.find({ projectId: req.project._id })
      .populate("userId", "name email avatar")
      .sort({ joinedAt: 1 });

    const rows = members.map((m) => normalize(m, m.userId));

    const managerId = req.project.managerId;
    if (managerId && !rows.some((r) => String(r.id) === String(managerId))) {
      const manager = await User.findById(managerId).select("name email avatar");
      if (manager) {
        rows.unshift({
          id: String(managerId),
          role: MANAGER_ROLE,
          joinedAt: req.project.createdAt || null,
          user: { id: manager.id, name: manager.name, email: manager.email, avatar: manager.avatar || "" },
        });
      }
    }

    res.json({ success: true, members: rows });
  } catch (error) {
    next(error);
  }
}

async function inviteProjectMember(req, res, next) {
  try {
    const { email, userId, role } = req.body;

    const requestedRole = String(role || "MEMBER").toUpperCase();
    if (!ALLOWED_ROLES.includes(requestedRole)) {
      return next(new ApiError(400, "Invalid project member role"));
    }
    if (requestedRole === MANAGER_ROLE && !canGrantManagerRole(req)) {
      return next(new ApiError(403, "Only workspace owners and admins can assign the PROJECT_MANAGER role"));
    }

    let user = null;
    if (userId) {
      user = await User.findById(userId);
    } else if (email) {
      user = await User.findOne({ email: String(email).toLowerCase().trim() });
    }
    if (!user) {
      return next(new ApiError(404, "No user found for the provided email or userId"));
    }

    // Phase 9 — project members must belong to the project's workspace. The
    // invited user does NOT need to be on the project's team (cross-team
    // collaboration); only a shared workspace is required.
    const workspaceOwnerId = req.workspace && String(req.workspace.ownerId);
    const isWorkspaceOwner = workspaceOwnerId && workspaceOwnerId === String(user._id);
    const isWorkspaceMember = await WorkspaceMember.exists({
      workspaceId: req.workspace._id,
      userId: user._id,
    });
    if (!isWorkspaceOwner && !isWorkspaceMember) {
      return next(new ApiError(400, "User does not belong to this workspace"));
    }

    const existing = await ProjectMember.findOne({
      projectId: req.project._id,
      userId: user._id,
    });
    if (existing) {
      return next(new ApiError(409, "This user is already a project member"));
    }

    const member = await ProjectMember.create({
      projectId: req.project._id,
      userId: user._id,
      role: requestedRole,
    });

    await recordActivity({
      workspaceId: req.workspace._id,
      projectId: req.project._id,
      userId: req.user._id,
      action: "MEMBER_INVITED",
      targetType: "member",
      targetId: user._id,
      metadata: { email: user.email, role: requestedRole, projectName: req.project.name },
    });

    await createNotification({
      userId: user._id,
      actorId: req.user._id,
      workspaceId: req.workspace._id,
      type: "PROJECT_INVITATION",
      title: `You were invited to a project`,
      body: `${req.user.name} added you to "${req.project.name}" as ${requestedRole.toLowerCase().replace("_", " ")}.`,
      link: `/workspaces/${req.workspace._id}/projects/${req.project._id}/board`,
      entityType: "project",
      entityId: req.project._id,
    });

    res.status(201).json({ success: true, member: normalize(member, user) });
  } catch (error) {
    next(error);
  }
}

async function updateProjectMemberRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    const requestedRole = String(role || "").toUpperCase();
    if (!ALLOWED_ROLES.includes(requestedRole)) {
      return next(new ApiError(400, "Invalid project member role"));
    }
    if (requestedRole === MANAGER_ROLE && !canGrantManagerRole(req)) {
      return next(new ApiError(403, "Only workspace owners and admins can assign the PROJECT_MANAGER role"));
    }

    const member = await ProjectMember.findOne({
      projectId: req.project._id,
      userId,
    });
    if (!member) {
      return next(new ApiError(404, "Project member not found"));
    }

    // A project manager may not elevate themselves.
    if (
      String(userId) === String(req.user._id) &&
      requestedRole === MANAGER_ROLE &&
      !canGrantManagerRole(req) &&
      !GRANTABLE_ROLES.includes(req.projectRole)
    ) {
      return next(new ApiError(403, "You cannot promote yourself"));
    }

    member.role = requestedRole;
    await member.save();

    const user = await User.findById(member.userId).select("name email avatar");

    await recordActivity({
      workspaceId: req.workspace._id,
      projectId: req.project._id,
      userId: req.user._id,
      action: "MEMBERSHIP_UPDATED",
      targetType: "member",
      targetId: member.userId,
      metadata: { role: requestedRole, projectName: req.project.name },
    });

    res.json({ success: true, member: normalize(member, user || undefined) });
  } catch (error) {
    next(error);
  }
}

async function removeProjectMember(req, res, next) {
  try {
    const { userId } = req.params;

    if (String(userId) === String(req.user._id)) {
      return next(new ApiError(400, "You cannot remove yourself from the project"));
    }

    const member = await ProjectMember.findOne({
      projectId: req.project._id,
      userId,
    });

    const guardsProjectManager =
      req.project.managerId && String(req.project.managerId) === String(userId);

    if (!member && guardsProjectManager && !canGrantManagerRole(req)) {
      return next(new ApiError(403, "You cannot remove the project manager"));
    }
    if (!member) {
      return next(new ApiError(404, "Project member not found"));
    }

    if (guardsProjectManager && !canGrantManagerRole(req)) {
      return next(new ApiError(403, "You cannot remove the project manager"));
    }

    await ProjectMember.deleteOne({ _id: member._id });

    await recordActivity({
      workspaceId: req.workspace._id,
      projectId: req.project._id,
      userId: req.user._id,
      action: "MEMBERSHIP_UPDATED",
      targetType: "member",
      targetId: member.userId,
      metadata: { removed: true, projectName: req.project.name },
    });

    res.json({ success: true, message: "Project member removed" });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listProjectMembers,
  inviteProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
};
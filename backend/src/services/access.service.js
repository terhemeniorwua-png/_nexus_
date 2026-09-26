"use strict";

const mongoose = require("mongoose");
const Workspace = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const Project = require("../models/project.model");
const ProjectMember = require("../models/projectMember.model");
const { ApiError } = require("../middleware/errorHandler");

/**
 * Resolve the project-context role for a user against a specific project.
 *
 * Order of precedence:
 *   1. A ProjectMember row → that project role.
 *   2. project.managerId === user → PROJECT_MANAGER.
 *   3. Workspace owner  → derived WORKSPACE_OWNER (administrative project role).
 *   4. Workspace admin  → derived ADMIN (administrative project role).
 *   5. Otherwise → null (no access).
 *
 * A regular workspace member is NOT granted project access automatically.
 *
 * @returns {Promise<{ role: string, member: import("mongoose").Document|null }|null>}
 */
async function resolveProjectRole({ user, project, isOwner = false, workspaceMemberRole = null }) {
  if (!project) return null;

  const membership = await ProjectMember.findOne({ projectId: project._id, userId: user._id });
  if (membership) {
    return { role: membership.role, member: membership };
  }

  if (project.managerId && String(project.managerId) === String(user._id)) {
    return { role: "PROJECT_MANAGER", member: null };
  }

  if (isOwner) return { role: "WORKSPACE_OWNER", member: null };

  if (workspaceMemberRole === "Admin") return { role: "ADMIN", member: null };

  return null;
}

/**
 * Return the ObjectId strings of projects the user may access inside a
 * workspace (project membership, managed projects, and for owners/admins all
 * workspace projects).
 *
 * @returns {Promise<string[]>}
 */
async function getAccessibleProjectIds({ userId, workspaceId, isOwner = false, workspaceMemberRole = null }) {
  const ids = new Set();

  const memberships = await ProjectMember.find({ userId }).select("projectId");
  memberships.forEach((m) => ids.add(String(m.projectId)));

  const managed = await Project.find({ workspaceId, managerId: userId }).select("_id");
  managed.forEach((p) => ids.add(String(p._id)));

  if (isOwner || workspaceMemberRole === "Admin") {
    const all = await Project.find({ workspaceId }).select("_id");
    all.forEach((p) => ids.add(String(p._id)));
  }

  return [...ids];
}

/**
 * Attach a `role` field to each project based on the requesting user's
 * project-context role. Mutates and returns the array of projects.
 */
async function attachRolesToProjects(projects, { userId, isOwner = false, workspaceMemberRole = null }) {
  const ids = projects.map((p) => p._id);
  const memberships = await ProjectMember.find({ projectId: { $in: ids }, userId });

  const roleByProject = {};
  memberships.forEach((m) => {
    roleByProject[String(m.projectId)] = m.role;
  });

  projects.forEach((project) => {
    let role = roleByProject[String(project._id)] || null;
    if (!role && project.managerId && String(project.managerId) === String(userId)) {
      role = "PROJECT_MANAGER";
    }
    if (!role && isOwner) role = "WORKSPACE_OWNER";
    if (!role && workspaceMemberRole === "Admin") role = "ADMIN";
    project.role = role;
  });

  return projects;
}

/**
 * Global, cross-workspace accessible-project resolution (Phase 8).
 *
 * Returns every project the user may access across all workspaces they
 * belong to (workspace owner or member), each with an attached `role`.
 * Projects are filtered server-side — never by the client. Optional filters
 * (`status`, `priority`, `teamId`) are applied on top of the accessible set,
 * so an unauthorized team's projects are never exposed.
 */
async function getAccessibleProjectsGlobal({ userId, filters = {} }) {
  const [memberships, owned] = await Promise.all([
    WorkspaceMember.find({ userId }).select("workspaceId role"),
    Workspace.find({ ownerId: userId }).select("_id"),
  ]);

  const ownedIds = new Set(owned.map((w) => String(w._id)));
  const wsRoleById = new Map(memberships.map((m) => [String(m.workspaceId), m.role]));

  const wsContext = new Map();
  for (const wsId of new Set([...wsRoleById.keys(), ...ownedIds])) {
    const isOwner = ownedIds.has(wsId);
    const memberRole = wsRoleById.get(wsId) || (isOwner ? "Admin" : null);
    if (!isOwner && !memberRole) continue;
    wsContext.set(wsId, { isOwner, memberRole });
  }

  const ids = new Set();
  for (const [wsId, ctx] of wsContext) {
    const accessible = await getAccessibleProjectIds({
      userId,
      workspaceId: wsId,
      isOwner: ctx.isOwner,
      workspaceMemberRole: ctx.memberRole,
    });
    accessible.forEach((id) => ids.add(id));
  }

  const query = { _id: { $in: [...ids] } };

  if (filters.status !== undefined) {
    if (!Project.STATUSES.includes(filters.status)) {
      throw new ApiError(400, "Status must be PLANNING, ACTIVE, ON_HOLD, COMPLETED, or ARCHIVED");
    }
    query.status = filters.status;
  }

  if (filters.priority !== undefined) {
    if (!Project.PRIORITIES.includes(filters.priority)) {
      throw new ApiError(400, "Priority must be LOW, MEDIUM, HIGH, or URGENT");
    }
    query.priority = filters.priority;
  }

  if (filters.teamId !== undefined && filters.teamId !== "") {
    if (!mongoose.isValidObjectId(filters.teamId)) {
      throw new ApiError(400, "Invalid team");
    }
    query.teamId = filters.teamId;
  }

  const projects = await Project.find(query).sort({ createdAt: -1 });

  await attachRolesGlobal(projects, { userId, wsContext });
  return projects;
}

/**
 * Attach a project-context `role` to each project using per-workspace
 * owner/admin context, in addition to the existing attachRolesToProjects
 * membership + management checks. Mutates and returns the projects.
 */
async function attachRolesGlobal(projects, { userId, wsContext }) {
  const ids = projects.map((p) => p._id);
  const memberships = await ProjectMember.find({ projectId: { $in: ids }, userId });
  const roleByProject = memberships.reduce((acc, m) => {
    acc[String(m.projectId)] = m.role;
    return acc;
  }, {});

  projects.forEach((project) => {
    let role = roleByProject[String(project._id)] || null;
    if (!role && project.managerId && String(project.managerId) === String(userId)) {
      role = "PROJECT_MANAGER";
    }
    if (!role) {
      const ctx = wsContext.get(String(project.workspaceId));
      if (ctx && ctx.isOwner) role = "WORKSPACE_OWNER";
      else if (ctx && ctx.memberRole === "Admin") role = "ADMIN";
    }
    project.role = role;
  });

  return projects;
}

module.exports = {
  resolveProjectRole,
  getAccessibleProjectIds,
  attachRolesToProjects,
  getAccessibleProjectsGlobal,
  attachRolesGlobal,
};
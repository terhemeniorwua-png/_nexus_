"use strict";

const Project = require("../models/project.model");
const ProjectMember = require("../models/projectMember.model");

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

module.exports = { resolveProjectRole, getAccessibleProjectIds, attachRolesToProjects };
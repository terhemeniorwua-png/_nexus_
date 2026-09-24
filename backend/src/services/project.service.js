"use strict";

// Project domain helpers used by the Phase 8 global project routes and the
// existing workspace-scoped routes. All relationship validation (team belongs
// to the workspace, manager belongs to the workspace), field validation
// (enums, dates, length limits) and response enrichment lives here so the
// controllers stay thin and consistent.

const mongoose = require("mongoose");
const User = require("../models/user.model");
const Team = require("../models/team.model");
const Workspace = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const ProjectMember = require("../models/projectMember.model");
const Task = require("../models/task.model");
const Project = require("../models/project.model");
const { ApiError } = require("../middleware/errorHandler");

const { STATUSES, PRIORITIES } = Project;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Parse an ISO date-ish value into a Date. Empty values → null.
 * Throws ApiError(400) on garbage. Never returns an invalid Date.
 */
function toDate(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return date;
}

/** Reject a due date that precedes the start date. */
function assertValidDateRange(startDate, dueDate) {
  if (startDate && dueDate && dueDate.getTime() < startDate.getTime()) {
    throw new ApiError(400, "Due date cannot be before the start date");
  }
}

// ---------------------------------------------------------------------------
// Relationship validation
// ---------------------------------------------------------------------------

/**
 * Load the team referenced by `teamId` and verify it belongs to `workspaceId`.
 * Returns null when teamId is empty/unset. Throws 400/404 on violations.
 */
async function assertTeamInWorkspace({ teamId, workspaceId, required = false }) {
  if (teamId === undefined || teamId === null || String(teamId).trim() === "") {
    if (required) throw new ApiError(400, "A team is required");
    return null;
  }
  if (!mongoose.isValidObjectId(teamId)) {
    throw new ApiError(400, "Invalid team");
  }
  const team = await Team.findById(teamId);
  if (!team) throw new ApiError(404, "Team not found");
  if (String(team.workspaceId) !== String(workspaceId)) {
    throw new ApiError(400, "Team does not belong to this workspace");
  }
  return team;
}

/**
 * Verify the manager is eligible to manage a project in `workspaceId`:
 * the user must exist and be the workspace owner or a workspace member with an
 * `Admin`/`Member` role. Cross-workspace managers are rejected.
 * Returns the loaded manager or throws.
 */
async function assertEligibleManager({ workspaceId, managerId, required = false }) {
  if (managerId === undefined || managerId === null || String(managerId).trim() === "") {
    if (required) throw new ApiError(400, "A manager is required");
    return null;
  }
  if (!mongoose.isValidObjectId(managerId)) {
    throw new ApiError(400, "Invalid manager");
  }
  const manager = await User.findById(managerId);
  if (!manager) throw new ApiError(404, "Manager not found");

  const workspace = await Workspace.findById(workspaceId);
  if (workspace && String(workspace.ownerId) === String(managerId)) {
    return manager;
  }

  const membership = await WorkspaceMember.findOne({
    workspaceId,
    userId: managerId,
    role: { $in: ["Admin", "Member"] },
  });
  if (!membership) {
    throw new ApiError(400, "Manager must be a member of this workspace");
  }
  return manager;
}

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

/**
 * Validate and clean editable project fields. Accepts a partial body (PATCH)
 * or a full body (POST). Unknown fields are ignored; only the keys present on
 * the body are included in the result. Throws ApiError(400) on violations.
 */
function sanitizeProjectFields(body = {}) {
  const { name, description, priority, status, startDate, dueDate } = body;
  const cleaned = {};

  if (name !== undefined) {
    const value = String(name ?? "").trim();
    if (!value) throw new ApiError(400, "Project name is required");
    if (value.length > 140) throw new ApiError(400, "Project name cannot exceed 140 characters");
    cleaned.name = value;
  }

  if (description !== undefined) {
    const value = String(description ?? "").trim();
    if (value.length > 2000) throw new ApiError(400, "Description cannot exceed 2000 characters");
    cleaned.description = value;
  }

  if (priority !== undefined && priority !== null && priority !== "") {
    if (!PRIORITIES.includes(priority)) {
      throw new ApiError(400, "Priority must be LOW, MEDIUM, HIGH, or URGENT");
    }
    cleaned.priority = priority;
  }

  if (status !== undefined && status !== null && status !== "") {
    if (!STATUSES.includes(status)) {
      throw new ApiError(400, "Status must be PLANNING, ACTIVE, ON_HOLD, COMPLETED, or ARCHIVED");
    }
    cleaned.status = status;
  }

  if (startDate !== undefined) cleaned.startDate = toDate(startDate, "start date");
  if (dueDate !== undefined) cleaned.dueDate = toDate(dueDate, "due date");

  return cleaned;
}

// ---------------------------------------------------------------------------
// Response enrichment (batched, no N+1)
// ---------------------------------------------------------------------------

function safeStr(value) {
  return value ? String(value) : null;
}

/**
 * Attach team/manager/workspace summaries and stats to a list of projects.
 * Bounded number of queries (3 lookups + per-project counts batched in
 * parallel) regardless of list size.
 */
async function enrichProjects(projects) {
  if (!projects.length) return [];

  const teamIds = [...new Set(projects.map((p) => p.teamId).filter(Boolean))];
  const managerIds = [...new Set(projects.map((p) => p.managerId).filter(Boolean))];
  const workspaceIds = [...new Set(projects.map((p) => p.workspaceId).filter(Boolean))];

  const [teams, managers, workspaces] = await Promise.all([
    Team.find({ _id: { $in: teamIds } }),
    User.find({ _id: { $in: managerIds } }).select("name avatar"),
    Workspace.find({ _id: { $in: workspaceIds } }).select("name"),
  ]);

  const teamById = new Map(teams.map((t) => [safeStr(t._id), t]));
  const managerById = new Map(managers.map((u) => [safeStr(u._id), u]));
  const workspaceById = new Map(workspaces.map((w) => [safeStr(w._id), w]));

  const stats = await Promise.all(
    projects.map(async (project) => {
      const [taskCount, doneCount, memberCount] = await Promise.all([
        Task.countDocuments({ projectId: project._id }),
        Task.countDocuments({ projectId: project._id, status: "DONE" }),
        ProjectMember.countDocuments({ projectId: project._id }),
      ]);
      return { taskCount, doneCount, memberCount };
    })
  );

  return projects.map((project, i) => {
    const team = teamById.get(safeStr(project.teamId));
    const manager = managerById.get(safeStr(project.managerId));
    const workspace = workspaceById.get(safeStr(project.workspaceId));
    return {
      ...project.toJSON(),
      role: project.role || null,
      team: team
        ? { id: team.id, name: team.name, workspaceId: safeStr(team.workspaceId) }
        : null,
      manager: manager ? { id: manager.id, name: manager.name, avatar: manager.avatar || "" } : null,
      workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
      stats: stats[i],
    };
  });
}

/**
 * Return the project's members with user summaries and roles.
 */
async function getProjectMembers(projectId) {
  const members = await ProjectMember.find({ projectId }).sort({ createdAt: 1 });
  const userIds = [...new Set(members.map((m) => safeStr(m.userId)))];
  const users = await User.find({ _id: { $in: userIds } }).select("name email avatar");
  const userById = new Map(users.map((u) => [safeStr(u._id), u]));

  return members.map((member) => {
    const user = userById.get(safeStr(member.userId));
    return {
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt || member.createdAt,
      user: user
        ? { id: user.id, name: user.name, email: user.email, avatar: user.avatar || "" }
        : { id: safeStr(member.userId) },
    };
  });
}

module.exports = {
  STATUSES,
  PRIORITIES,
  toDate,
  assertValidDateRange,
  assertTeamInWorkspace,
  assertEligibleManager,
  sanitizeProjectFields,
  enrichProjects,
  getProjectMembers,
};
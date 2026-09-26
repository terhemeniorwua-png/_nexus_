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
const { calculateProjectProgress } = require("./progress.service");
const {
  PROJECT_ROLES,
  hasProjectPermission,
  workspaceRole,
} = require("../permissions/permissions");

const { STATUSES, PRIORITIES } = Project;

/**
 * Phase 21 — the permission that defines "may manage a project". It is the
 * gate in front of the deliverable review routes, so using it here keeps the
 * manager dashboard and the review actions it offers in lockstep.
 */
const MANAGE_PROJECT_ACTION = "review_deliverable";

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
 * Attach team/manager/workspace summaries, stats, and weighted progress to a
 * list of projects. Bounded number of queries (3 relationship lookups + 2
 * batched task/member reads) regardless of list size.
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

  const stats = await computeProjectStats(projects.map((p) => p._id));
  const statsByProject = {};
  projects.forEach((project, i) => {
    statsByProject[safeStr(project._id)] = stats[i];
  });

  return projects.map((project) => {
    const team = teamById.get(safeStr(project.teamId));
    const manager = managerById.get(safeStr(project.managerId));
    const workspace = workspaceById.get(safeStr(project.workspaceId));
    const projectStats = statsByProject[safeStr(project._id)] || {
      taskCount: 0,
      doneCount: 0,
      memberCount: 0,
      progress: 0,
    };
    return {
      ...project.toJSON(),
      role: project.role || null,
      team: team
        ? { id: team.id, name: team.name, workspaceId: safeStr(team.workspaceId) }
        : null,
      manager: manager ? { id: manager.id, name: manager.name, avatar: manager.avatar || "" } : null,
      workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
      stats: {
        taskCount: projectStats.taskCount,
        doneCount: projectStats.doneCount,
        memberCount: projectStats.memberCount,
      },
      progress: projectStats.progress,
    };
  });
}

/**
 * Compute per-project task stats + weighted progress for a set of project ids.
 * Bounded queries: one Task read + one ProjectMember read for the whole set
 * (no per-project queries, regardless of list size). Returns one row per input
 * id, aligned by index:
 *   { taskCount, doneCount, memberCount, inProgressCount, underReviewCount, submittedCount, progress }
 * `progress` follows the Phase 11 weighted model: the equal-weighted average of
 * the project's tasks (0 when the project has no tasks). Every progress
 * consumer (project list, project detail, dashboard overview) reads from here
 * so they can never disagree.
 */
async function computeProjectStats(projectIds) {
  const ids = (projectIds || []).map((id) => id);
  if (ids.length === 0) return [];

  const [tasks, memberRows] = await Promise.all([
    Task.find({ projectId: { $in: ids } }).select("projectId status subtasks").lean(),
    ProjectMember.find({ projectId: { $in: ids } }).select("projectId").lean(),
  ]);

  const tasksByProject = new Map();
  ids.forEach((id) => tasksByProject.set(String(id), []));
  tasks.forEach((task) => {
    const key = String(task.projectId);
    if (tasksByProject.has(key)) tasksByProject.get(key).push(task);
  });

  const memberCountByProject = new Map();
  memberRows.forEach((m) => {
    const key = String(m.projectId);
    memberCountByProject.set(key, (memberCountByProject.get(key) || 0) + 1);
  });

  return ids.map((id) => {
    const list = tasksByProject.get(String(id)) || [];
    const countBy = (...statuses) =>
      list.filter((t) => statuses.includes(String(t.status || "").toUpperCase())).length;
    return {
      taskCount: list.length,
      // APPROVED (workflow) and the legacy DONE are both terminal.
      doneCount: countBy("APPROVED", "DONE"),
      inProgressCount: countBy("IN_PROGRESS", "IN PROGRESS"),
      underReviewCount: countBy("UNDER_REVIEW", "REVIEW"),
      submittedCount: countBy("SUBMITTED"),
      memberCount: memberCountByProject.get(String(id)) || 0,
      progress: calculateProjectProgress(list),
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

/**
 * The projects a user is allowed to see, across every workspace they touch.
 *
 * This is the single definition of project reachability for read paths, and it
 * encodes the app's actual access model rather than a simplification:
 *
 *   • workspace owners and Admins see every project in that workspace
 *   • everyone else sees only projects they are a member of, or manage
 *
 * It is deliberately not "all projects in my workspaces": a plain Member must
 * not see a project they were never added to, and Phase 8/10 authorization
 * enforces the same rule on every single request. Dashboard counts derive from
 * this function so a number can never be broader than what the user could
 * actually open.
 *
 * Moved here from `controllers/overview.controller.js` (Phase 20) so the
 * overview and the dashboard cannot drift apart.
 */
async function accessibleProjectScope(me) {
  const [memberships, owned] = await Promise.all([
    WorkspaceMember.find({ userId: me._id }),
    Workspace.find({ ownerId: me._id }).select("_id"),
  ]);

  const ownedIds = new Set(owned.map((w) => String(w._id)));

  const roleByWorkspace = {};
  memberships.forEach((m) => {
    roleByWorkspace[String(m.workspaceId)] = m.role;
  });
  owned.forEach((w) => {
    roleByWorkspace[String(w._id)] = "Admin";
  });

  const workspaceIds = [...new Set([...Object.keys(roleByWorkspace), ...ownedIds])];

  if (workspaceIds.length === 0) {
    return { workspaceIds: [], projects: [], roleByWorkspace, ownedIds };
  }

  const adminWorkspaceIds = new Set(
    Object.entries(roleByWorkspace)
      .filter(([, role]) => role === "Admin")
      .map(([wsId]) => wsId)
  );

  const [memberProjects, managedProjects] = await Promise.all([
    ProjectMember.find({ userId: me._id }).select("projectId"),
    Project.find({ managerId: me._id }).select("_id"),
  ]);

  const accessibleIds = new Set([
    ...memberProjects.map((m) => String(m.projectId)),
    ...managedProjects.map((p) => String(p._id)),
  ]);

  if (adminWorkspaceIds.size > 0) {
    const adminAll = await Project.find({
      workspaceId: { $in: [...adminWorkspaceIds] },
    }).select("_id");
    adminAll.forEach((p) => accessibleIds.add(String(p._id)));
  }

  const projects = await Project.find({
    workspaceId: { $in: workspaceIds },
    _id: { $in: [...accessibleIds] },
  });

  return { workspaceIds, projects, roleByWorkspace, ownedIds };
}

/**
 * Phase 21 — the subset of `accessibleProjectScope` the user actually manages.
 *
 * "Manages" is not a new role check: it is defined as *holding the review
 * permission* on the project, i.e. the same gate the deliverable/task review
 * routes already enforce. Reusing the permission table means the manager
 * dashboard can never be more permissive than the actions it links to — a user
 * who is refused `PATCH /deliverables/:id/versions/:n/approve` is also refused
 * the analytics that feed that button. Only PROJECT_MANAGER, and the derived
 * WORKSPACE_OWNER / ADMIN roles, satisfy it; MEMBER, COLLABORATOR and VIEWER
 * never do.
 *
 * Role resolution mirrors `resolveProjectRole` exactly (membership first, then
 * `managerId`, then the workspace-derived owner/admin roles) and resolves the
 * whole set in one extra query instead of one lookup per project.
 */
async function managedProjectScope(me) {
  const scope = await accessibleProjectScope(me);
  const { projects, roleByWorkspace, ownedIds } = scope;

  if (projects.length === 0) {
    return { ...scope, projects: [], managedProjectIds: [] };
  }

  const memberships = await ProjectMember.find({
    userId: me._id,
    projectId: { $in: projects.map((p) => p._id) },
  }).select("projectId role");

  const memberRoleByProject = new Map(
    memberships.map((m) => [String(m.projectId), m.role])
  );

  const owned = new Set([...ownedIds].map(String));

  const managed = projects.filter((project) => {
    const membershipRole = memberRoleByProject.get(String(project._id));
    const workspaceRoleValue = workspaceRole(
      roleByWorkspace[String(project.workspaceId)],
      owned.has(String(project.workspaceId))
    );

    // Precedence identical to resolveProjectRole: an explicit ProjectMember row
    // wins over being the project's managerId, which wins over inheriting the
    // workspace role.
    const role =
      membershipRole ||
      (project.managerId && String(project.managerId) === String(me._id)
        ? PROJECT_ROLES.PROJECT_MANAGER
        : null) ||
      workspaceRoleValue;

    return Boolean(role) && hasProjectPermission(role, MANAGE_PROJECT_ACTION);
  });

  return {
    ...scope,
    projects: managed,
    managedProjectIds: managed.map((p) => p._id),
  };
}

/**
 * Phase 21 — is this user a project manager anywhere?
 *
 * The same question `managedProjectScope` answers, asked as an existence test
 * so the session endpoint can answer it without loading every project. It
 * short-circuits on the two cases that cover almost every manager, using
 * indexes (`ProjectMember.userId`, `Project.managerId`), and only falls back to
 * the workspace join for owners and admins.
 *
 * It must agree with `managedProjectScope`; `managerDashboard.test.js` asserts
 * that on a fixture set, because a nav link that disagrees with the page it
 * opens is a bug in one place or the other.
 */
async function canManageProjects(userId) {
  // 1. An explicit PROJECT_MANAGER membership, or being a project's managerId.
  const [isMemberManager, isManagerOfProject] = await Promise.all([
    ProjectMember.exists({ userId, role: PROJECT_ROLES.PROJECT_MANAGER }),
    Project.exists({ managerId: userId }),
  ]);
  if (isMemberManager || isManagerOfProject) return true;

  // 2. Workspace owners/admins inherit project permissions — but only in
  //    projects where they hold no ProjectMember row of their own, because an
  //    explicit membership (VIEWER included) outranks the inherited role.
  const [ownedWorkspaces, adminMemberships, memberships] = await Promise.all([
    Workspace.find({ ownerId: userId }).select("_id"),
    WorkspaceMember.find({ userId, role: "Admin" }).select("workspaceId"),
    ProjectMember.find({ userId }).select("projectId"),
  ]);

  const workspaceIds = [
    ...new Set(
      [...ownedWorkspaces.map((w) => String(w._id)), ...adminMemberships.map((m) => String(m.workspaceId))]
    ),
  ];
  if (workspaceIds.length === 0) return false;

  return Boolean(
    await Project.exists({
      workspaceId: { $in: workspaceIds },
      _id: { $nin: memberships.map((m) => m.projectId) },
    })
  );
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
  computeProjectStats,
  getProjectMembers,
  accessibleProjectScope,
  managedProjectScope,
  canManageProjects,
  MANAGE_PROJECT_ACTION,
};
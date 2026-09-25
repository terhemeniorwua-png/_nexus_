"use strict";

/**
 * Nexus centralized permission system.
 *
 * Roles are NOT global. Permission is always evaluated in a context:
 *
 *   JWT
 *    ↓
 *   Authentication
 *    ↓
 *   Authenticated user
 *    ↓
 *   Workspace membership / Project membership
 *    ↓
 *   Role
 *    ↓
 *   Permission
 *    ↓
 *   Resource access
 *
 * Two contexts exist:
 *   - workspace context  → workspace roles  (WORKSPACE_OWNER / ADMIN / MEMBER / VIEWER)
 *   - project context    → project roles    (PROJECT_MANAGER / MEMBER / VIEWER / COLLABORATOR,
 *                                            plus derived WORKSPACE_OWNER / ADMIN for owners/admins)
 *
 * The permission matrices below map a role to the set of actions it may
 * perform. Controllers and routes must NOT scatter `if (role === ...)`
 * checks; they should call hasWorkspacePermission / hasProjectPermission or
 * the middleware in `middleware/authorize.js`.
 */

// ---------------------------------------------------------------------------
// Role constants
// ---------------------------------------------------------------------------

const WORKSPACE_ROLES = Object.freeze({
  WORKSPACE_OWNER: "WORKSPACE_OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
  VIEWER: "VIEWER",
});

const PROJECT_ROLES = Object.freeze({
  PROJECT_MANAGER: "PROJECT_MANAGER",
  MEMBER: "MEMBER",
  VIEWER: "VIEWER",
  COLLABORATOR: "COLLABORATOR",
});

// ---------------------------------------------------------------------------
// Action constants
// ---------------------------------------------------------------------------

// Workspace-context actions
const WORKSPACE_ACTIONS = Object.freeze([
  "view_workspace",
  "manage_workspace",
  "view_workspace_members",
  "manage_workspace_members",
  "view_channels",
  "manage_channels",
  "send_message",
  "create_project",
  "view_teams",
  "manage_teams",
  "manage_team_members",
  "view_workspace_activity",
  "view_document",
  "create_document",
  "update_document",
  "delete_document",
]);

// Project-context actions
const PROJECT_ACTIONS = Object.freeze([
  "view_project",
  "update_project",
  "delete_project",
  "view_task",
  "create_task",
  "update_task",
  "delete_task",
  "assign_task",
  "create_subtask",
  "update_subtask",
  "delete_subtask",
  "complete_subtask",
  "submit_task",
  "review_task",
  "approve_task",
  "request_task_changes",
  "view_deliverable",
  "upload_deliverable",
  "review_deliverable",
  "approve_deliverable",
  "request_changes",
  // Phase 12 deliverable lifecycle.
  "create_deliverable",
  "submit_deliverable",
  "create_deliverable_version",
  "request_deliverable_changes",
  "view_project_members",
  "invite_project_member",
  "remove_project_member",
  "view_project_resources",
  "create_project_resource",
  "update_project_resource",
  "delete_project_resource",
  "view_document",
  "create_document",
  "update_document",
  "delete_document",
  "comment",
  "view_activity",
]);

// ---------------------------------------------------------------------------
// Permission matrices
// ---------------------------------------------------------------------------

const ALL_WORKSPACE_ACTIONS = [...WORKSPACE_ACTIONS];

const WORKSPACE_PERMISSIONS = Object.freeze({
  WORKSPACE_OWNER: ALL_WORKSPACE_ACTIONS,
  ADMIN: ALL_WORKSPACE_ACTIONS,
  MEMBER: Object.freeze([
    "view_workspace",
    "view_workspace_members",
    "view_channels",
    "send_message",
    "create_project",
    "view_teams",
    "view_workspace_activity",
    "view_document",
    "create_document",
    "update_document",
  ]),
  VIEWER: Object.freeze([
    "view_workspace",
    "view_workspace_members",
    "view_channels",
    "view_teams",
    "view_workspace_activity",
    "view_document",
  ]),
});

const ALL_PROJECT_ACTIONS = [...PROJECT_ACTIONS];

const PROJECT_MANAGER_ACTIONS = Object.freeze([
  "view_project",
  "update_project",
  "view_task",
  "create_task",
  "update_task",
  "delete_task",
  "assign_task",
  "create_subtask",
  "update_subtask",
  "delete_subtask",
  "complete_subtask",
  "submit_task",
  "review_task",
  "approve_task",
  "request_task_changes",
  "view_deliverable",
  "upload_deliverable",
  "review_deliverable",
  "approve_deliverable",
  "request_changes",
  // Phase 12 deliverable lifecycle.
  "create_deliverable",
  "submit_deliverable",
  "create_deliverable_version",
  "request_deliverable_changes",
  "view_project_members",
  "invite_project_member",
  "remove_project_member",
  "view_project_resources",
  "create_project_resource",
  "update_project_resource",
  "delete_project_resource",
  "view_document",
  "create_document",
  "update_document",
  "delete_document",
  "comment",
  "view_activity",
]);

const MEMBER_ACTIONS = Object.freeze([
  "view_project",
  "view_task",
  "update_task", // restricted to tasks assigned to the user (taskOwnership middleware)
  "create_subtask",
  "update_subtask",
  "delete_subtask",
  "complete_subtask",
  "submit_task", // worker transitions: assignee-only (IN_PROGRESS → SUBMITTED)
  "view_deliverable",
  "upload_deliverable", // restricted to deliverables of the user's assigned tasks
  "create_deliverable", // own assigned tasks only (enforced by the deliverable service)
  "submit_deliverable", // own assigned tasks only
  "create_deliverable_version", // own assigned tasks only
  "view_project_members",
  "view_project_resources",
  "view_document",
  "create_document",
  "update_document",
  "comment",
  "view_activity",
]);

const VIEWER_ACTIONS = Object.freeze([
  "view_project",
  "view_task",
  "view_deliverable",
  "view_project_members",
  "view_project_resources",
  "view_document",
  "view_activity",
]);

const COLLABORATOR_ACTIONS = Object.freeze([
  "view_project",
  "view_task",
  "update_task", // restricted to tasks assigned to the user (taskOwnership middleware)
  "create_subtask",
  "update_subtask",
  "delete_subtask",
  "complete_subtask",
  "submit_task", // worker transitions: assignee-only (IN_PROGRESS → SUBMITTED)
  "view_deliverable",
  "upload_deliverable", // restricted to deliverables of the user's assigned tasks
  "create_deliverable", // own assigned tasks only (enforced by the deliverable service)
  "submit_deliverable", // own assigned tasks only
  "create_deliverable_version", // own assigned tasks only
  "view_project_members",
  "view_project_resources",
  "view_document",
  "view_activity",
]);

const PROJECT_PERMISSIONS = Object.freeze({
  // Derived roles: a workspace owner/admin acting inside a project of their
  // workspace receives administrative project permissions. This is an explicit
  // administrative rule — regular workspace members get NO project access
  // without a ProjectMember row (or being the project's managerId).
  WORKSPACE_OWNER: ALL_PROJECT_ACTIONS,
  ADMIN: ALL_PROJECT_ACTIONS,
  PROJECT_MANAGER: PROJECT_MANAGER_ACTIONS,
  MEMBER: MEMBER_ACTIONS,
  VIEWER: VIEWER_ACTIONS,
  COLLABORATOR: COLLABORATOR_ACTIONS,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasWorkspacePermission(role, action) {
  const allowed = WORKSPACE_PERMISSIONS[role];
  return Boolean(allowed && allowed.includes(action));
}

function hasProjectPermission(role, action) {
  const allowed = PROJECT_PERMISSIONS[role];
  return Boolean(allowed && allowed.includes(action));
}

function hasRole(role) {
  return Boolean(PROJECT_PERMISSIONS[role] || WORKSPACE_PERMISSIONS[role]);
}

/**
 * Canonicalize a workspace membership/owner state into a workspace role.
 * `memberRole` is the raw WorkspaceMember.role ("Admin" / "Member" / "Viewer").
 */
function workspaceRole(memberRole, isOwner) {
  if (isOwner) return WORKSPACE_ROLES.WORKSPACE_OWNER;
  if (memberRole === "Admin") return WORKSPACE_ROLES.ADMIN;
  if (memberRole === "Viewer") return WORKSPACE_ROLES.VIEWER;
  if (memberRole === "Member") return WORKSPACE_ROLES.MEMBER;
  return WORKSPACE_ROLES.MEMBER;
}

module.exports = {
  WORKSPACE_ROLES,
  PROJECT_ROLES,
  WORKSPACE_ACTIONS,
  PROJECT_ACTIONS,
  WORKSPACE_PERMISSIONS,
  PROJECT_PERMISSIONS,
  PROJECT_MANAGER_ACTIONS,
  MEMBER_ACTIONS,
  VIEWER_ACTIONS,
  COLLABORATOR_ACTIONS,
  hasWorkspacePermission,
  hasProjectPermission,
  hasRole,
  workspaceRole,
};
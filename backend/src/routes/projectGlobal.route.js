const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const {
  projectTeamContext,
  globalProjectAccess,
  requireProjectPermission,
  requirePermission,
} = require("../middleware/authorize");
const {
  listGlobalProjects,
  getProjectMeta,
  createProject,
  getProject,
  updateProject,
  deleteProject,
} = require("../controllers/project.controller");
const {
  listProjectMembers,
  inviteProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
} = require("../controllers/projectMember.controller");
const {
  listProjectTasks,
  createProjectTask,
} = require("../controllers/task.controller");
const { listDiscussion, postDiscussion } = require("../controllers/discussion.controller");

const router = express.Router({ mergeParams: true });

/**
 * Phase 8 global project routes.
 *
 * - POST /api/projects derives the workspace from the team (teamId in the
 *   body) and the creator's permission to create projects in that workspace.
 * - GET /api/projects returns only projects the user may access, across all
 *   of their workspaces, and applies ?status / ?priority / ?teamId filters on
 *   top of that authorized set.
 * - /:projectId routes resolve the workspace from the project itself and
 *   require the user's project-context permission.
 */

function requireProjectDetails(req, _res, next) {
  // Marks the shared createProject controller so it enforces the mandatory
  // team + manager fields required on the global route.
  req.requireProjectDetails = true;
  next();
}

// must be defined BEFORE /:projectId so "meta" is not captured as an id.
router.get("/meta", authenticate, getProjectMeta);

router.get("/", authenticate, listGlobalProjects);

router.post("/", authenticate, projectTeamContext, requirePermission("create_project"), requireProjectDetails, createProject);

router.use("/:projectId", authenticate, globalProjectAccess);

router.get("/:projectId", requireProjectPermission("view_project"), getProject);
router.patch("/:projectId", requireProjectPermission("update_project"), updateProject);
router.delete("/:projectId", requireProjectPermission("delete_project"), deleteProject);

// Phase 9 — project member management (explicit project access control).
// Requests pass through globalProjectAccess (via the /:projectId mount),
// which verifies the requester has ANY role on the project first, then the
// specific member-management permission is checked below.
router.get("/:projectId/members", requireProjectPermission("view_project_members"), listProjectMembers);
router.post("/:projectId/members", requireProjectPermission("invite_project_member"), inviteProjectMember);
router.patch("/:projectId/members/:userId", requireProjectPermission("invite_project_member"), updateProjectMemberRole);
router.delete("/:projectId/members/:userId", requireProjectPermission("remove_project_member"), removeProjectMember);

// Phase 10 — project task list / creation. Access is enforced through
// globalProjectAccess (the /:projectId mount); list is project-scoped and
// filtered server-side.
router.get("/:projectId/tasks", requireProjectPermission("view_task"), listProjectTasks);
router.post("/:projectId/tasks", requireProjectPermission("create_task"), createProjectTask);

// Phase 19 — project discussion. Registered here so it sits behind the same
// globalProjectAccess mount as every other project-scoped resource: no route to
// a project's discussion exists that does not first prove project access.
router.get("/:projectId/discussion", requireProjectPermission("view_project"), listDiscussion);
router.post("/:projectId/discussion", requireProjectPermission("comment"), postDiscussion);

module.exports = router;
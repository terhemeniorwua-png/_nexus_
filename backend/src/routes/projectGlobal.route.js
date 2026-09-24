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

module.exports = router;
const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf } = require("../middleware/roleMiddleware");
const {
  projectAccess,
  requireProjectPermission,
  requirePermission,
} = require("../middleware/authorize");
const {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
} = require("../controllers/project.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf);

router.get("/", requirePermission("view_workspace"), listProjects);
router.post("/", requirePermission("create_project"), createProject);

router.use("/:projectId", projectAccess);

router.get("/:projectId", requireProjectPermission("view_project"), getProject);
router.patch("/:projectId", requireProjectPermission("update_project"), updateProject);
router.delete("/:projectId", requireProjectPermission("delete_project"), deleteProject);

module.exports = router;
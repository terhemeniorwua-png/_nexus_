const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf, requireRole } = require("../middleware/roleMiddleware");
const {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
} = require("../controllers/project.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf);

router.get(
  "/",
  requireRole("Admin", "Member", "Viewer"),
  listProjects
);
router.post("/", requireRole("Admin", "Member"), createProject);

router.get(
  "/:projectId",
  requireRole("Admin", "Member", "Viewer"),
  getProject
);
router.patch("/:projectId", requireRole("Admin", "Member"), updateProject);
router.delete("/:projectId", requireRole("Admin"), deleteProject);

module.exports = router;
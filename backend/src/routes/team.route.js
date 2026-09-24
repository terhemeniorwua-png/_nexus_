const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const {
  requirePermission,
  workspaceFromBody,
  teamAccess,
  requireTeamMemberManagement,
} = require("../middleware/authorize");
const {
  createTeam,
  getTeam,
  updateTeam,
  deleteTeam,
  listTeamMembers,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
} = require("../controllers/team.controller");

const router = express.Router();

router.post("/", authenticate, workspaceFromBody, requirePermission("manage_teams"), createTeam);

router.get("/:teamId", authenticate, teamAccess, requirePermission("view_teams"), getTeam);
router.patch("/:teamId", authenticate, teamAccess, requirePermission("manage_teams"), updateTeam);
router.delete("/:teamId", authenticate, teamAccess, requirePermission("manage_teams"), deleteTeam);

router.get("/:teamId/members", authenticate, teamAccess, requirePermission("view_teams"), listTeamMembers);
router.post("/:teamId/members", authenticate, teamAccess, requireTeamMemberManagement, addTeamMember);
router.patch(
  "/:teamId/members/:userId",
  authenticate,
  teamAccess,
  requireTeamMemberManagement,
  updateTeamMemberRole
);
router.delete(
  "/:teamId/members/:userId",
  authenticate,
  teamAccess,
  requireTeamMemberManagement,
  removeTeamMember
);

module.exports = router;
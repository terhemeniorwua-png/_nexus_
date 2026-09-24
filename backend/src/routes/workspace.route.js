const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/authorize");
const {
  listWorkspaces,
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listMembers,
  addMember,
  updateMemberRole,
  removeMember,
  listChannels,
  createChannel,
} = require("../controllers/workspace.controller");
const { listWorkspaceTeams } = require("../controllers/team.controller");

const router = express.Router();

router.get("/", authenticate, listWorkspaces);
router.post("/", authenticate, createWorkspace);

router.get("/:workspaceId", authenticate, memberOf, requirePermission("view_workspace"), getWorkspace);
router.patch(
  "/:workspaceId",
  authenticate,
  memberOf,
  requirePermission("manage_workspace"),
  updateWorkspace
);
router.delete(
  "/:workspaceId",
  authenticate,
  memberOf,
  requirePermission("manage_workspace"),
  deleteWorkspace
);

router.get(
  "/:workspaceId/members",
  authenticate,
  memberOf,
  requirePermission("view_workspace_members"),
  listMembers
);
router.post(
  "/:workspaceId/members",
  authenticate,
  memberOf,
  requirePermission("manage_workspace_members"),
  addMember
);
router.patch(
  "/:workspaceId/members/:userId",
  authenticate,
  memberOf,
  requirePermission("manage_workspace_members"),
  updateMemberRole
);
router.delete(
  "/:workspaceId/members/:userId",
  authenticate,
  memberOf,
  requirePermission("manage_workspace_members"),
  removeMember
);

router.get("/:workspaceId/channels", authenticate, memberOf, requirePermission("view_channels"), listChannels);
router.post(
  "/:workspaceId/channels",
  authenticate,
  memberOf,
  requirePermission("manage_channels"),
  createChannel
);

router.get(
  "/:workspaceId/teams",
  authenticate,
  memberOf,
  requirePermission("view_teams"),
  listWorkspaceTeams
);

module.exports = router;
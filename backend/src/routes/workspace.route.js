const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf, requireRole } = require("../middleware/roleMiddleware");
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

const router = express.Router();

router.get("/", authenticate, listWorkspaces);
router.post("/", authenticate, createWorkspace);

router.get("/:workspaceId", authenticate, memberOf, getWorkspace);
router.patch("/:workspaceId", authenticate, memberOf, requireRole("Admin"), updateWorkspace);
router.delete("/:workspaceId", authenticate, memberOf, requireRole("Admin"), deleteWorkspace);

router.get(
  "/:workspaceId/members",
  authenticate,
  memberOf,
  requireRole("Admin", "Member", "Viewer"),
  listMembers
);
router.post("/:workspaceId/members", authenticate, memberOf, requireRole("Admin", "Member"), addMember);
router.patch(
  "/:workspaceId/members/:userId",
  authenticate,
  memberOf,
  requireRole("Admin"),
  updateMemberRole
);
router.delete(
  "/:workspaceId/members/:userId",
  authenticate,
  memberOf,
  requireRole("Admin"),
  removeMember
);

router.get("/:workspaceId/channels", authenticate, memberOf, listChannels);
router.post(
  "/:workspaceId/channels",
  authenticate,
  memberOf,
  requireRole("Admin", "Member"),
  createChannel
);

module.exports = router;
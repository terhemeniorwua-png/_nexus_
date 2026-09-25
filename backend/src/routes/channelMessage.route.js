const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const {
  listChannelMessagesById,
  sendChannelMessageById,
} = require("../controllers/message.controller");

const router = express.Router();

/**
 * Channel-scoped message routes (spec §9):
 *
 *   GET  /api/channels/:channelId/messages
 *   POST /api/channels/:channelId/messages
 *
 * The workspace-scoped equivalent lives in `message.route.js` and is the one
 * the Nexus frontend uses. Both reach the same service functions.
 *
 * Note the absence of `memberOf` / `requirePermission` here, unlike
 * `message.route.js`. Those middlewares authorize against `req.workspace`,
 * which is resolved from `:workspaceId` — a parameter this route deliberately
 * does not have. The workspace here is derived from the channel document
 * itself, and `messaging.service.resolveChannelAccess` performs the same
 * membership check against that derived workspace. So the check still happens
 * on every request, it just cannot be short-circuited by naming a workspace
 * the caller does not belong to: the request contains no workspace at all.
 */
router.use(authenticate);

router.get("/:channelId/messages", listChannelMessagesById);
router.post("/:channelId/messages", sendChannelMessageById);

module.exports = router;

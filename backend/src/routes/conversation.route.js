const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const {
  listConversations,
  listDirectMessages,
  sendDirectMessage,
  markDirectThreadRead,
} = require("../controllers/conversation.controller");

/**
 * Phase 19 — direct messages.
 *
 * These routes carry no `memberOf` or `requirePermission` middleware on
 * purpose. A workspace action such as `send_message` is about the whole
 * workspace, and widening it to mean "may speak to this one person" would
 * quietly grant that to everybody. The rule is instead enforced in the
 * messaging service, per request, against the two users involved: they must
 * share a workspace. Project access stays a separate, independently enforced
 * question — messaging somebody never answers it.
 */
const router = express.Router();

router.use(authenticate);

router.get("/conversations", listConversations);
router.get("/direct/:userId", listDirectMessages);
router.post("/direct/:userId", sendDirectMessage);
router.patch("/direct/:userId/read", markDirectThreadRead);

module.exports = router;

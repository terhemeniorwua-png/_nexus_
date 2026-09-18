const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf, requireRole } = require("../middleware/roleMiddleware");
const { listMessages, sendMessage } = require("../controllers/message.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf);

router.get("/", requireRole("Admin", "Member", "Viewer"), listMessages);
router.post("/", requireRole("Admin", "Member"), sendMessage);

module.exports = router;
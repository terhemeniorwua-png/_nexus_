const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/authorize");
const { listMessages, sendMessage } = require("../controllers/message.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf, requirePermission("view_channels"));

router.get("/", listMessages);
router.post("/", requirePermission("send_message"), sendMessage);

module.exports = router;
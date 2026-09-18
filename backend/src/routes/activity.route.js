const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf, requireRole } = require("../middleware/roleMiddleware");
const { listActivity } = require("../controllers/activity.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf, requireRole("Admin", "Member", "Viewer"));
router.get("/", listActivity);

module.exports = router;
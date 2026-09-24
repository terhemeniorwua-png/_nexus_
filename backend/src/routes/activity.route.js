const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/authorize");
const { listActivity } = require("../controllers/activity.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf, requirePermission("view_workspace_activity"));
router.get("/", listActivity);

module.exports = router;
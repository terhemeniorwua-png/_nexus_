const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { getOverview, getMyTasks } = require("../controllers/overview.controller");
const { getDashboard } = require("../controllers/dashboard.controller");

const router = express.Router();

router.get("/overview", authenticate, getOverview);
router.get("/tasks", authenticate, getMyTasks);
// Phase 20 dashboard. Mounted on the existing authenticated /api/me router
// rather than a new /api/dashboard, because it is the same thing: the
// authenticated user's own data, behind the same middleware.
router.get("/dashboard", authenticate, getDashboard);

module.exports = router;
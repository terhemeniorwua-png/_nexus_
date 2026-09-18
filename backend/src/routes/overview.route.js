const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { getOverview, getMyTasks } = require("../controllers/overview.controller");

const router = express.Router();

router.get("/overview", authenticate, getOverview);
router.get("/tasks", authenticate, getMyTasks);

module.exports = router;
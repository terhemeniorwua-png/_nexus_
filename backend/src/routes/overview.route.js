const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { getOverview } = require("../controllers/overview.controller");

const router = express.Router();

router.get("/overview", authenticate, getOverview);

module.exports = router;
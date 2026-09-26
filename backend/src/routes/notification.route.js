const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const {
  listNotifications,
  markRead,
  markAllRead,
} = require("../controllers/notification.controller");

const router = express.Router();

router.get("/", authenticate, listNotifications);
router.post("/read-all", authenticate, markAllRead);
router.patch("/:id", authenticate, markRead);

module.exports = router;
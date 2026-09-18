const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf, requireRole } = require("../middleware/roleMiddleware");
const {
  getBoardHandler,
  createColumn,
  updateColumn,
  deleteColumn,
  createTask,
  updateTask,
  deleteTask,
  handleMoveTask,
} = require("../controllers/board.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf);

router.get("/board", requireRole("Admin", "Member", "Viewer"), getBoardHandler);

router.post("/columns", requireRole("Admin", "Member"), createColumn);
router.patch("/columns/:columnId", requireRole("Admin", "Member"), updateColumn);
router.delete("/columns/:columnId", requireRole("Admin"), deleteColumn);

router.post("/tasks", requireRole("Admin", "Member"), createTask);
router.patch("/tasks/:taskId", requireRole("Admin", "Member"), updateTask);
router.delete("/tasks/:taskId", requireRole("Admin", "Member"), deleteTask);
router.post("/tasks/:taskId/move", requireRole("Admin", "Member"), handleMoveTask);

module.exports = router;
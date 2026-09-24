const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const {
  taskAccess,
  subtaskTaskAccess,
  requireTaskOwnership,
  requireProjectPermission,
} = require("../middleware/authorize");
const {
  getTask,
  updateTaskDetails,
  deleteTask,
  changeTaskStatus,
  listSubtasks,
  createSubtask,
  getSubtask,
  updateSubtask,
  deleteSubtask,
} = require("../controllers/task.controller");

const router = express.Router({ mergeParams: true });

// --- /api/tasks/:taskId -----------------------------------------------------
router.get("/tasks/:taskId", authenticate, taskAccess, requireProjectPermission("view_task"), getTask);

router.patch(
  "/tasks/:taskId",
  authenticate,
  taskAccess,
  requireProjectPermission("update_task"),
  requireTaskOwnership,
  updateTaskDetails
);

router.delete(
  "/tasks/:taskId",
  authenticate,
  taskAccess,
  requireProjectPermission("delete_task"),
  requireTaskOwnership,
  deleteTask
);

// Status workflow. The dedicated endpoint is the ONLY way to change status;
// generic updates never accept `status`. Transition rules + per-transition
// permissions are enforced centrally in assertStatusTransition.
router.patch(
  "/tasks/:taskId/status",
  authenticate,
  taskAccess,
  requireProjectPermission("update_task"),
  changeTaskStatus
);

// --- /api/tasks/:taskId/subtasks --------------------------------------------
router.get(
  "/tasks/:taskId/subtasks",
  authenticate,
  taskAccess,
  requireProjectPermission("view_task"),
  listSubtasks
);

router.post(
  "/tasks/:taskId/subtasks",
  authenticate,
  taskAccess,
  requireProjectPermission("create_subtask"),
  requireTaskOwnership,
  createSubtask
);

// --- /api/subtasks/:subtaskId ------------------------------------------------
router.get(
  "/subtasks/:subtaskId",
  authenticate,
  subtaskTaskAccess,
  requireProjectPermission("view_task"),
  getSubtask
);

router.patch(
  "/subtasks/:subtaskId",
  authenticate,
  subtaskTaskAccess,
  requireProjectPermission("update_subtask"),
  requireTaskOwnership,
  updateSubtask
);

router.delete(
  "/subtasks/:subtaskId",
  authenticate,
  subtaskTaskAccess,
  requireProjectPermission("delete_subtask"),
  requireTaskOwnership,
  deleteSubtask
);

module.exports = router;
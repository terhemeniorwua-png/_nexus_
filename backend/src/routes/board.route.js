const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf } = require("../middleware/roleMiddleware");
const {
  projectAccess,
  requireProjectPermission,
  taskOwnership,
} = require("../middleware/authorize");
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
const { listComments, addComment, deleteComment } = require("../controllers/comment.controller");
const { createDeliverable } = require("../controllers/deliverable.controller");
const { createDeliverableUpload, handleUploadError } = require("../middleware/upload");

const deliverableUpload = createDeliverableUpload("file");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf, projectAccess);

router.get("/board", requireProjectPermission("view_project"), getBoardHandler);

router.post("/columns", requireProjectPermission("update_project"), createColumn);
router.patch("/columns/:columnId", requireProjectPermission("update_project"), updateColumn);
router.delete("/columns/:columnId", requireProjectPermission("update_project"), deleteColumn);

router.post("/tasks", requireProjectPermission("create_task"), createTask);
router.patch("/tasks/:taskId", requireProjectPermission("update_task"), taskOwnership, updateTask);
router.delete("/tasks/:taskId", requireProjectPermission("delete_task"), deleteTask);
router.post(
  "/tasks/:taskId/move",
  requireProjectPermission("update_task"),
  taskOwnership,
  handleMoveTask
);

// Deliverable submission for a specific task. Project-scoped alias of the
// canonical `POST /api/tasks/:taskId/deliverables` (Phase 12): same service,
// same ownership rule, same multipart body. Ownership is enforced in the
// deliverable service, which knows about the assignee, the creator and
// `assign_task` holders in one place.
router.post(
  "/tasks/:taskId/deliverables",
  requireProjectPermission("create_deliverable"),
  deliverableUpload,
  handleUploadError,
  createDeliverable
);

router.get("/tasks/:taskId/comments", requireProjectPermission("view_task"), listComments);
router.post("/tasks/:taskId/comments", requireProjectPermission("comment"), addComment);
router.delete(
  "/tasks/:taskId/comments/:commentId",
  requireProjectPermission("comment"),
  deleteComment
);

module.exports = router;
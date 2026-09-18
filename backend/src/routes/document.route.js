const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf, requireRole } = require("../middleware/roleMiddleware");
const {
  listDocuments,
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
} = require("../controllers/document.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf);

router.get("/", requireRole("Admin", "Member", "Viewer"), listDocuments);
router.post("/", requireRole("Admin", "Member"), createDocument);

router.get("/:docId", requireRole("Admin", "Member", "Viewer"), getDocument);
router.patch("/:docId", requireRole("Admin", "Member"), updateDocument);
router.delete("/:docId", requireRole("Admin", "Member"), deleteDocument);

module.exports = router;
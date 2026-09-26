const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf } = require("../middleware/roleMiddleware");
const { requirePermission, documentAccess } = require("../middleware/authorize");
const {
  listDocuments,
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
} = require("../controllers/document.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf);

router.get("/", requirePermission("view_document"), listDocuments);
router.post("/", requirePermission("create_document"), createDocument);

router.get("/:docId", documentAccess("view_document"), getDocument);
router.patch("/:docId", documentAccess("update_document"), updateDocument);
router.delete("/:docId", documentAccess("delete_document"), deleteDocument);

module.exports = router;
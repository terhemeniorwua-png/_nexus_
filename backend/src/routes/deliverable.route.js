const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf } = require("../middleware/roleMiddleware");
const { projectAccess, requireProjectPermission } = require("../middleware/authorize");
const {
  listProjectDeliverables,
  getDeliverable,
  resubmitDeliverable,
  reviewDeliverable,
} = require("../controllers/deliverable.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf, projectAccess);

router.get("/", requireProjectPermission("view_deliverable"), listProjectDeliverables);
router.get("/:deliverableId", requireProjectPermission("view_deliverable"), getDeliverable);
router.patch("/:deliverableId", requireProjectPermission("upload_deliverable"), resubmitDeliverable);
router.post("/:deliverableId/review", requireProjectPermission("review_deliverable"), reviewDeliverable);

module.exports = router;
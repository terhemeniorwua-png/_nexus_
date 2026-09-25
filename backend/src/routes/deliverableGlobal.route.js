"use strict";

/**
 * Phase 12 — global deliverable routes (`/api/deliverables/...`).
 *
 * `deliverableAccess` resolves Deliverable → Task → Project → Workspace and
 * applies the Phase 9 access model before any handler runs, so every route
 * below is already inside an authorized project. Each route then asks for the
 * one permission it needs.
 *
 * The gate is attached per route rather than with `router.use`: a `use`
 * middleware runs before Express has matched a route, so `req.params` is still
 * empty and the deliverable id is not readable yet.
 */

const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { deliverableAccess, requireProjectPermission } = require("../middleware/authorize");
const { createDeliverableUpload, handleUploadError } = require("../middleware/upload");
const {
  approveVersion,
  createVersion,
  downloadVersion,
  getDeliverable,
  getVersion,
  listVersions,
  patchVersion,
  requestChanges,
  startReviewHandler,
  submitVersionHandler,
} = require("../controllers/deliverable.controller");

const router = express.Router();

const upload = createDeliverableUpload("file");

/** authenticate → deliverableAccess → the route's permission → its handlers. */
const guarded = (permission, ...handlers) => [
  authenticate,
  deliverableAccess,
  requireProjectPermission(permission),
  ...handlers,
];

router.get("/:deliverableId", guarded("view_deliverable", getDeliverable));

// --- versions --------------------------------------------------------------
router.get("/:deliverableId/versions", guarded("view_deliverable", listVersions));

router.post(
  "/:deliverableId/versions",
  guarded("create_deliverable_version", upload, handleUploadError, createVersion)
);

router.get("/:deliverableId/versions/:versionNumber", guarded("view_deliverable", getVersion));

router.get(
  "/:deliverableId/versions/:versionNumber/download",
  guarded("view_deliverable", downloadVersion)
);

router.patch(
  "/:deliverableId/versions/:versionNumber",
  guarded("upload_deliverable", patchVersion)
);

// --- submission + review ---------------------------------------------------
router.patch(
  "/:deliverableId/versions/:versionNumber/submit",
  guarded("submit_deliverable", submitVersionHandler)
);

router.patch(
  "/:deliverableId/versions/:versionNumber/review",
  guarded("review_deliverable", startReviewHandler)
);

router.patch(
  "/:deliverableId/versions/:versionNumber/approve",
  guarded("approve_deliverable", approveVersion)
);

router.patch(
  "/:deliverableId/versions/:versionNumber/request-changes",
  guarded("request_deliverable_changes", requestChanges)
);

module.exports = router;

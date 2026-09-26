const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

/**
 * Phase 12 — Deliverable lifecycle.
 *
 * DRAFT → SUBMITTED → UNDER_REVIEW → (APPROVED | CHANGES_REQUESTED)
 *
 * The state lives on the *deliverable* as the aggregate root: it mirrors the
 * current version's review state so a single read answers "where is this
 * submission?". Per-version history is preserved in `deliverableversions`, and
 * every review decision is kept in `deliverablereviews` — nothing is
 * overwritten, so the whole v1 → v2 → v3 trail survives.
 */
const STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED"];

const deliverableSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: [true, "Deliverable must belong to a task"],
      index: true,
      // One primary deliverable per task (Phase 12 §6): many versions, one
      // aggregate. The unique index is the concurrency guard for creation.
      unique: true,
    },
    // Denormalized scope, always derived from the task → project → workspace
    // chain. Kept so list queries never need a join, never used as the
    // authorization source of truth.
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Deliverable title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    status: {
      type: String,
      enum: STATUSES,
      default: "DRAFT",
    },
    // Server-controlled. The client can never choose its own number (§8/§30).
    currentVersion: {
      type: Number,
      default: 1,
      min: [1, "Current version must be at least 1"],
    },
    // The last version that reached APPROVED, kept separate from
    // `currentVersion` so "latest" and "approved" can never be confused
    // (§45). Null until the first approval; no new version is allowed after
    // approval, so they diverge only while changes are being requested.
    approvedVersion: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

deliverableSchema.index({ projectId: 1, status: 1 });
deliverableSchema.index({ createdBy: 1, createdAt: -1 });

applyTransforms(deliverableSchema);

const Deliverable = mongoose.model("Deliverable", deliverableSchema);

module.exports = Deliverable;
module.exports.STATUSES = STATUSES;

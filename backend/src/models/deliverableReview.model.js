const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

/**
 * Phase 12 — an immutable review decision about one submitted version.
 *
 * Reviews are append-only. A deliverable therefore accumulates a defensible
 * audit trail instead of a single "currentFeedback" field that gets
 * overwritten on every round (§26, §49):
 *
 *   v1 → CHANGES_REQUESTED  "Add validation for expired tokens."
 *   v2 → CHANGES_REQUESTED  "Add better error handling."
 *   v3 → APPROVED           "All requested changes addressed."
 */
const DECISIONS = ["APPROVED", "CHANGES_REQUESTED"];

const reviewSchema = new mongoose.Schema(
  {
    deliverableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deliverable",
      required: [true, "Review must reference a deliverable"],
      index: true,
    },
    deliverableVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliverableVersion",
      required: [true, "Review must reference a version"],
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
      min: [1, "Version number must be at least 1"],
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Reviewer is required"],
      index: true,
    },
    decision: {
      type: String,
      enum: DECISIONS,
      required: [true, "Review decision is required"],
    },
    feedback: {
      type: String,
      trim: true,
      default: "",
      maxlength: [5000, "Feedback cannot exceed 5000 characters"],
    },
    reviewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ deliverableId: 1, reviewedAt: -1 });
reviewSchema.index({ deliverableVersionId: 1, reviewedAt: -1 });

// One reviewer decision per version: a version cannot be approved twice or
// both approved and rejected. The service layer also checks this, but the
// index makes the invariant hold even under a race (§57).
reviewSchema.index({ deliverableVersionId: 1, reviewerId: 1 }, { unique: true });

applyTransforms(reviewSchema);

const DeliverableReview = mongoose.model("DeliverableReview", reviewSchema);

module.exports = DeliverableReview;
module.exports.DECISIONS = DECISIONS;

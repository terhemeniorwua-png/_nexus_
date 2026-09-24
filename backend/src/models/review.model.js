const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const DECISIONS = ["APPROVED", "CHANGES_REQUESTED"];

const reviewSchema = new mongoose.Schema(
  {
    deliverableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deliverable",
      required: [true, "Review must reference a deliverable"],
      index: true,
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

applyTransforms(reviewSchema);

const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;
module.exports.DECISIONS = DECISIONS;
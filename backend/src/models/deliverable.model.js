const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED"];

const deliverableSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: [true, "Deliverable must belong to a task"],
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Submitter is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Deliverable title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    fileUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "File URL cannot exceed 1000 characters"],
    },
    version: {
      type: Number,
      default: 1,
      min: [1, "Version must be at least 1"],
    },
    status: {
      type: String,
      enum: STATUSES,
      default: "DRAFT",
    },
    submittedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

deliverableSchema.index({ taskId: 1, version: 1 });

applyTransforms(deliverableSchema);

const Deliverable = mongoose.model("Deliverable", deliverableSchema);

module.exports = Deliverable;
module.exports.STATUSES = STATUSES;
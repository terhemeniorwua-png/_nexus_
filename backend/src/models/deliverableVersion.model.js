const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

/**
 * Phase 12 — a single submitted version of a deliverable.
 *
 * A version is the immutable unit of record: once it leaves DRAFT its file,
 * description, submitter and timestamps are frozen. Requesting changes never
 * edits v1 — it records a review against it and the submitter uploads a new
 * version alongside it (§7, §47).
 */
const STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED"];

const versionSchema = new mongoose.Schema(
  {
    deliverableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deliverable",
      required: [true, "Version must belong to a deliverable"],
      index: true,
    },
    // Sequential and server-assigned. The compound unique index below is what
    // makes concurrent "create the next version" requests safe: one wins, the
    // other gets a duplicate-key 409 instead of a second v3 (§30, §57).
    versionNumber: {
      type: Number,
      required: [true, "Version number is required"],
      min: [1, "Version number must be at least 1"],
    },
    status: {
      type: String,
      enum: STATUSES,
      default: "DRAFT",
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    // --- file metadata (the bytes live in the storage service) -------------
    fileName: {
      type: String,
      required: [true, "File name is required"],
      trim: true,
      maxlength: [255, "File name cannot exceed 255 characters"],
    },
    storageKey: {
      type: String,
      required: [true, "Storage key is required"],
      trim: true,
      maxlength: [512, "Storage key cannot exceed 512 characters"],
    },
    // Never a filesystem path: this is the API route that serves the file
    // *after* authorization, so it is safe to hand to the client (§46).
    fileUrl: {
      type: String,
      required: true,
      trim: true,
    },
    fileSize: {
      type: Number,
      required: true,
      min: [1, "File cannot be empty"],
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
      maxlength: [150, "MIME type cannot exceed 150 characters"],
    },
    checksum: {
      type: String,
      default: "",
      trim: true,
      maxlength: [128, "Checksum cannot exceed 128 characters"],
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

versionSchema.index({ deliverableId: 1, versionNumber: 1 }, { unique: true });
versionSchema.index({ deliverableId: 1, status: 1 });

applyTransforms(versionSchema);

const DeliverableVersion = mongoose.model("DeliverableVersion", versionSchema);

module.exports = DeliverableVersion;
module.exports.STATUSES = STATUSES;

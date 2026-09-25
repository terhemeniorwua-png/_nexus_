const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const TYPES = [
  "TASK_ASSIGNED",
  "TASK_COMPLETED",
  "TASK_STATUS_CHANGED",
  "DELIVERABLE_SUBMITTED",
  "DELIVERABLE_REVIEWED",
  "PROJECT_INVITATION",
  "COMMENT_MENTION",
  "MENTION",
  "DIRECT_MESSAGE",
  "TASK_MOVED",
  "MEMBER_ADDED",
  "DOCUMENT_SHARED",
];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
    },
    type: {
      type: String,
      enum: TYPES,
      default: "TASK_ASSIGNED",
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
      maxlength: [300, "Notification title is too long"],
    },
    body: {
      type: String,
      default: "",
      maxlength: [2000, "Notification body is too long"],
    },
    link: {
      type: String,
      default: "",
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    entityType: {
      type: String,
      // `conversation` was added for Phase 19 direct messages, whose target is
      // a thread rather than a task or a project.
      enum: ["project", "task", "subtask", "deliverable", "review", "comment", "member", "channel", "workspace", "conversation"],
      default: null,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

applyTransforms(notificationSchema);

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
module.exports.TYPES = TYPES;
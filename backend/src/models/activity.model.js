const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const activitySchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: [true, "Action is required"],
      enum: [
        "TASK_CREATED",
        "TASK_MOVED",
        "TASK_UPDATED",
        "TASK_DELETED",
        "PROJECT_CREATED",
        "PROJECT_UPDATED",
        "DOCUMENT_CREATED",
        "DOCUMENT_UPDATED",
        "MEMBERSHIP_UPDATED",
        "COMMENT_ADDED",
        "CHANNEL_JOINED",
      ],
    },
    targetType: {
      type: String,
      enum: ["task", "project", "document", "member", "channel", "workspace", "comment"],
      default: "task",
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

activitySchema.index({ workspaceId: 1, createdAt: -1 });

applyTransforms(activitySchema);

const Activity = mongoose.model("Activity", activitySchema);

module.exports = Activity;
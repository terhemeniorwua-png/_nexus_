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
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
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
        "TASK_STARTED",
        "TASK_MOVED",
        "TASK_UPDATED",
        "TASK_COMPLETED",
        "TASK_DELETED",
        "SUBTASK_COMPLETED",
        "DELIVERABLE_CREATED",
        "DELIVERABLE_VERSION_CREATED",
        "DELIVERABLE_SUBMITTED",
        "DELIVERABLE_REVIEW_STARTED",
        "DELIVERABLE_CHANGES_REQUESTED",
        "DELIVERABLE_APPROVED",
        "PROJECT_CREATED",
        "PROJECT_UPDATED",
        "MEMBER_INVITED",
        "DOCUMENT_CREATED",
        "DOCUMENT_UPDATED",
        "RESOURCE_ADDED",
        "MEMBERSHIP_UPDATED",
        "COMMENT_ADDED",
        "CHANNEL_JOINED",
        "TEAM_CREATED",
        "TEAM_UPDATED",
        "TEAM_DELETED",
        "TEAM_MEMBER_ADDED",
        "TEAM_MEMBER_REMOVED",
      ],
    },
    targetType: {
      type: String,
      enum: ["task", "project", "document", "member", "channel", "workspace", "comment", "subtask", "deliverable", "review", "resource", "team"],
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
activitySchema.index({ projectId: 1, createdAt: -1 });
activitySchema.index({ userId: 1, createdAt: -1 });

applyTransforms(activitySchema);

const Activity = mongoose.model("Activity", activitySchema);

module.exports = Activity;
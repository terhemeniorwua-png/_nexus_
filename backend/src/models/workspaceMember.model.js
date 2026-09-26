const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const ROLES = ["Admin", "Member", "Viewer"];

const workspaceMemberSchema = new mongoose.Schema(
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
    role: {
      type: String,
      enum: ROLES,
      default: "Member",
      required: true,
    },
  },
  { timestamps: true }
);

workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

applyTransforms(workspaceMemberSchema);

const WorkspaceMember = mongoose.model("WorkspaceMember", workspaceMemberSchema);

module.exports = WorkspaceMember;
module.exports.ROLES = ROLES;
const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const ROLES = ["PROJECT_MANAGER", "MEMBER", "VIEWER", "COLLABORATOR"];

const projectMemberSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project is required"],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    role: {
      type: String,
      enum: ROLES,
      default: "MEMBER",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

projectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });
projectMemberSchema.index({ userId: 1 });

applyTransforms(projectMemberSchema);

const ProjectMember = mongoose.model("ProjectMember", projectMemberSchema);

module.exports = ProjectMember;
module.exports.ROLES = ROLES;
const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const channelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Channel name is required"],
      trim: true,
      maxlength: [80, "Channel name cannot exceed 80 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true }
);

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Workspace name is required"],
      trim: true,
      maxlength: [120, "Workspace name cannot exceed 120 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    channels: {
      type: [channelSchema],
      default: [
        { name: "general" },
        { name: "random" },
      ],
    },
  },
  { timestamps: true }
);

applyTransforms(workspaceSchema);

const Workspace = mongoose.model("Workspace", workspaceSchema);

module.exports = Workspace;
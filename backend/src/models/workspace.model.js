const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

/**
 * Channels are embedded in the workspace rather than living in their own
 * collection: a channel has no life outside its workspace, and nesting it makes
 * "list this workspace's channels" and "does this channel belong here?" a
 * single document read.
 *
 * The `_id` Mongo assigns each embedded channel is the canonical identifier
 * used by messages and by the `channel:<id>` socket room. `slug` is the
 * human-facing, URL-safe form (`#project-help`).
 */
const channelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Channel name is required"],
      trim: true,
      maxlength: [80, "Channel name cannot exceed 80 characters"],
    },
    slug: {
      type: String,
      trim: true,
      default: "",
      maxlength: [80, "Channel slug cannot exceed 80 characters"],
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

/**
 * A channel name is turned into a slug once, here, so the server and the UI
 * can never disagree about what `#project-help` looks like.
 */
function slugifyChannelName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

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
      default: () => [
        { name: "general", slug: "general", description: "Everything workspace-wide" },
        { name: "announcements", slug: "announcements", description: "Workspace-wide updates" },
        { name: "project-help", slug: "project-help", description: "Ask for help on a project" },
      ],
    },
  },
  { timestamps: true }
);

applyTransforms(workspaceSchema);

const Workspace = mongoose.model("Workspace", workspaceSchema);

module.exports = Workspace;
module.exports.slugifyChannelName = slugifyChannelName;
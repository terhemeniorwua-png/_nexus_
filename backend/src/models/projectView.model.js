const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const projectViewSchema = new mongoose.Schema(
  {
    viewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    lastViewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

projectViewSchema.index({ viewerId: 1, projectId: 1 }, { unique: true });
projectViewSchema.index({ viewerId: 1, lastViewedAt: -1 });

applyTransforms(projectViewSchema);

const ProjectView = mongoose.model("ProjectView", projectViewSchema);

module.exports = ProjectView;
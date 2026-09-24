const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const CATEGORIES = ["RESEARCH", "AI", "DEVELOPMENT", "DESIGN", "DOCUMENTATION", "REFERENCE", "OTHER"];

const projectResourceSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Resource must belong to a project"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Resource name is required"],
      trim: true,
      maxlength: [200, "Resource name cannot exceed 200 characters"],
    },
    url: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Resource URL cannot exceed 1000 characters"],
    },
    category: {
      type: String,
      enum: CATEGORIES,
      default: "OTHER",
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
  },
  { timestamps: true }
);

projectResourceSchema.index({ projectId: 1, category: 1 });

applyTransforms(projectResourceSchema);

const ProjectResource = mongoose.model("ProjectResource", projectResourceSchema);

module.exports = ProjectResource;
module.exports.CATEGORIES = CATEGORIES;
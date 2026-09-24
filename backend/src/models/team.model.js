const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const teamSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: [true, "Team must belong to a workspace"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Team name is required"],
      trim: true,
      maxlength: [120, "Team name cannot exceed 120 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
  },
  { timestamps: true }
);

teamSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

applyTransforms(teamSchema);

const Team = mongoose.model("Team", teamSchema);

module.exports = Team;
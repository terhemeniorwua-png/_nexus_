const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const ROLES = ["TEAM_LEAD", "MEMBER"];

const teamMemberSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: [true, "Team is required"],
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

teamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });
teamMemberSchema.index({ userId: 1 });

applyTransforms(teamMemberSchema);

const TeamMember = mongoose.model("TeamMember", teamMemberSchema);

module.exports = TeamMember;
module.exports.ROLES = ROLES;
const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const profileViewSchema = new mongoose.Schema(
  {
    viewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    viewedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

profileViewSchema.index({ viewerId: 1, viewedUserId: 1 }, { unique: true });
profileViewSchema.index({ viewerId: 1, lastViewedAt: -1 });

applyTransforms(profileViewSchema);

const ProfileView = mongoose.model("ProfileView", profileViewSchema);

module.exports = ProfileView;
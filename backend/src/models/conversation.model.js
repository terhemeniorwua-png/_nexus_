const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const conversationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
      maxlength: [200, "Conversation name cannot exceed 200 characters"],
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

applyTransforms(conversationSchema);

const Conversation = mongoose.model("Conversation", conversationSchema);

module.exports = Conversation;
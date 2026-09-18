const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const messageSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    channelId: {
      type: String,
      required: [true, "Channel is required"],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: [true, "Message content is required"],
      trim: true,
      maxlength: [5000, "Message cannot exceed 5000 characters"],
    },
  },
  { timestamps: true }
);

messageSchema.index({ workspaceId: 1, channelId: 1, createdAt: -1 });

applyTransforms(messageSchema);

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
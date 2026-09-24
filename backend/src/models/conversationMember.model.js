const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

const conversationMemberSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: [true, "Conversation is required"],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
  },
  { timestamps: true }
);

conversationMemberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
conversationMemberSchema.index({ userId: 1 });

applyTransforms(conversationMemberSchema);

const ConversationMember = mongoose.model("ConversationMember", conversationMemberSchema);

module.exports = ConversationMember;
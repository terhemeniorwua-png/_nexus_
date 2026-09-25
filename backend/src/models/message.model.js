const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

/**
 * Phase 19 — one collection for all three kinds of message.
 *
 * The three communication types in Nexus differ in *who may read them*, not in
 * their shape, so they share a table and are told apart by `kind`:
 *
 *   CHANNEL  a workspace channel          → room channel:<channelId>
 *   PROJECT  a project's discussion area  → room project:<projectId>
 *   DIRECT   a private user-to-user note  → rooms user:<a> and user:<b>
 *
 * A `DIRECT` message is never addressed to a channel or a project. That is the
 * whole point of the private user rooms: a direct message must not become
 * readable because the two participants happen to share a workspace or a
 * project. See `services/messaging.service.js` for the authorization rules.
 */

const KINDS = ["CHANNEL", "PROJECT", "DIRECT"];

/** Matches the existing maxlength in the UI composer. */
const MAX_CONTENT_LENGTH = 2000;

const messageSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: KINDS,
      default: "CHANNEL",
      index: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },
    /**
     * Channel messages only. Holds the channel's `_id` (an ObjectId string).
     *
     * Rows written before Phase 19 keyed this by channel *name* instead
     * (`"general"`). `messaging.service.resolveChannel` accepts either form so
     * historical messages keep showing up in the right thread; every new
     * write uses the `_id`.
     */
    channelId: {
      type: String,
      default: null,
      index: true,
    },
    /** Project discussion only. */
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    /**
     * Direct messages only. The one other participant.
     *
     * The sender is always `userId`. A message addressed to somebody is
     * readable by exactly two people, and both are derivable from the document
     * itself — so a lookup never has to trust a client-supplied id list.
     */
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    /**
     * Direct messages only. The thread this belongs to, so a conversation list
     * can be built without scanning every message. Backed by the existing
     * Conversation / ConversationMember pair.
     */
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A message must have a sender"],
    },
    content: {
      type: String,
      required: [true, "Message content is required"],
      trim: true,
      maxlength: [MAX_CONTENT_LENGTH, `Message cannot exceed ${MAX_CONTENT_LENGTH} characters`],
    },
    /**
     * Direct messages only. Set when the recipient has seen the message.
     *
     * Deliberately a single timestamp rather than a per-user read table: a
     * direct message has exactly one recipient, and the phase asks for a simple
     * unread indicator rather than a receipt system.
     */
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Thread reads. `channelId` is a string so it can hold either form.
messageSchema.index({ workspaceId: 1, channelId: 1, createdAt: -1 });
messageSchema.index({ projectId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, createdAt: 1 });
// Inbox queries: everything sent to a user, newest first.
messageSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });

applyTransforms(messageSchema);

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
module.exports.KINDS = KINDS;
module.exports.MAX_CONTENT_LENGTH = MAX_CONTENT_LENGTH;

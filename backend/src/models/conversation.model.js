const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

/**
 * Phase 19 — a direct-message thread.
 *
 * Nexus has exactly one kind of group conversation: the two-person direct
 * message. Rather than a general-purpose thread model, a conversation is the
 * container that makes a DM listable:
 *
 *   "who have I been talking to, what was the last thing they said, and have I
 *    read it?"
 *
 * None of that is answerable from the Message table alone without scanning
 * every row, so the thread is a first-class record.
 *
 * `directKey` is the stable, order-independent identity of a pair:
 * the two user ids sorted and joined. Two people can only ever have one
 * conversation, so the key is unique — which is what stops a race between two
 * simultaneous "first messages" from creating duplicate threads.
 *
 * Note what is *not* here: no project id, no permissions, no workspace
 * membership. A conversation confers nothing. Project access is decided
 * independently, by the project authorization middleware, every single time.
 */

const directKeyFor = (a, b) => [String(a), String(b)].sort().join(":");

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
    /**
     * Direct messages: the sorted "a:b" identity of the two participants.
     * Unused for any other conversation kind.
     */
    directKey: {
      type: String,
      default: null,
      index: { unique: true, sparse: true },
    },
    /**
     * The workspace the two participants share. Recorded for context and for
     * grouping the inbox — it is never used to authorize project access.
     */
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

applyTransforms(conversationSchema);

const Conversation = mongoose.model("Conversation", conversationSchema);

module.exports = Conversation;
module.exports.directKeyFor = directKeyFor;

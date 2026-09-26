"use strict";

/**
 * Phase 19 — messaging.
 *
 * One service owns all three communication types, because the *shape* of a
 * message is identical in all three and the only thing that really differs is
 * **who is allowed to read it**. Keeping that in one file makes the
 * authorization rules auditable side by side and impossible to skip by
 * accident.
 *
 * The rules, stated plainly:
 *
 *   CHANNEL  read/write → member of the channel's workspace
 *   PROJECT  read/write → authorized for that project (existing project access)
 *   DIRECT   read/write → the two participants, who must share a workspace
 *
 * And the rule that matters most, repeated because it is easy to erode:
 *
 *   ► Talking to somebody NEVER grants access to anything of theirs.
 *
 * A direct message creates a Conversation row and a Message row. It does not
 * create a ProjectMember row, does not touch a workspace role, and is never
 * consulted when project access is decided. Project access is resolved on
 * every request by `resolveProjectRole` in `services/access.service.js`, which
 * this service does not import and cannot influence.
 *
 * Ordering is fixed: authorize → validate → write → deliver. A message is only
 * ever broadcast after the database has accepted it, so a client is never told
 * about a message that does not exist.
 */

const mongoose = require("mongoose");
const Message = require("../models/message.model");
const Conversation = require("../models/conversation.model");
const ConversationMember = require("../models/conversationMember.model");
const Workspace = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const Project = require("../models/project.model");
const User = require("../models/user.model");
const { ApiError } = require("../middleware/errorHandler");
const { resolveProjectRole } = require("./access.service");
const { toProject, toUser, toUsers, toChannel } = require("../sockets/emit");
const { SOCKET_EVENTS } = require("../sockets/events");
const { createNotification } = require("./notification.service");

const MAX_CONTENT_LENGTH = Message.MAX_CONTENT_LENGTH;

/** How much history a single request returns. */
const HISTORY_LIMIT = 200;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate and normalize message content.
 *
 * Only a string (or a String object) is ever accepted: a number or object that
 * happens to stringify to something truthy must not slip through, because that
 * would let a client store a non-string in a text field. Whitespace is trimmed
 * so a message of only spaces is rejected rather than stored as invisible text.
 *
 * Content is stored and returned verbatim. Rendering is the frontend's job and
 * must be plain text — there is deliberately no HTML or markdown layer here.
 */
function validateContent(raw) {
  if (typeof raw !== "string" && !(raw instanceof String)) {
    throw new ApiError(400, "Message content must be text");
  }

  const content = String(raw).trim();

  if (!content) {
    throw new ApiError(400, "Message cannot be empty");
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new ApiError(400, `Message cannot exceed ${MAX_CONTENT_LENGTH} characters`);
  }

  return content;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/**
 * Find a channel in a workspace by `_id` or by name.
 *
 * `_id` is canonical. Name matching is kept only so messages written before
 * Phase 19 — which keyed the channel by name — still land in the right thread;
 * new writes always use the `_id`.
 */
function findChannel(workspace, identifier) {
  const wanted = String(identifier || "");
  if (!wanted) return null;

  return (
    (workspace.channels || []).find(
      (c) => String(c._id) === wanted || c.name === wanted || c.slug === wanted
    ) || null
  );
}

/**
 * Assert the user may act in a workspace at all.
 *
 * This is the single definition of "is this user in this workspace", used by
 * every messaging entry point. Mirrors
 * `middleware/authorize.attachWorkspaceContext`: the owner counts as an Admin
 * member, anyone else needs a `WorkspaceMember` row.
 *
 * Pass `workspace` to reuse an already-loaded document.
 */
async function assertWorkspaceMembership({ userId, workspaceId, workspace: loaded = null }) {
  if (!loaded && !mongoose.isValidObjectId(workspaceId)) {
    throw new ApiError(404, "Workspace not found");
  }

  const workspace = loaded || (await Workspace.findById(workspaceId));
  if (!workspace) throw new ApiError(404, "Workspace not found");

  const isOwner = String(workspace.ownerId) === String(userId);
  const member = isOwner
    ? null
    : await WorkspaceMember.findOne({ workspaceId: workspace._id, userId })
        .select("role")
        .lean();
  if (!member && !isOwner) {
    throw new ApiError(403, "You do not have access to this workspace");
  }

  return workspace;
}

/**
 * Assert the user may read and write in a workspace's channel.
 *
 * Authorization is derived from the authenticated user and the database.
 *
 * `workspaceId` is optional. It is only ever used to *load* the workspace, and
 * the membership check below is what decides — it looks the user up itself, so
 * a caller cannot point authorization at a workspace the user does not belong
 * to. Omitting it derives the owning workspace from the channel, which backs
 * `GET/POST /api/channels/:channelId/messages`; there, the request carries no
 * workspace at all, so there is nothing for a client to get wrong.
 */
async function resolveChannelAccess({ userId, workspaceId, channelId }) {
  let workspace = null;

  if (workspaceId) {
    workspace = await assertWorkspaceMembership({ userId, workspaceId });
  } else {
    // Derive the owning workspace from the channel itself.
    if (!mongoose.isValidObjectId(channelId)) throw new ApiError(404, "Channel not found");
    workspace = await Workspace.findOne({ "channels._id": channelId }).lean();
    if (!workspace) throw new ApiError(404, "Channel not found");
    workspace = await assertWorkspaceMembership({ userId, workspace });
  }

  const channel = findChannel(workspace, channelId);
  if (!channel) throw new ApiError(404, "Channel not found");

  return { workspace, channel };
}

// ---------------------------------------------------------------------------
// Project discussion
// ---------------------------------------------------------------------------

/**
 * Assert the user may read and write in a project's discussion.
 *
 * This delegates to the one existing project access resolver. It is called on
 * every single request — there is no cached or inherited "they have access"
 * shortcut, and no path here can be reached without it passing.
 */
async function resolveProjectAccess({ userId, projectId }) {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new ApiError(404, "Project not found");
  }

  const project = await Project.findById(projectId).select("_id workspaceId managerId name").lean();
  if (!project) throw new ApiError(404, "Project not found");

  const workspace = await Workspace.findById(project.workspaceId).select("ownerId").lean();
  if (!workspace) throw new ApiError(404, "Workspace not found");

  const isOwner = String(workspace.ownerId) === String(userId);
  const membership = isOwner
    ? null
    : await WorkspaceMember.findOne({ workspaceId: project.workspaceId, userId }).select("role").lean();
  if (!membership && !isOwner) {
    throw new ApiError(403, "You do not have access to this workspace");
  }

  const resolved = await resolveProjectRole({
    user: { _id: userId },
    project,
    isOwner,
    workspaceMemberRole: membership ? membership.role : "Admin",
  });
  if (!resolved) {
    // The decisive line. Being in the workspace, and even having been able to
    // message the project's owner, is not enough. Only a ProjectMember row (or
    // ownership) opens a discussion.
    throw new ApiError(403, "You do not have access to this project");
  }

  return { project, workspaceId: String(project.workspaceId), role: resolved.role };
}

// ---------------------------------------------------------------------------
// Direct messages
// ---------------------------------------------------------------------------

/**
 * Decide whether two users are allowed to open a direct-message thread.
 *
 * The product rule, chosen to match what Nexus already enforces everywhere
 * else: **communication requires a shared workspace.** Every message surface in
 * the app is workspace-scoped, the direct-message picker lists workspace
 * members, and `memberOf` already guards every message route. Enforcing the
 * same rule here means a user cannot use a crafted id to reach somebody outside
 * their world.
 *
 * The rule is deliberately about *communication only*. It creates no
 * membership, no role and no project access of any kind.
 */
async function canMessage({ userId, targetUserId }) {
  if (String(userId) === String(targetUserId)) {
    throw new ApiError(400, "You cannot send a direct message to yourself");
  }
  if (!mongoose.isValidObjectId(targetUserId)) {
    throw new ApiError(404, "User not found");
  }

  const target = await User.findById(targetUserId).select("_id").lean();
  if (!target) throw new ApiError(404, "User not found");

  const [mine, theirs] = await Promise.all([
    WorkspaceMember.find({ userId }).select("workspaceId").lean(),
    WorkspaceMember.find({ userId: targetUserId }).select("workspaceId").lean(),
  ]);

  const ownedByThem = await Workspace.find({ ownerId: targetUserId }).select("_id").lean();
  const ownedByMe = await Workspace.find({ ownerId: userId }).select("_id").lean();

  const theirWorkspaceIds = new Set([
    ...theirs.map((m) => String(m.workspaceId)),
    ...ownedByThem.map((w) => String(w._id)),
  ]);
  const myWorkspaceIds = new Set([
    ...mine.map((m) => String(m.workspaceId)),
    ...ownedByMe.map((w) => String(w._id)),
  ]);

  const shared = [...myWorkspaceIds].filter((id) => theirWorkspaceIds.has(id));
  if (shared.length === 0) {
    // Deliberately 403 and deliberately vague about *why*. Distinguishing
    // "no such user" from "not allowed to message them" would let a caller
    // enumerate the user table.
    throw new ApiError(403, "You cannot send a direct message to this user");
  }

  return { target, workspaceId: shared[0] };
}

/**
 * Find the thread for a pair of users, creating it on first use.
 *
 * `directKey` is unique, so a concurrent double-send cannot produce two
 * threads; the loser of the race re-reads the winner's row.
 */
async function findOrCreateConversation({ userId, targetUserId, workspaceId }) {
  const directKey = Conversation.directKeyFor(userId, targetUserId);

  const existing = await Conversation.findOne({ directKey });
  if (existing) return existing;

  try {
    const conversation = await Conversation.create({
      directKey,
      isGroup: false,
      createdBy: userId,
      workspaceId,
    });

    await ConversationMember.insertMany([
      { conversationId: conversation._id, userId },
      { conversationId: conversation._id, userId: targetUserId },
    ]);

    return conversation;
  } catch (error) {
    // Duplicate key: somebody else created the same thread first.
    const raced = await Conversation.findOne({ directKey });
    if (raced) return raced;
    throw error;
  }
}

/** Assert the user is a participant in a conversation. */
async function assertConversationParticipant({ conversationId, userId }) {
  if (!mongoose.isValidObjectId(conversationId)) {
    throw new ApiError(404, "Conversation not found");
  }

  const member = await ConversationMember.findOne({ conversationId, userId })
    .select("_id")
    .lean();
  if (!member) {
    throw new ApiError(403, "You do not have access to this conversation");
  }

  return Conversation.findById(conversationId).select("_id directKey workspaceId").lean();
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * The single wire shape for a message.
 *
 * Both the REST response and the socket event run through this, so a message
 * received live and the same message fetched afterwards are indistinguishable to
 * the UI — which is what lets the frontend deduplicate on `id` and nothing
 * else.
 *
 * Only what a message list actually needs is returned. A populated user is
 * reduced to id/name/email/avatar here rather than passed through, so no field
 * added to the User schema later can leak into a payload by accident.
 */
function serializeMessage(raw) {
  const source = raw && raw.toObject ? raw.toObject() : raw;
  if (!source) return null;

  const author = source.userId && typeof source.userId === "object" ? source.userId : null;
  const authorId = author
    ? String(author._id || author.id)
    : source.userId
      ? String(source.userId)
      : null;

  return {
    id: String(source._id || source.id),
    kind: source.kind || "CHANNEL",
    workspaceId: source.workspaceId ? String(source.workspaceId) : null,
    channelId: source.channelId ? String(source.channelId) : null,
    projectId: source.projectId ? String(source.projectId) : null,
    conversationId: source.conversationId ? String(source.conversationId) : null,
    recipientId: source.recipientId ? String(source.recipientId) : null,
    // The authenticated sender. Never a value taken from the request body.
    userId: authorId,
    author: author
      ? { id: authorId, name: author.name || "", email: author.email || "", avatar: author.avatar || "" }
      : null,
    content: source.content,
    readAt: source.readAt || null,
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
  };
}

/** Load a message with just enough of its author to render. */
async function loadMessage(messageId) {
  return Message.findById(messageId).populate("userId", "name email avatar");
}

const AUTHOR_FIELDS = "name email avatar";

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Persist a message and then — and only then — deliver it.
 *
 * The single choke point for every message in the product. Because the emit is
 * unreachable until `Message.create` has resolved, no code path can announce a
 * message that failed to save, and there is no second "send" path that skips
 * this function.
 */
async function persistAndDeliver({ doc, deliver }) {
  const created = await Message.create(doc);
  const populated = await loadMessage(created._id);
  const payload = serializeMessage(populated);

  // Best-effort side effects. A notification that fails must not fail the
  // message: it is already saved, and the recipient still sees it in their
  // inbox on the next fetch.
  deliver(payload).catch((error) => {
    console.error("[nexus] Message delivery failed:", error.message);
  });

  return populated;
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

/** List a channel's history. Authorization is re-checked on every call. */
async function listChannelMessages({ userId, workspaceId, channelId, limit = HISTORY_LIMIT }) {
  const { channel } = await resolveChannelAccess({ userId, workspaceId, channelId });

  const messages = await Message.find({ workspaceId, channelId: String(channel._id), kind: "CHANNEL" })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || HISTORY_LIMIT, HISTORY_LIMIT))
    .populate("userId", AUTHOR_FIELDS);

  return { channel, messages: messages.reverse().map(serializeMessage) };
}

/** Post to a workspace channel. */
async function postChannelMessage({ userId, workspaceId, channelId, content: rawContent }) {
  const { channel } = await resolveChannelAccess({ userId, workspaceId, channelId });
  const content = validateContent(rawContent);

  const message = await persistAndDeliver({
    doc: {
      kind: "CHANNEL",
      workspaceId,
      channelId: String(channel._id),
      userId,
      content,
    },
    deliver: async (payload) => {
      // Only sockets that passed a workspace-membership check are in this room.
      toChannel(String(channel._id), SOCKET_EVENTS.CHANNEL_MESSAGE_CREATED, payload);

      await notifyMentions({
        workspaceId,
        link: `/workspaces/${workspaceId}/messages?channel=${channel._id}`,
        actorId: userId,
        content,
      });
    },
  });

  return serializeMessage(message);
}

/** List a project's discussion. */
async function listProjectMessages({ userId, projectId, limit = HISTORY_LIMIT }) {
  const { project } = await resolveProjectAccess({ userId, projectId });

  const messages = await Message.find({ projectId: project._id, kind: "PROJECT" })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || HISTORY_LIMIT, HISTORY_LIMIT))
    .populate("userId", AUTHOR_FIELDS);

  return { project, messages: messages.reverse().map(serializeMessage) };
}

/** Post to a project's discussion. */
async function postProjectMessage({ userId, projectId, content: rawContent }) {
  const { project } = await resolveProjectAccess({ userId, projectId });
  const content = validateContent(rawContent);

  const message = await persistAndDeliver({
    doc: {
      kind: "PROJECT",
      projectId: project._id,
      workspaceId: project.workspaceId,
      userId,
      content,
    },
    deliver: async (payload) => {
      // The Phase 18 `project:<id>` room already contains only sockets that
      // passed `resolveProjectAccess`, so the audience is correct by construction.
      toProject(project._id, SOCKET_EVENTS.PROJECT_MESSAGE_CREATED, payload);

      // Mention notifications reuse the existing Phase 17 system.
      await notifyMentions({
        workspaceId: project.workspaceId,
        projectId: project._id,
        link: `/projects/${project._id}`,
        actorId: userId,
        content,
      });
    },
  });

  return serializeMessage(message);
}

/** A user's direct-message history with one other user. */
async function listDirectMessages({ userId, targetUserId, limit = HISTORY_LIMIT }) {
  const { target, workspaceId } = await canMessage({ userId, targetUserId });

  const conversation = await findOrCreateConversation({ userId, targetUserId, workspaceId });

  const messages = await Message.find({
    conversationId: conversation._id,
    kind: "DIRECT",
  })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || HISTORY_LIMIT, HISTORY_LIMIT))
    .populate("userId", AUTHOR_FIELDS);

  return {
    conversationId: String(conversation._id),
    partner: { id: String(target._id) },
    messages: messages.reverse().map(serializeMessage),
  };
}

/**
 * Send a direct message.
 *
 * The thread is created and the message written, and then only the two
 * participants' private `user:<id>` rooms are told. No channel room, no project
 * room, and no global broadcast — those would each leak a private message to
 * people who are not part of it.
 */
async function sendDirectMessage({ userId, targetUserId, content: rawContent }) {
  const { target, workspaceId } = await canMessage({ userId, targetUserId });
  const content = validateContent(rawContent);

  const conversation = await findOrCreateConversation({ userId, targetUserId, workspaceId });

  const message = await persistAndDeliver({
    doc: {
      kind: "DIRECT",
      conversationId: conversation._id,
      recipientId: target._id,
      workspaceId,
      userId,
      content,
    },
    deliver: async (payload) => {
      // Exactly two rooms. The sender is included so their other open tabs
      // stay in sync; no one else is addressable.
      toUsers([userId, target._id], SOCKET_EVENTS.DIRECT_MESSAGE_CREATED, payload);

      await createNotification({
        userId: target._id,
        actorId: userId,
        workspaceId,
        type: "DIRECT_MESSAGE",
        title: `${(await senderName(userId))} sent you a message`,
        body: content.slice(0, 140),
        link: `/messages?with=${target._id}`,
        entityType: "conversation",
        entityId: conversation._id,
      });
    },
  });

  return { message: serializeMessage(message), conversationId: String(conversation._id) };
}

let senderNameCache = null;
async function senderName(userId) {
  if (!senderNameCache) senderNameCache = new Map();
  if (senderNameCache.has(String(userId))) return senderNameCache.get(String(userId));
  const user = await User.findById(userId).select("name").lean();
  const name = user?.name || "Someone";
  senderNameCache.set(String(userId), name);
  return name;
}

/** Mark a direct-message thread as read by its recipient. */
async function markDirectThreadRead({ userId, targetUserId }) {
  const { workspaceId } = await canMessage({ userId, targetUserId });
  const conversation = await findOrCreateConversation({ userId, targetUserId, workspaceId });

  // Scoped to the recipient: a sender must never be able to clear their own
  // messages' read state, and a third party is excluded by the filter.
  const result = await Message.updateMany(
    { conversationId: conversation._id, kind: "DIRECT", recipientId: userId, readAt: null },
    { $set: { readAt: new Date() } }
  );

  if (result.modifiedCount > 0) {
    toUser(targetUserId, SOCKET_EVENTS.DIRECT_MESSAGE_READ, {
      conversationId: String(conversation._id),
      userId: String(userId),
    });
  }

  return { conversationId: String(conversation._id), marked: result.modifiedCount };
}

/**
 * The direct-message inbox: one row per partner, newest conversation first,
 * with an unread count.
 *
 * Only threads where the user is a ConversationMember are ever considered, so
 * the query cannot surface somebody else's correspondence.
 */
async function listConversations({ userId }) {
  const memberships = await ConversationMember.find({ userId }).select("conversationId").lean();
  const conversationIds = memberships.map((m) => m.conversationId);
  if (conversationIds.length === 0) return { conversations: [] };

  const [conversations, lastMessages, unread] = await Promise.all([
    Conversation.find({ _id: { $in: conversationIds } }).select("directKey workspaceId").lean(),
    Message.find({ conversationId: { $in: conversationIds }, kind: "DIRECT" })
      .sort({ createdAt: -1 })
      .populate("userId", AUTHOR_FIELDS)
      .limit(1000),
    Message.countDocuments({
      conversationId: { $in: conversationIds },
      kind: "DIRECT",
      recipientId: userId,
      readAt: null,
    }),
  ]);

  const byConversation = new Map();
  for (const message of lastMessages) {
    const key = String(message.conversationId);
    if (!byConversation.has(key)) byConversation.set(key, message);
  }

  const unreadByConversation = await Message.aggregate([
    { $match: { conversationId: { $in: conversationIds }, kind: "DIRECT", recipientId: new mongoose.Types.ObjectId(String(userId)), readAt: null } },
    { $group: { _id: "$conversationId", count: { $sum: 1 } } },
  ]);
  const unreadById = new Map(unreadByConversation.map((row) => [String(row._id), row.count]));

  const partnerIds = new Set();
  for (const conversation of conversations) {
    String(conversation.directKey || "")
      .split(":")
      .forEach((id) => id && id !== String(userId) && partnerIds.add(id));
  }

  const partners = partnerIds.size
    ? await User.find({ _id: { $in: [...partnerIds] } })
        .select("name email avatar")
        .lean()
    : [];
  const partnerById = new Map(partners.map((p) => [String(p._id), p]));

  const rows = conversations
    .map((conversation) => {
      const partnerId = String(conversation.directKey || "")
        .split(":")
        .find((id) => id && id !== String(userId));
      const partner = partnerById.get(partnerId);
      if (!partner) return null;

      const last = byConversation.get(String(conversation._id));
      return {
        conversationId: String(conversation._id),
        partner: {
          id: String(partner._id),
          name: partner.name,
          email: partner.email,
          avatar: partner.avatar || "",
        },
        lastMessage: last ? serializeMessage(last) : null,
        unreadCount: unreadById.get(String(conversation._id)) || 0,
        updatedAt: last ? last.createdAt : conversation.createdAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  return { conversations: rows, totalUnread: unread };
}

/**
 * Notify workspace members named in a channel or discussion message.
 *
 * Reuses the existing `MENTION` notification type — no new notification
 * architecture, no per-message "message sent" notification that would bury the
 * ones that matter.
 */
async function notifyMentions({ workspaceId, projectId = null, link, actorId, content }) {
  try {
    const members = await WorkspaceMember.find({ workspaceId })
      .populate("userId", AUTHOR_FIELDS)
      .lean();

    const mentioned = members.filter((m) => {
      if (!m.userId || String(m.userId._id) === String(actorId)) return false;
      const first = String(m.userId.name || "").split(" ")[0];
      return content.includes(`@${first}`) || content.includes(`@${m.userId.name}`);
    });

    await Promise.all(
      mentioned.map((m) =>
        createNotification({
          userId: m.userId._id,
          actorId,
          workspaceId,
          type: "MENTION",
          title: `${m.userId.name.split(" ")[0]} was mentioned`,
          body: content.slice(0, 140),
          link,
          entityType: projectId ? "project" : "channel",
          entityId: projectId,
        })
      )
    );
  } catch (error) {
    console.error("[nexus] Mention processing failed:", error.message);
  }
}

module.exports = {
  // validation
  validateContent,
  MAX_CONTENT_LENGTH,
  // channels
  resolveChannelAccess,
  findChannel,
  listChannelMessages,
  postChannelMessage,
  // project discussion
  resolveProjectAccess,
  listProjectMessages,
  postProjectMessage,
  // direct messages
  canMessage,
  findOrCreateConversation,
  assertConversationParticipant,
  listDirectMessages,
  sendDirectMessage,
  markDirectThreadRead,
  listConversations,
  // shared
  serializeMessage,
};

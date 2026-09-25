"use strict";

/**
 * Workspace channel messages.
 *
 * Deliberately thin: every rule that matters — who may read, what counts as
 * valid content, who the message is delivered to, and the order in which
 * those things happen — lives in `services/messaging.service.js`. A controller
 * that decides any of that for itself is how two endpoints end up with two
 * different answers to "who can see this?".
 *
 * The route already guarantees `authenticate` + `memberOf` +
 * `requirePermission("view_channels"|"send_message")`; the service re-derives
 * access from the database anyway, because middleware coverage is a property of
 * the route, and this endpoint must be safe regardless of what is mounted
 * above it.
 */

const { ApiError } = require("../middleware/errorHandler");
const messaging = require("../services/messaging.service");

/**
 * Shared implementation for the two channel message routes.
 *
 * The channel-scoped route (`/api/channels/:channelId/messages`) has no
 * `workspaceId` in the path, so the service derives the owning workspace from
 * the channel. Both routes therefore reach the same service call and the same
 * authorization — the only difference is which of the two shapes the frontend
 * used to reach it.
 */
async function respondList(req, res, next, { workspaceScoped }) {
  try {
    const channelId = workspaceScoped ? req.query.channelId : req.params.channelId;
    if (!channelId) throw new ApiError(400, "Channel is required");

    const { messages } = await messaging.listChannelMessages({
      userId: req.user._id,
      // The workspace-scoped route supplies its own; the channel-scoped route
      // leaves it undefined so the service resolves it from the channel.
      workspaceId: workspaceScoped ? req.workspace._id : undefined,
      channelId,
      limit: req.query.limit,
    });

    res.json({ success: true, messages });
  } catch (error) {
    next(error);
  }
}

async function respondSend(req, res, next, { workspaceScoped }) {
  try {
    const channelId = workspaceScoped ? req.body.channelId : req.params.channelId;
    if (!channelId) throw new ApiError(400, "Channel is required");

    const message = await messaging.postChannelMessage({
      userId: req.user._id,
      workspaceId: workspaceScoped ? req.workspace._id : undefined,
      channelId,
      content: req.body.content,
    });

    res.status(201).json({ success: true, message });
  } catch (error) {
    next(error);
  }
}

/** GET /api/workspaces/:workspaceId/messages?channelId=... */
function listMessages(req, res, next) {
  return respondList(req, res, next, { workspaceScoped: true });
}

/** POST /api/workspaces/:workspaceId/messages */
function sendMessage(req, res, next) {
  return respondSend(req, res, next, { workspaceScoped: true });
}

/** GET /api/channels/:channelId/messages */
function listChannelMessagesById(req, res, next) {
  return respondList(req, res, next, { workspaceScoped: false });
}

/** POST /api/channels/:channelId/messages */
function sendChannelMessageById(req, res, next) {
  return respondSend(req, res, next, { workspaceScoped: false });
}

module.exports = {
  listMessages,
  sendMessage,
  listChannelMessagesById,
  sendChannelMessageById,
};

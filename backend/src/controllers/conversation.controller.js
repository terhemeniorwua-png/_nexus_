"use strict";

/**
 * Direct messages and the conversation list.
 *
 * Mounted at `/api/messages`, not under a workspace. That is deliberate: a
 * direct message is a private thread between two people, and tying the route
 * to a workspace would invite the reading that workspace membership is what
 * makes it readable. It isn't. The two participants are decided by
 * `canMessage` in the messaging service, and the recipient is decided by the
 * `recipientId` on the row — never by a list of ids supplied by the caller.
 *
 * A DM sends no notification to anyone but its recipient, and is emitted only
 * to the two `user:<id>` rooms. It creates no membership and no project access.
 */

const { ApiError } = require("../middleware/errorHandler");
const messaging = require("../services/messaging.service");

/** GET /api/messages/conversations */
async function listConversations(req, res, next) {
  try {
    const { conversations, totalUnread } = await messaging.listConversations({
      userId: req.user._id,
    });

    res.json({ success: true, conversations, totalUnread });
  } catch (error) {
    next(error);
  }
}

/** GET /api/messages/direct/:userId */
async function listDirectMessages(req, res, next) {
  try {
    const result = await messaging.listDirectMessages({
      userId: req.user._id,
      targetUserId: req.params.userId,
      limit: req.query.limit,
    });

    res.json({
      success: true,
      conversationId: result.conversationId,
      partner: result.partner,
      messages: result.messages,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/messages/direct/:userId */
async function sendDirectMessage(req, res, next) {
  try {
    const { message, conversationId } = await messaging.sendDirectMessage({
      userId: req.user._id,
      targetUserId: req.params.userId,
      content: req.body.content,
    });

    res.status(201).json({ success: true, message, conversationId });
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/messages/direct/:userId/read */
async function markDirectThreadRead(req, res, next) {
  try {
    const result = await messaging.markDirectThreadRead({
      userId: req.user._id,
      targetUserId: req.params.userId,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listConversations,
  listDirectMessages,
  sendDirectMessage,
  markDirectThreadRead,
};

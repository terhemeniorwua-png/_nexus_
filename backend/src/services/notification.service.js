"use strict";

/**
 * Phase 18 — notification creation with real-time delivery.
 *
 * The Phase 17 flow is unchanged: write the notification first, then tell the
 * recipient's sockets. The socket is pure delivery — the bell, the unread
 * count and the notification page all still read from the database, and a
 * client that was offline simply picks the notification up on its next fetch.
 *
 * The broadcast targets only `user:<recipientId>`, so nobody else on the
 * project or in the workspace ever sees it.
 */

const Notification = require("../models/notification.model");
const { getIO } = require("../sockets/store");
const { toUser } = require("../sockets/emit");
const { SOCKET_EVENTS } = require("../sockets/events");

/**
 * Load a stored notification back through the exact same `populate` the
 * `GET /api/notifications` controller uses.
 *
 * Doing it this way — rather than hand-rolling a field list — guarantees the
 * socket frame and the REST response carry identical shapes. A notification
 * that arrived over the wire and the same notification fetched on the next page
 * load are then indistinguishable to the UI, and a newly added field cannot
 * drift out of sync between the two paths.
 *
 * Only the recipient's own notification is ever passed through here, and only
 * the public name/avatar of the actor plus the workspace name are attached.
 */
async function serializeNotification(notification) {
  const id = notification._id || notification.id;
  if (!id) return null;

  // Deliberately not `.lean()`: the REST controller returns hydrated documents,
  // which carry the `id` virtual alongside `_id`. A lean result would drop it
  // and the two paths would disagree on how a notification is identified.
  const populated = await Notification.findById(id)
    .populate("actorId", "name email avatar")
    .populate("workspaceId", "name");

  return populated || null;
}

async function createNotification({
  userId,
  actorId = null,
  workspaceId = null,
  type = "TASK_ASSIGNED",
  title,
  body = "",
  link = "",
  entityType = null,
  entityId = null,
}) {
  if (!userId) return null;

  try {
    const notification = await Notification.create({
      userId,
      actorId: actorId || undefined,
      workspaceId: workspaceId || undefined,
      type,
      title,
      body,
      link,
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      read: false,
    });

    // Stored first, delivered second. A client with no socket simply sees the
    // notification on its next fetch.
    if (getIO()) {
      const payload = await serializeNotification(notification);
      toUser(userId, SOCKET_EVENTS.NOTIFICATION_NEW, { notification: payload });
    }

    return notification;
  } catch (error) {
    console.error("[nexus] Failed to create notification:", error.message);
    return null;
  }
}

module.exports = { createNotification, serializeNotification };

"use strict";

/**
 * Phase 18 — the single source of truth for Socket.IO event names.
 *
 * Raw event strings are never written inline anywhere else in the backend. Both
 * the emitters (controllers/services) and the handlers in this folder import
 * from here, so a rename cannot leave one side listening on a dead name.
 *
 * Naming follows the existing Nexus terminology — the same vocabulary the REST
 * layer and the notification types already use (task, comment, deliverable,
 * notification, message, user).
 */

/** Server → client. */
const SOCKET_EVENTS = Object.freeze({
  // Projects / board
  PROJECT_JOINED: "project:joined",
  PROJECT_DENIED: "project:denied",
  PROJECT_UPDATED: "project:updated",
  COLUMN_CREATED: "column:created",
  COLUMN_UPDATED: "column:updated",
  COLUMN_DELETED: "column:deleted",

  // Tasks
  TASK_CREATED: "task:created",
  TASK_UPDATED: "task:updated",
  TASK_MOVED: "task:moved",
  TASK_DELETED: "task:deleted",

  // Comments
  COMMENT_CREATED: "comment:created",
  COMMENT_DELETED: "comment:deleted",

  // Deliverables
  DELIVERABLE_UPDATED: "deliverable:updated",

  // Notifications (private, delivered to user:<id> only)
  NOTIFICATION_NEW: "notification:new",

  // Messages
  //
  // Three events rather than one `message:created`, because the three kinds
  // have different audiences and different rooms. A component subscribes to
  // exactly the one it renders, so an open project discussion cannot cause a
  // re-render of the channel list (and vice versa).
  CHANNEL_MESSAGE_CREATED: "message:channel",
  PROJECT_MESSAGE_CREATED: "message:project",
  DIRECT_MESSAGE_CREATED: "message:direct",
  DIRECT_MESSAGE_READ: "message:direct:read",
  CHANNEL_JOINED: "channel:joined",
  CHANNEL_DENIED: "channel:denied",

  // Presence
  USER_ONLINE: "user:online",
  USER_OFFLINE: "user:offline",
  PRESENCE_SNAPSHOT: "presence:snapshot",
});

/**
 * Client → server. These carry no business logic: they only ask to join or
 * leave a room. Every mutation still goes through the REST API, so the database
 * remains the source of truth and no socket handler duplicates an endpoint.
 */
const CLIENT_EVENTS = Object.freeze({
  PROJECT_JOIN: "project:join",
  PROJECT_LEAVE: "project:leave",
  CHANNEL_JOIN: "channel:join",
  CHANNEL_LEAVE: "channel:leave",
  PRESENCE_SUBSCRIBE: "presence:subscribe",
  PRESENCE_UNSUBSCRIBE: "presence:unsubscribe",
});

/**
 * Events that make a connected project view stale. The board and the
 * deliverable panel refetch from the REST API when one of these arrives —
 * the socket only signals that something moved, the database supplies truth.
 */
const PROJECT_REFRESH_EVENTS = Object.freeze([
  SOCKET_EVENTS.TASK_CREATED,
  SOCKET_EVENTS.TASK_UPDATED,
  SOCKET_EVENTS.TASK_MOVED,
  SOCKET_EVENTS.TASK_DELETED,
  SOCKET_EVENTS.COLUMN_CREATED,
  SOCKET_EVENTS.COLUMN_UPDATED,
  SOCKET_EVENTS.COLUMN_DELETED,
  SOCKET_EVENTS.DELIVERABLE_UPDATED,
  SOCKET_EVENTS.PROJECT_UPDATED,
]);

module.exports = {
  SOCKET_EVENTS,
  CLIENT_EVENTS,
  PROJECT_REFRESH_EVENTS,
};

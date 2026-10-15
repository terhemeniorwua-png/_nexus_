/**
 * Phase 18 — the client half of the Socket.IO contract.
 *
 * These names mirror `backend/src/sockets/events.js` exactly. Nothing in the
 * UI writes a raw event string: a component imports the name from here, so a
 * rename on the server is a compile-time concern rather than a listener that
 * silently stops firing.
 */

export const SOCKET_EVENTS = Object.freeze({
  PROJECT_JOINED: "project:joined",
  PROJECT_DENIED: "project:denied",
  PROJECT_UPDATED: "project:updated",
  COLUMN_CREATED: "column:created",
  COLUMN_UPDATED: "column:updated",
  COLUMN_DELETED: "column:deleted",

  TASK_CREATED: "task:created",
  TASK_UPDATED: "task:updated",
  TASK_MOVED: "task:moved",
  TASK_DELETED: "task:deleted",

  COMMENT_CREATED: "comment:created",
  COMMENT_DELETED: "comment:deleted",

  DELIVERABLE_UPDATED: "deliverable:updated",

  NOTIFICATION_NEW: "notification:new",

  // Messages
  //
  // One event per kind rather than a single `message:created`, because the three
  // have different audiences and different rooms. A component subscribes to the
  // one it renders, so an open project discussion does not cause a re-render of
  // the channel list.
  CHANNEL_MESSAGE_CREATED: "message:channel",
  PROJECT_MESSAGE_CREATED: "message:project",
  DIRECT_MESSAGE_CREATED: "message:direct",
  DIRECT_MESSAGE_READ: "message:direct:read",
  CHANNEL_JOINED: "channel:joined",
  CHANNEL_DENIED: "channel:denied",

  USER_ONLINE: "user:online",
  USER_OFFLINE: "user:offline",
  PRESENCE_SNAPSHOT: "presence:snapshot",
});

export const CLIENT_EVENTS = Object.freeze({
  PROJECT_JOIN: "project:join",
  PROJECT_LEAVE: "project:leave",
  CHANNEL_JOIN: "channel:join",
  CHANNEL_LEAVE: "channel:leave",
  PRESENCE_SUBSCRIBE: "presence:subscribe",
  PRESENCE_UNSUBSCRIBE: "presence:unsubscribe",
});

/**
 * Events that mean "a project view you are looking at is stale". A component
 * listening to these refetches from the REST API; the event itself is only a
 * nudge, never the source of truth.
 */
export const PROJECT_REFRESH_EVENTS = Object.freeze([
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

export default SOCKET_EVENTS;

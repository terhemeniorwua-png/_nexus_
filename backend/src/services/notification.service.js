const Notification = require("../models/notification.model");
const { getIO } = require("../sockets/store");

function userRoom(userId) {
  return `user:${String(userId)}`;
}

async function createNotification({
  userId,
  actorId = null,
  workspaceId = null,
  type = "TASK_ASSIGNED",
  title,
  body = "",
  link = "",
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
      read: false,
    });

    const io = getIO();
    if (io) {
      io.to(userRoom(userId)).emit("notification:new", { notification });
    }

    return notification;
  } catch (error) {
    console.error("[nexus] Failed to create notification:", error.message);
    return null;
  }
}

module.exports = { createNotification, userRoom };
const Message = require("../models/message.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const { ApiError } = require("../middleware/errorHandler");
const { createNotification } = require("../services/notification.service");
const { getIO } = require("../sockets/store");

function channelRoom(workspaceId, channelId) {
  return `workspace:${String(workspaceId)}:channel:${String(channelId)}`;
}

function isDm(channelId) {
  return typeof channelId === "string" && channelId.startsWith("dm:");
}

function dmPartners(channelId) {
  return String(channelId).replace(/^dm:/, "").split("_");
}

async function assertChannelAccess(req, channelId) {
  if (isDm(channelId)) {
    const partners = dmPartners(channelId);
    if (!partners.includes(String(req.user._id))) {
      throw new ApiError(403, "You do not have access to this conversation");
    }
    return;
  }

  const workspace = await require("../models/workspace.model").findById(req.workspace._id);
  const known = (workspace.channels || []).some((c) => String(c._id) === String(channelId) || c.name === channelId);
  if (!known) {
    throw new ApiError(404, "Channel not found");
  }
}

async function listMessages(req, res, next) {
  try {
    const { channelId } = req.query;
    if (!channelId) return next(new ApiError(400, "Channel is required"));

    await assertChannelAccess(req, channelId);

    const messages = await Message.find({ workspaceId: req.workspace._id, channelId })
      .sort({ createdAt: -1 })
      .limit(120)
      .populate("userId", "name email");

    res.json({ success: true, messages: messages.reverse() });
  } catch (error) {
    next(error);
  }
}

async function sendMessage(req, res, next) {
  try {
    const { channelId, content } = req.body;

    if (!channelId) return next(new ApiError(400, "Channel is required"));
    if (!content || !String(content).trim()) return next(new ApiError(400, "Message content is required"));

    await assertChannelAccess(req, channelId);

    const message = await Message.create({
      workspaceId: req.workspace._id,
      channelId,
      userId: req.user._id,
      content: String(content).trim(),
    });

    const populated = await Message.findById(message._id).populate("userId", "name email");
    const io = getIO();

    io?.to(channelRoom(req.workspace._id, channelId)).emit("message:sent", { message: populated });

    if (isDm(channelId)) {
      const partners = dmPartners(channelId);
      partners.forEach((partnerId) => {
        if (String(partnerId) !== String(req.user._id)) {
          io?.to(`user:${partnerId}`).emit("dm:sent", { message: populated });
        }
      });
    }

    await handleMentions(req, populated);

    res.status(201).json({ success: true, message: populated });
  } catch (error) {
    next(error);
  }
}

async function handleMentions(req, message) {
  try {
    const members = await WorkspaceMember.find({ workspaceId: req.workspace._id }).populate(
      "userId",
      "name email"
    );

    const text = String(message.content);
    const mentioned = members.filter((m) => {
      if (!m.userId || !m.userId.name) return false;
      if (String(m.userId._id) === String(req.user._id)) return false;
      const firstName = m.userId.name.split(" ")[0];
      const scanner = `@${firstName}`;
      return text.includes(scanner) || text.includes(`@${m.userId.name}`);
    });

    await Promise.all(
      mentioned.map((m) =>
        createNotification({
          userId: m.userId._id,
          actorId: req.user._id,
          workspaceId: req.workspace._id,
          type: "MENTION",
          title: `${req.user.name} mentioned you`,
          body: text.slice(0, 140),
          link: `/workspaces/${req.workspace._id}/messages`,
        })
      )
    );
  } catch (error) {
    console.error("[nexus] Mention processing failed:", error.message);
  }
}

module.exports = { listMessages, sendMessage, channelRoom, isDm, dmPartners };
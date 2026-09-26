const Notification = require("../models/notification.model");
const { ApiError } = require("../middleware/errorHandler");

async function listNotifications(req, res, next) {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .populate("actorId", "name email avatar")
      .populate("workspaceId", "name")
      .sort({ createdAt: -1 })
      .limit(100);

    const unreadCount = await Notification.countDocuments({ userId: req.user._id, read: false });

    res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    next(error);
  }
}

async function markRead(req, res, next) {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
    if (!notification) return next(new ApiError(404, "Notification not found"));

    notification.read = true;
    await notification.save();

    res.json({ success: true, notification: notification.toJSON() });
  } catch (error) {
    next(error);
  }
}

async function markAllRead(req, res, next) {
  try {
    await Notification.updateMany(
      { userId: req.user._id, read: false },
      { $set: { read: true } }
    );

    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    next(error);
  }
}

module.exports = { listNotifications, markRead, markAllRead };
const Activity = require("../models/activity.model");

async function recordActivity({
  workspaceId,
  userId,
  action,
  targetType = "task",
  targetId = null,
  metadata = {},
}) {
  try {
    const entry = await Activity.create({
      workspaceId,
      userId,
      action,
      targetType,
      targetId: targetId || undefined,
      metadata,
    });
    return entry;
  } catch (error) {
    console.error("[nexus] Failed to record activity:", error.message);
    return null;
  }
}

async function latestActivity(workspaceId, limit = 25) {
  return Activity.find({ workspaceId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("userId", "name email avatar");
}

module.exports = { recordActivity, latestActivity };
const Activity = require("../models/activity.model");

async function recordActivity({
  workspaceId,
  projectId = null,
  userId,
  action,
  targetType = "task",
  targetId = null,
  metadata = {},
}) {
  try {
    const entry = await Activity.create({
      workspaceId,
      projectId: projectId || undefined,
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

async function latestActivity(workspaceId, limit = 25, options = {}) {
  const { projectIds } = options;
  const query = { workspaceId };

  if (projectIds && projectIds.length > 0) {
    query.$or = [{ projectId: null }, { projectId: { $in: projectIds } }];
  }

  return Activity.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("userId", "name email avatar");
}

async function latestActivityAcross(workspaceIds, projectIds, limit = 25) {
  const query = { workspaceId: { $in: workspaceIds } };

  if (projectIds && projectIds.length > 0) {
    query.$or = [{ projectId: null }, { projectId: { $in: projectIds } }];
  }

  return Activity.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("userId", "name email avatar");
}

module.exports = { recordActivity, latestActivity, latestActivityAcross };
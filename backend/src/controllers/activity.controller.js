const { latestActivity } = require("../services/activity.service");
const { getAccessibleProjectIds } = require("../services/access.service");

async function listActivity(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

    const accessibleIds = await getAccessibleProjectIds({
      userId: req.user._id,
      workspaceId: req.workspace._id,
      isOwner: Boolean(req.isOwner),
      workspaceMemberRole: req.memberRole,
    });

    const activities = await latestActivity(
      req.workspace._id,
      limit,
      { projectIds: accessibleIds }
    );

    res.json({
      success: true,
      activities: activities.map((entry) => entry.toJSON()),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listActivity };
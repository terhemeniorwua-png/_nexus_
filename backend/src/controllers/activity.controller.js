const { latestActivity } = require("../services/activity.service");

async function listActivity(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const activities = await latestActivity(req.workspace._id, limit);

    res.json({
      success: true,
      activities: activities.map((entry) => entry.toJSON()),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listActivity };
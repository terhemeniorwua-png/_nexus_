const Workspace = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const { ApiError } = require("./errorHandler");

async function memberOf(req, _res, next) {
  try {
    const workspaceId = req.params.workspaceId || req.params.w;

    if (!workspaceId) {
      return next(new ApiError(400, "Workspace identifier is required"));
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return next(new ApiError(404, "Workspace not found"));
    }

    const isOwner = String(workspace.ownerId) === String(req.user._id);

    const member = await WorkspaceMember.findOne({
      workspaceId: workspace._id,
      userId: req.user._id,
    });

    if (!member && !isOwner) {
      return next(new ApiError(403, "You do not have access to this workspace"));
    }

    req.workspace = workspace;
    req.memberRole = member ? member.role : "Admin";
    req.isOwner = isOwner;
    next();
  } catch (error) {
    next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.memberRole || !roles.includes(req.memberRole)) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have permission to perform this action" });
    }
    next();
  };
}

module.exports = { memberOf, requireRole };
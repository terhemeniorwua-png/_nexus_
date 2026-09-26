const Workspace = require("../models/workspace.model");
const { slugifyChannelName } = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const Project = require("../models/project.model");
const Task = require("../models/task.model");
const { ApiError } = require("../middleware/errorHandler");
const { recordActivity } = require("../services/activity.service");
const { createNotification } = require("../services/notification.service");

// Phase 23 — `isOwner` is here so the members table can leave the owner's role
// and remove controls out. The API refuses both anyway ("Workspace owners must
// remain admins" / "You cannot remove the workspace owner"), and a control that
// can only ever fail is worse than no control.
function normalizeMember(member, user, ownerId) {
  // These queries populate `userId`, so it arrives as a User document here and
  // as a raw ObjectId on the paths that do not. Comparing the document itself
  // would stringify the whole user and never match.
  const memberUserId = member.userId?._id || member.userId;

  return {
    id: member.id,
    role: member.role,
    joinedAt: member.createdAt,
    isOwner: ownerId ? String(memberUserId) === String(ownerId) : false,
    user: user
      ? { id: user.id, name: user.name, email: user.email, avatar: user.avatar || "" }
      : { id: String(memberUserId) },
  };
}

async function listWorkspaces(req, res, next) {
  try {
    const memberships = await WorkspaceMember.find({ userId: req.user._id });

    const workspaceIds = memberships.map((m) => m.workspaceId);
    const owned = await Workspace.find({ ownerId: req.user._id }).select("_id");

    const ids = [...new Set([...workspaceIds.map(String), ...owned.map((w) => String(w._id))])];

    const workspaces = await Workspace.find({ _id: { $in: ids } }).sort({ updatedAt: -1 });

    const roleByWorkspace = {};
    memberships.forEach((m) => {
      roleByWorkspace[String(m.workspaceId)] = m.role;
    });
    owned.forEach((w) => {
      roleByWorkspace[String(w._id)] = "Admin";
    });

    const data = await Promise.all(
      workspaces.map(async (workspace) => {
        const [memberCount, projectCount, taskCount] = await Promise.all([
          WorkspaceMember.countDocuments({ workspaceId: workspace._id }),
          Project.countDocuments({ workspaceId: workspace._id }),
          Task.countDocuments({ projectId: { $in: await Project.find({ workspaceId: workspace._id }).distinct("_id") } }),
        ]);

        return {
          ...workspace.toJSON(),
          role: roleByWorkspace[String(workspace._id)] || "Member",
          stats: { memberCount, projectCount, taskCount },
        };
      })
    );

    res.json({ success: true, workspaces: data });
  } catch (error) {
    next(error);
  }
}

async function createWorkspace(req, res, next) {
  try {
    const { name, description } = req.body;

    if (!name || !String(name).trim()) {
      return next(new ApiError(400, "Workspace name is required"));
    }

    const workspace = await Workspace.create({
      name: String(name).trim(),
      description: String(description || "").trim(),
      ownerId: req.user._id,
    });

    await WorkspaceMember.create({
      workspaceId: workspace._id,
      userId: req.user._id,
      role: "Admin",
    });

    res.status(201).json({
      success: true,
      workspace: workspace.toJSON(),
      role: "Admin",
      members: [
        normalizeMember(
          { id: req.user._id, role: "Admin", createdAt: new Date(), userId: req.user._id },
          req.user,
          req.workspace?.ownerId
        ),
      ],
    });
  } catch (error) {
    next(error);
  }
}

async function getWorkspace(req, res, next) {
  try {
    const [members, projectCount, memberCount] = await Promise.all([
      WorkspaceMember.find({ workspaceId: req.workspace._id })
        .populate("userId", "name email avatar")
        .sort({ createdAt: 1 }),
      Project.countDocuments({ workspaceId: req.workspace._id }),
      WorkspaceMember.countDocuments({ workspaceId: req.workspace._id }),
    ]);

    const isOwner = String(req.workspace.ownerId) === String(req.user._id);
    const memberRows = members.map((m) => normalizeMember(m, m.userId, req.workspace.ownerId));
    if (isOwner && !memberRows.some((r) => String(r.user.id) === String(req.user._id))) {
      memberRows.unshift(
      normalizeMember(
        { id: req.user._id, role: "Admin", createdAt: new Date(), userId: req.user._id },
        req.user,
        req.workspace.ownerId
      )
    );
    }

    res.json({
      success: true,
      workspace: req.workspace.toJSON(),
      role: req.memberRole,
      isOwner,
      stats: { memberCount, projectCount },
      members: memberRows,
    });
  } catch (error) {
    next(error);
  }
}

async function updateWorkspace(req, res, next) {
  try {
    const { name, description } = req.body;

    if (name !== undefined && !String(name).trim()) {
      return next(new ApiError(400, "Workspace name cannot be empty"));
    }

    if (name !== undefined) req.workspace.name = String(name).trim();
    if (description !== undefined) req.workspace.description = String(description).trim();

    await req.workspace.save();

    res.json({ success: true, workspace: req.workspace.toJSON() });
  } catch (error) {
    next(error);
  }
}

async function deleteWorkspace(req, res, next) {
  try {
    await Workspace.deleteOne({ _id: req.workspace._id });
    await WorkspaceMember.deleteMany({ workspaceId: req.workspace._id });

    const projectIds = await Project.find({ workspaceId: req.workspace._id }).distinct("_id");
    await Project.deleteMany({ workspaceId: req.workspace._id });
    await Task.deleteMany({ projectId: { $in: projectIds } });

    res.json({ success: true, message: "Workspace deleted" });
  } catch (error) {
    next(error);
  }
}

async function listMembers(req, res, next) {
  try {
    const members = await WorkspaceMember.find({ workspaceId: req.workspace._id })
      .populate("userId", "name email avatar")
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      members: members.map((m) => normalizeMember(m, m.userId, req.workspace.ownerId)),
    });
  } catch (error) {
    next(error);
  }
}

async function addMember(req, res, next) {
  try {
    const { email, role } = req.body;

    if (!email) return next(new ApiError(400, "Email is required"));

    const callerRole = req.memberRole;
    const requestedRole = role === "Admin" ? "Admin" : role === "Viewer" ? "Viewer" : "Member";

    if (callerRole !== "Admin" && requestedRole === "Admin") {
      return next(new ApiError(403, "Only admins can grant the Admin role"));
    }

    const User = require("../models/user.model");
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });

    if (!user) {
      return next(new ApiError(404, "No account exists for that email"));
    }

    const existing = await WorkspaceMember.findOne({
      workspaceId: req.workspace._id,
      userId: user._id,
    });

    if (existing) {
      return next(new ApiError(409, "This user is already a member"));
    }

    const member = await WorkspaceMember.create({
      workspaceId: req.workspace._id,
      userId: user._id,
      role: requestedRole,
    });

    await recordActivity({
      workspaceId: req.workspace._id,
      userId: req.user._id,
      action: "MEMBERSHIP_UPDATED",
      targetType: "member",
      targetId: user._id,
      metadata: { email: user.email, role: requestedRole },
    });

    await createNotification({
      userId: user._id,
      actorId: req.user._id,
      workspaceId: req.workspace._id,
      type: "MEMBER_ADDED",
      title: `You were added to ${req.workspace.name}`,
      body: `${req.user.name} added you as ${requestedRole.toLowerCase()}.`,
      link: `/workspaces/${req.workspace._id}`,
    });

    res.status(201).json({ success: true, member: normalizeMember(member, user, req.workspace.ownerId) });
  } catch (error) {
    next(error);
  }
}

async function updateMemberRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    const allowedRoles = ["Admin", "Member", "Viewer"];
    if (!allowedRoles.includes(role)) {
      return next(new ApiError(400, "Invalid role"));
    }

    const member = await WorkspaceMember.findOne({
      workspaceId: req.workspace._id,
      userId,
    });

    if (!member) {
      return next(new ApiError(404, "Member not found"));
    }

    const targetUser = await require("../models/user.model").findById(userId);
    const isOwnerTarget = String(req.workspace.ownerId) === String(userId);

    if (isOwnerTarget && role !== "Admin") {
      return next(new ApiError(400, "Workspace owners must remain admins"));
    }

    member.role = role;
    await member.save();

    res.json({
      success: true,
      member: normalizeMember(member, targetUser || {}, req.workspace.ownerId),
    });
  } catch (error) {
    next(error);
  }
}

async function removeMember(req, res, next) {
  try {
    const { userId } = req.params;

    if (String(req.user._id) === String(userId)) {
      return next(new ApiError(400, "You cannot remove yourself"));
    }

    const member = await WorkspaceMember.findOne({
      workspaceId: req.workspace._id,
      userId,
    });

    if (!member) {
      return next(new ApiError(404, "Member not found"));
    }

    const isOwnerTarget = String(req.workspace.ownerId) === String(userId);
    if (isOwnerTarget) {
      return next(new ApiError(400, "You cannot remove the workspace owner"));
    }

    await WorkspaceMember.deleteOne({ _id: member._id });

    res.json({ success: true, message: "Member removed" });
  } catch (error) {
    next(error);
  }
}

/**
 * A workspace's channels, with the derived `slug` filled in.
 *
 * `slug` is a pure function of `name`, so it is computed on read for channels
 * created before Phase 19 and stored on create for new ones. Backfilling on
 * read means existing workspaces immediately get `#general`,
 * `#announcements` and `#project-help` with correct slugs without a migration.
 */
function serializeChannel(channel) {
  const plain = typeof channel.toObject === "function" ? channel.toObject() : channel;
  return {
    id: String(plain._id),
    name: plain.name,
    slug: plain.slug || slugifyChannelName(plain.name),
    description: plain.description || "",
    projectId: plain.projectId ? String(plain.projectId) : null,
    createdBy: plain.createdBy ? String(plain.createdBy) : null,
    createdAt: plain.createdAt || null,
  };
}

async function listChannels(req, res, next) {
  res.json({ success: true, channels: (req.workspace.channels || []).map(serializeChannel) });
}

async function createChannel(req, res, next) {
  try {
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return next(new ApiError(400, "Channel name is required"));
    }

    const slug = slugifyChannelName(name);
    if (!slug) {
      return next(new ApiError(400, "Channel name must contain letters or numbers"));
    }

    // Uniqueness is on the slug, so "Project Help" and "project-help" cannot
    // both be created and later become two threads for one channel.
    if (req.workspace.channels.some((c) => (c.slug || slugifyChannelName(c.name)) === slug)) {
      return next(new ApiError(409, "A channel with that name already exists"));
    }

    req.workspace.channels.push({
      name: String(name).trim(),
      slug,
      createdBy: req.user._id,
    });

    await req.workspace.save();

    res.status(201).json({ success: true, channels: req.workspace.channels.map(serializeChannel) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listWorkspaces,
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listMembers,
  addMember,
  updateMemberRole,
  removeMember,
  listChannels,
  createChannel,
};
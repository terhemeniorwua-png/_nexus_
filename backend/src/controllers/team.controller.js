const mongoose = require("mongoose");
const Team = require("../models/team.model");
const TeamMember = require("../models/teamMember.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const Project = require("../models/project.model");
const Task = require("../models/task.model");
const { ApiError } = require("../middleware/errorHandler");
const { recordActivity } = require("../services/activity.service");
const { createNotification } = require("../services/notification.service");
const { hasWorkspacePermission } = require("../permissions/permissions");

const TEAM_ROLES = ["TEAM_LEAD", "MEMBER"];

function normalizeMember(member, user) {
  return {
    id: member.id,
    role: member.role,
    joinedAt: member.joinedAt || member.createdAt,
    user: user
      ? { id: user.id, name: user.name, email: user.email, avatar: user.avatar || "" }
      : { id: String(member.userId) },
  };
}

async function withTeamStats(team) {
  const [memberCount, projectCount] = await Promise.all([
    TeamMember.countDocuments({ teamId: team._id }),
    Project.countDocuments({ teamId: team._id }),
  ]);
  return { ...team.toJSON(), stats: { memberCount, projectCount } };
}

async function listWorkspaceTeams(req, res, next) {
  try {
    const teams = await Team.find({ workspaceId: req.workspace._id }).sort({ createdAt: -1 });
    const data = await Promise.all(teams.map(withTeamStats));
    res.json({ success: true, teams: data });
  } catch (error) {
    next(error);
  }
}

async function createTeam(req, res, next) {
  try {
    const name = req.body.name !== undefined ? String(req.body.name).trim() : "";
    const description = req.body.description !== undefined ? String(req.body.description).trim() : "";

    if (!name) return next(new ApiError(400, "Team name is required"));
    if (name.length > 120) return next(new ApiError(400, "Team name cannot exceed 120 characters"));
    if (description.length > 1000) {
      return next(new ApiError(400, "Description cannot exceed 1000 characters"));
    }

    const existing = await Team.findOne({ workspaceId: req.workspace._id, name });
    if (existing) {
      return next(new ApiError(409, "A team with that name already exists in this workspace"));
    }

    const team = await Team.create({ workspaceId: req.workspace._id, name, description });

    // The creator leads the team they create. Role is assigned server-side.
    await TeamMember.create({
      teamId: team._id,
      userId: req.user._id,
      role: "TEAM_LEAD",
    });

    await recordActivity({
      workspaceId: req.workspace._id,
      userId: req.user._id,
      action: "TEAM_CREATED",
      targetType: "team",
      targetId: team._id,
      metadata: { name: team.name },
    });

    res.status(201).json({
      success: true,
      team: await withTeamStats(team),
      role: req.workspaceRole,
      isTeamLead: true,
      members: [
        normalizeMember(
          { id: req.user._id, role: "TEAM_LEAD", joinedAt: new Date(), userId: req.user._id },
          req.user
        ),
      ],
    });
  } catch (error) {
    next(error);
  }
}

async function getTeam(req, res, next) {
  try {
    const team = req.team;

    const [projects, memberCount, projectCount] = await Promise.all([
      Project.find({ teamId: team._id }).sort({ createdAt: -1 }),
      TeamMember.countDocuments({ teamId: team._id }),
      Project.countDocuments({ teamId: team._id }),
    ]);

    const projectData = await Promise.all(
      projects.map(async (project) => {
        const taskCount = await Task.countDocuments({ projectId: project._id });
        return {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          priority: project.priority,
          taskCount,
        };
      })
    );

    res.json({
      success: true,
      team: { ...team.toJSON(), stats: { memberCount, projectCount } },
      workspace: { id: req.workspace.id, name: req.workspace.name },
      role: req.workspaceRole,
      isTeamLead: req.isTeamLead,
      projects: projectData,
    });
  } catch (error) {
    next(error);
  }
}

async function updateTeam(req, res, next) {
  try {
    const team = req.team;
    const { name, description } = req.body;

    if (name !== undefined) {
      const nextName = String(name).trim();
      if (!nextName) return next(new ApiError(400, "Team name cannot be empty"));
      if (nextName.length > 120) {
        return next(new ApiError(400, "Team name cannot exceed 120 characters"));
      }
      if (nextName !== team.name) {
        const existing = await Team.findOne({ workspaceId: req.workspace._id, name: nextName });
        if (existing) {
          return next(new ApiError(409, "A team with that name already exists in this workspace"));
        }
      }
      team.name = nextName;
    }

    if (description !== undefined) {
      const nextDescription = String(description).trim();
      if (nextDescription.length > 1000) {
        return next(new ApiError(400, "Description cannot exceed 1000 characters"));
      }
      team.description = nextDescription;
    }

    await team.save();

    await recordActivity({
      workspaceId: req.workspace._id,
      userId: req.user._id,
      action: "TEAM_UPDATED",
      targetType: "team",
      targetId: team._id,
      metadata: { name: team.name },
    });

    res.json({ success: true, team: await withTeamStats(team) });
  } catch (error) {
    next(error);
  }
}

async function deleteTeam(req, res, next) {
  try {
    const team = req.team;

    await TeamMember.deleteMany({ teamId: team._id });

    // Unlink projects from the team — deleting a team must NOT delete projects.
    await Project.updateMany({ teamId: team._id }, { $set: { teamId: null } });

    await Team.deleteOne({ _id: team._id });

    await recordActivity({
      workspaceId: req.workspace._id,
      userId: req.user._id,
      action: "TEAM_DELETED",
      targetType: "team",
      targetId: team._id,
      metadata: { name: team.name },
    });

    res.json({ success: true, message: "Team deleted" });
  } catch (error) {
    next(error);
  }
}

async function listTeamMembers(req, res, next) {
  try {
    const members = await TeamMember.find({ teamId: req.team._id })
      .populate("userId", "name email avatar")
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      members: members.map((m) => normalizeMember(m, m.userId)),
    });
  } catch (error) {
    next(error);
  }
}

async function addTeamMember(req, res, next) {
  try {
    const { userId } = req.body;

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return next(new ApiError(400, "A valid user id is required"));
    }

    const { role } = req.body;
    if (role !== undefined && !TEAM_ROLES.includes(role)) {
      return next(new ApiError(400, "Invalid team role"));
    }

    // Only workspace owners/admins (manage_team_members) may grant TEAM_LEAD.
    // A team lead adding someone may only add them as a member.
    if (role === "TEAM_LEAD" && !hasWorkspacePermission(req.workspaceRole, "manage_team_members")) {
      return next(new ApiError(403, "Only workspace admins can grant the team lead role"));
    }

    const User = require("../models/user.model");
    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    // The target user must belong to the same workspace as the team.
    const workspaceMember = await WorkspaceMember.findOne({
      workspaceId: req.team.workspaceId,
      userId: user._id,
    });
    if (!workspaceMember) {
      return next(new ApiError(400, "User must be a member of this workspace"));
    }

    const existing = await TeamMember.findOne({ teamId: req.team._id, userId: user._id });
    if (existing) {
      return next(new ApiError(409, "This user is already on this team"));
    }

    const member = await TeamMember.create({
      teamId: req.team._id,
      userId: user._id,
      role,
    });

    await recordActivity({
      workspaceId: req.workspace._id,
      userId: req.user._id,
      action: "TEAM_MEMBER_ADDED",
      targetType: "team",
      targetId: req.team._id,
      metadata: { name: req.team.name, email: user.email, role },
    });

    await createNotification({
      userId: user._id,
      actorId: req.user._id,
      workspaceId: req.workspace._id,
      type: "MEMBER_ADDED",
      title: `You were added to the ${req.team.name} team`,
      body: `${req.user.name} added you to ${req.team.name}.`,
      link: `/workspaces/${req.workspace._id}`,
    });

    res.status(201).json({ success: true, member: normalizeMember(member, user) });
  } catch (error) {
    next(error);
  }
}

async function updateTeamMemberRole(req, res, next) {
  try {
    const { userId } = req.params;

    const role = req.body.role;
    if (!TEAM_ROLES.includes(role)) {
      return next(new ApiError(400, "Invalid team role"));
    }

    if (role === "TEAM_LEAD" && !hasWorkspacePermission(req.workspaceRole, "manage_team_members")) {
      return next(new ApiError(403, "Only workspace admins can grant the team lead role"));
    }

    const member = await TeamMember.findOne({ teamId: req.team._id, userId });
    if (!member) {
      return next(new ApiError(404, "Team member not found"));
    }

    member.role = role;
    await member.save();

    const populated = await member.populate("userId", "name email avatar");

    res.json({ success: true, member: normalizeMember(populated, populated.userId) });
  } catch (error) {
    next(error);
  }
}

async function removeTeamMember(req, res, next) {
  try {
    const { userId } = req.params;

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return next(new ApiError(400, "A valid user id is required"));
    }

    const member = await TeamMember.findOne({ teamId: req.team._id, userId });
    if (!member) {
      return next(new ApiError(404, "Team member not found"));
    }

    await TeamMember.deleteOne({ _id: member._id });

    const user = await require("../models/user.model").findById(userId);

    await recordActivity({
      workspaceId: req.workspace._id,
      userId: req.user._id,
      action: "TEAM_MEMBER_REMOVED",
      targetType: "team",
      targetId: req.team._id,
      metadata: { name: req.team.name, email: user ? user.email : String(userId) },
    });

    res.json({ success: true, message: "Member removed" });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listWorkspaceTeams,
  createTeam,
  getTeam,
  updateTeam,
  deleteTeam,
  listTeamMembers,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
};
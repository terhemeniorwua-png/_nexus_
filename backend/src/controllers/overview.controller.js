const Workspace = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const Project = require("../models/project.model");
const ProjectMember = require("../models/projectMember.model");
const Task = require("../models/task.model");
const { latestActivityAcross } = require("../services/activity.service");

/**
 * Compute the user's accessible projects across all their workspaces.
 * Workspace owners/admins see every project in their workspaces; everyone
 * else only sees projects they are a member of (or manage).
 */
async function accessibleScope(me) {
  const memberships = await WorkspaceMember.find({ userId: me._id });
  const owned = await Workspace.find({ ownerId: me._id }).select("_id");

  const ownedIds = new Set(owned.map((w) => String(w._id)));

  const roleByWorkspace = {};
  memberships.forEach((m) => {
    roleByWorkspace[String(m.workspaceId)] = m.role;
  });
  owned.forEach((w) => {
    roleByWorkspace[String(w._id)] = "Admin";
  });

  const workspaceIds = [
    ...new Set([...Object.keys(roleByWorkspace), ...ownedIds]),
  ];

  if (workspaceIds.length === 0) {
    return {
      workspaceIds: [],
      projects: [],
      roleByWorkspace,
      ownedIds,
    };
  }

  const adminWorkspaceIds = new Set(
    Object.entries(roleByWorkspace)
      .filter(([, role]) => role === "Admin")
      .map(([wsId]) => wsId)
  );

  const memberProjects = await ProjectMember.find({ userId: me._id }).select("projectId");
  const managedProjects = await Project.find({ managerId: me._id }).select("_id");

  const accessibleIds = new Set([
    ...memberProjects.map((m) => String(m.projectId)),
    ...managedProjects.map((p) => String(p._id)),
  ]);

  if (adminWorkspaceIds.size > 0) {
    const adminAll = await Project.find({ workspaceId: { $in: [...adminWorkspaceIds] } }).select("_id");
    adminAll.forEach((p) => accessibleIds.add(String(p._id)));
  }

  const projects = await Project.find({
    workspaceId: { $in: workspaceIds },
    _id: { $in: [...accessibleIds] },
  });

  return { workspaceIds, projects, roleByWorkspace, ownedIds };
}

async function getOverview(req, res, next) {
  try {
    const me = req.user;

    const { workspaceIds, projects, roleByWorkspace, ownedIds } = await accessibleScope(me);

    if (workspaceIds.length === 0) {
      return res.json({
        success: true,
        overview: {
          workspaces: [],
          dueSoonTasks: [],
          overdueTasks: [],
          inProgressTasks: [],
          recentActivity: [],
        },
      });
    }

    const workspaces = await Workspace.find({ _id: { $in: workspaceIds } }).sort({ updatedAt: -1 });

    const workspaceByProject = {};
    const projectById = {};
    projects.forEach((project) => {
      projectById[String(project._id)] = project;
      workspaceByProject[String(project._id)] = String(project.workspaceId);
    });

    const workspaceName = {};
    workspaces.forEach((workspace) => {
      workspaceName[String(workspace._id)] = workspace.name;
    });

    const myTasks = await Task.find({
      projectId: { $in: projects.map((p) => p._id) },
      assignedTo: me._id,
    })
      .sort({ dueDate: 1 })
      .limit(200);

    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;

    const decorate = (task) => ({
      ...task.toJSON(),
      projectId: String(task.projectId),
      workspaceId: workspaceByProject[String(task.projectId)] || null,
      workspaceName: workspaceName[workspaceByProject[String(task.projectId)]] || "Unknown",
      projectName: projectById[String(task.projectId)]?.name || "Unknown",
    });

    const dueSoon = [];
    const overdue = [];
    const inProgress = [];

    myTasks.forEach((task) => {
      const due = task.dueDate ? new Date(task.dueDate).getTime() : null;
      const decorated = decorate(task);

      // Phase 10: APPROVED (workflow) and the legacy DONE are both terminal.
      const terminal = task.status === "DONE" || task.status === "APPROVED";
      if (!due || terminal) return;

      if (due < now) {
        overdue.push(decorated);
      } else if (due <= now + week) {
        dueSoon.push(decorated);
      }

      if (task.status === "IN_PROGRESS" || task.status === "IN PROGRESS") inProgress.push(decorated);
    });

    const recentActivityItems = await latestActivityAcross(workspaceIds, projects.map((p) => p._id), 15);

    const decoratedActivity = recentActivityItems.map((entry) => {
      const json = entry.toJSON();
      return {
        ...json,
        workspaceId: String(entry.workspaceId),
        workspaceName: workspaceName[String(entry.workspaceId)] || "Unknown",
      };
    });

    const workspaceRows = await Promise.all(
      workspaces.map(async (workspace) => {
        const workspaceProjects = projects.filter((p) => String(p.workspaceId) === String(workspace._id));
        const projectIds = workspaceProjects.map((p) => p._id);
        const [memberCount, taskCount] = await Promise.all([
          WorkspaceMember.countDocuments({ workspaceId: workspace._id }),
          Task.countDocuments({ projectId: { $in: projectIds } }),
        ]);
        const role =
          ownedIds.has(String(workspace._id)) || roleByWorkspace[String(workspace._id)] === "Admin"
            ? "Admin"
            : roleByWorkspace[String(workspace._id)] || "Member";
        return {
          ...workspace.toJSON(),
          role,
          stats: { memberCount, taskCount, projectCount: workspaceProjects.length },
        };
      })
    );

    res.json({
      success: true,
      overview: {
        workspaces: workspaceRows,
        dueSoonTasks: dueSoon,
        overdueTasks: overdue,
        inProgressTasks: inProgress,
        recentActivity: decoratedActivity,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getMyTasks(req, res, next) {
  try {
    const me = req.user;

    const { workspaceIds, projects } = await accessibleScope(me);

    if (workspaceIds.length === 0) {
      return res.json({ success: true, tasks: [] });
    }

    const workspaces = await Workspace.find({ _id: { $in: workspaceIds } });

    const workspaceById = {};
    const projectById = {};
    const workspaceByProject = {};
    workspaces.forEach((workspace) => {
      workspaceById[String(workspace._id)] = workspace;
    });
    projects.forEach((project) => {
      projectById[String(project._id)] = project;
      workspaceByProject[String(project._id)] = String(project.workspaceId);
    });

    const tasks = await Task.find({
      projectId: { $in: projects.map((p) => p._id) },
      assignedTo: me._id,
    })
      .populate("assignedTo", "name email avatar")
      .sort({ dueDate: 1, updatedAt: -1 })
      .limit(300);

    const decorated = tasks.map((task) => ({
      ...task.toJSON(),
      projectId: String(task.projectId),
      projectName: projectById[String(task.projectId)]?.name || "Unknown",
      workspaceId: workspaceByProject[String(task.projectId)] || null,
      workspaceName: workspaceById[workspaceByProject[String(task.projectId)]]?.name || "Unknown",
      columnName: task.status,
    }));

    res.json({ success: true, tasks: decorated });
  } catch (error) {
    next(error);
  }
}

module.exports = { getOverview, getMyTasks };
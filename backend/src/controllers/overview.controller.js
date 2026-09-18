const Workspace = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const Project = require("../models/project.model");
const Task = require("../models/task.model");
const Activity = require("../models/activity.model");
const { latestActivity } = require("../services/activity.service");

async function getOverview(req, res, next) {
  try {
    const me = req.user;

    const memberships = await WorkspaceMember.find({ userId: me._id });
    const owned = await Workspace.find({ ownerId: me._id }).select("_id");

    const ids = [
      ...new Set([...memberships.map((m) => String(m.workspaceId)), ...owned.map((w) => String(w._id))]),
    ];

    if (ids.length === 0) {
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

    const workspaces = await Workspace.find({ _id: { $in: ids } }).sort({ updatedAt: -1 });

    const projects = await Project.find({ workspaceId: { $in: ids } });

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

      if (!due) {
        return;
      }

      if (task.status === "DONE") return;

      if (due < now) {
        overdue.push(decorated);
      } else if (due <= now + week) {
        dueSoon.push(decorated);
      }

      if (task.status === "IN PROGRESS") inProgress.push(decorated);
    });

    const recentActivityItems = await latestActivity(ids, 15);

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
        const roleByWs = {};
        memberships.forEach((m) => {
          roleByWs[String(m.workspaceId)] = m.role;
        });
        return {
          ...workspace.toJSON(),
          role: roleByWs[String(workspace._id)] || "Admin",
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

    const memberships = await WorkspaceMember.find({ userId: me._id });
    const owned = await Workspace.find({ ownerId: me._id }).select("_id");

    const ids = [
      ...new Set([...memberships.map((m) => String(m.workspaceId)), ...owned.map((w) => String(w._id))]),
    ];

    if (ids.length === 0) {
      return res.json({ success: true, tasks: [] });
    }

    const workspaces = await Workspace.find({ _id: { $in: ids } });
    const projects = await Project.find({ workspaceId: { $in: ids } });

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
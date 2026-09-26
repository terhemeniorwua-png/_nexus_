const Workspace = require("../models/workspace.model");
const WorkspaceMember = require("../models/workspaceMember.model");
const Project = require("../models/project.model");
const Task = require("../models/task.model");
const { latestActivityAcross } = require("../services/activity.service");
const { computeProjectStats, accessibleProjectScope } = require("../services/project.service");

async function getOverview(req, res, next) {
  try {
    const me = req.user;

    const { workspaceIds, projects, roleByWorkspace, ownedIds } = await accessibleProjectScope(me);

    if (workspaceIds.length === 0) {
      return res.json({
        success: true,
        overview: {
          workspaces: [],
          projects: [],
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

    // Phase 11: per-project progress for the dashboard, from the same batched
    // aggregation the project list/detail use (one Task read for all projects,
    // never one query per project). No progress is recomputed here.
    const projectStats = await computeProjectStats(projects.map((p) => p._id));

    const projectRows = projects.map((project, index) => {
      const stat = projectStats[index] || {};
      return {
        id: String(project._id),
        name: project.name,
        description: project.description || "",
        status: project.status || "ACTIVE",
        workspaceId: String(project.workspaceId),
        workspaceName: workspaceName[String(project.workspaceId)] || "Unknown",
        progress: stat.progress ?? 0,
        stats: {
          taskCount: stat.taskCount ?? 0,
          doneCount: stat.doneCount ?? 0,
          inProgressCount: stat.inProgressCount ?? 0,
          underReviewCount: stat.underReviewCount ?? 0,
          submittedCount: stat.submittedCount ?? 0,
        },
      };
    });

    res.json({
      success: true,
      overview: {
        workspaces: workspaceRows,
        projects: projectRows,
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

    const { workspaceIds, projects } = await accessibleProjectScope(me);

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
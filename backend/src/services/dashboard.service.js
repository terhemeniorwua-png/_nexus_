"use strict";

/**
 * Phase 20 — dashboard aggregation.
 *
 * Every number and row here is derived from the database at request time. There
 * are no cached totals, no seeded demo figures and no fallback constants: if a
 * task is completed, reassigned or deleted, the next dashboard load reflects it.
 *
 * Two rules shape the implementation:
 *
 *   1. Reachability comes from `accessibleProjectScope` — the same function the
 *      project list and detail pages use. A dashboard can therefore never
 *      report a project the user could not open, and it never re-derives the
 *      membership rules.
 *
 *   2. Counts are computed with aggregation, not by loading rows. `myTasks` is
 *      a small projected list; the totals behind the cards come from a single
 *      `$group`, and the notification/recency reads are bounded. Nothing walks
 *      the projects one query at a time.
 */

const mongoose = require("mongoose");
const Task = require("../models/task.model");
const ProjectView = require("../models/projectView.model");
const { accessibleProjectScope } = require("./project.service");

/** Workflow terminal state, plus the legacy board label for old data. */
const TERMINAL_STATUSES = ["APPROVED", "DONE"];

const MY_TASKS_LIMIT = 6;
const RECENTLY_VIEWED_LIMIT = 5;

/**
 * Stats + My Tasks for one user.
 *
 * "Relevant tasks" means tasks assigned to this user inside a project they can
 * reach — the same set the My Tasks table lists, so the card and the list can
 * never disagree. It is deliberately *not* every task in their projects: that
 * would make the card a workspace-wide metric while the list is personal.
 */
async function getDashboardStats({ userId }) {
  const { projects } = await accessibleProjectScope({ _id: userId });
  const projectIds = projects.map((p) => p._id);
  const projectById = new Map(projects.map((p) => [String(p._id), p]));

  // No reachable projects: nothing to count, and no query worth sending.
  if (projectIds.length === 0) {
    return {
      projectIds: [],
      projectById,
      stats: { projects: 0, tasks: 0, completedTasks: 0, progress: 0 },
      myTasks: [],
    };
  }

  const [taskTotals, myTasks] = await Promise.all([
    // One aggregation for both card figures.
    //
    // `assignedTo` is cast to an ObjectId explicitly: unlike `find()`, an
    // aggregation pipeline is not cast by Mongoose, so a raw string here would
    // silently match nothing and report every count as zero.
    Task.aggregate([
      {
        $match: {
          projectId: { $in: projectIds },
          assignedTo: new mongoose.Types.ObjectId(String(userId)),
        },
      },
      {
        $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 } } }],
          completed: [
            { $match: { status: { $in: TERMINAL_STATUSES } } },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
        },
      },
    ]),
    Task.find({ projectId: { $in: projectIds }, assignedTo: userId })
      .select("title status priority dueDate updatedAt projectId createdAt")
      .sort({ updatedAt: -1 })
      .limit(MY_TASKS_LIMIT)
      .lean(),
  ]);

  const facet = taskTotals[0] || {};
  const total = facet.totals?.[0]?.total || 0;
  const completed = facet.completed?.[0]?.count || 0;

  return {
    projectIds,
    projectById,
    stats: {
      projects: projectIds.length,
      tasks: total,
      completedTasks: completed,
      // Division by zero is a real case — a brand new account has no tasks —
      // and must read 0%, not NaN.
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
    myTasks: myTasks.map((task) => decorateTask(task, projectById)),
  };
}

/**
 * Attach the project name without a per-task lookup.
 *
 * `projectById` is already in memory from the scope query, so this is a map
 * read rather than an N+1 `populate`. A task whose project has since been
 * deleted (or that references a project outside the scope) degrades to
 * "Unknown" instead of disappearing or throwing.
 */
function decorateTask(task, projectById) {
  const project = projectById.get(String(task.projectId));
  return {
    id: String(task._id),
    title: task.title || "Untitled task",
    status: task.status || "ASSIGNED",
    priority: task.priority || "MEDIUM",
    projectId: project ? String(project._id) : null,
    projectName: project?.name || "Unknown project",
    dueDate: task.dueDate || null,
    updatedAt: task.updatedAt || null,
  };
}

/**
 * Recently viewed projects, newest first.
 *
 * Filtered by intersecting the view records with the projects the user can
 * currently reach. That single intersection is what makes §6F/§6's "exclude
 * deleted projects or lost access" true by construction: a `ProjectView` row
 * for a project that has been deleted, or that the user has since lost access
 * to, cannot appear, because that project id is not in the scope.
 */
async function getRecentlyViewed({ userId, projectIds, projectById }) {
  if (projectIds.length === 0) return [];

  const views = await ProjectView.find({
    viewerId: userId,
    projectId: { $in: projectIds },
  })
    .select("projectId lastViewedAt")
    .sort({ lastViewedAt: -1 })
    .limit(RECENTLY_VIEWED_LIMIT)
    .lean();

  return views
    .map((view) => {
      const project = projectById.get(String(view.projectId));
      if (!project) return null;
      return {
        id: String(project._id),
        name: project.name || "Untitled project",
        status: project.status || "ACTIVE",
        lastViewedAt: view.lastViewedAt || null,
      };
    })
    .filter(Boolean);
}

/**
 * Record that a user opened a project.
 *
 * Uses the existing `ProjectView` model and its unique (viewerId, projectId)
 * index, so repeated visits update one row rather than accumulating duplicates.
 * Safe to call concurrently and cheap: it is a single upsert.
 */
async function recordProjectView({ userId, projectId }) {
  try {
    await ProjectView.findOneAndUpdate(
      { viewerId: userId, projectId },
      { $set: { lastViewedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch {
    // View tracking is not worth failing a page read over: a duplicate-key race
    // between two first-views of the same project is not an error worth
    // surfacing, and the row exists either way.
  }
}

module.exports = {
  TERMINAL_STATUSES,
  MY_TASKS_LIMIT,
  RECENTLY_VIEWED_LIMIT,
  getDashboardStats,
  getRecentlyViewed,
  recordProjectView,
};

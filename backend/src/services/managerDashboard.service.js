"use strict";

/**
 * Phase 21 — project manager dashboard aggregation.
 *
 * Every figure and row below is derived from the database at request time.
 * There are no cached totals, no seeded demo numbers and no fallback constants:
 * complete a task, submit a deliverable or reassign work, and the next load
 * reflects it.
 *
 * Three rules shape the implementation:
 *
 *   1. Reachability comes first. `managedProjectScope` — not a query written
 *      here — decides which projects may be reported on, and it is the same
 *      gate the review routes use. This service never widens it.
 *
 *   2. Counts are computed with aggregation, not by loading rows. The overview
 *      is a single `$facet`, the per-project picker roll-up is a single
 *      `$group`, and the workload breakdown is a single `$group` whose
 *      `_id` (the assignee) is resolved against users already in memory. The
 *      only `find()`s are the three bounded lists the page has to render.
 *
 *   3. Nothing is invented. Tasks have no estimate, effort or capacity field
 *      anywhere in the schema, so the workload panel reports a count of *open*
 *      tasks per assignee and is labelled as exactly that. It is not presented
 *      as a percentage of capacity, because that number does not exist and
 *      inventing one would be the single most misleading figure on the page.
 *
 * Legacy board statuses are real rows in the database (they are only read-only
 * *labels* for old data, not invalid), so every filter here maps them onto
 * their workflow equivalents: `REVIEW` is a pending submission and `DONE` is a
 * completed task.
 */

const Task = require("../models/task.model");
const Deliverable = require("../models/deliverable.model");
const DeliverableVersion = require("../models/deliverableVersion.model");
const DeliverableReview = require("../models/deliverableReview.model");
const Activity = require("../models/activity.model");
const User = require("../models/user.model");
const Workspace = require("../models/workspace.model");

/** Workflow terminal state, plus the legacy board label for old data. */
const TERMINAL_STATUSES = ["APPROVED", "DONE"];

/**
 * Work waiting on a decision.
 *
 * `REVIEW` is the legacy spelling of `SUBMITTED` and belongs in the same queue;
 * excluding it would hide real pending work on older projects.
 */
const PENDING_TASK_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "REVIEW"];
const PENDING_DELIVERABLE_STATUSES = ["SUBMITTED", "UNDER_REVIEW"];

/** The only legacy "stuck" label; there is no canonical BLOCKED state. */
const BLOCKED_STATUSES = ["BLOCKED"];

/** Priority is stored in either case by the enum, so match both spellings. */
const HIGH_PRIORITY_STATUSES = ["HIGH", "URGENT", "High", "Urgent"];

const PENDING_REVIEW_LIMIT = 25;
const OVERDUE_LIMIT = 20;
const ACTIVITY_LIMIT = 15;
const WORKLOAD_LIMIT = 12;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** `{ overdue: 1 }`-style condition reused by several aggregations. */
function isOverdue(field = "$dueDate", now = new Date()) {
  return { $and: [{ $ne: [field, null] }, { $lt: [field, now] }] };
}

function progressPercent(completed, total) {
  // Division by zero is a real case — a project created moments ago has no
  // tasks — and must read 0%, not NaN.
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

/**
 * The projects the manager may switch between, with a roll-up per project.
 *
 * The roll-up lets the picker show "12 tasks · 2 awaiting review" without the
 * frontend having to fetch every project to find out. Two aggregations cover
 * the whole list: one over tasks, one over deliverables.
 */
async function getManagedProjects({ projects, workspaceIds }) {
  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p._id);

  const workspaces = await Workspace.find({ _id: { $in: workspaceIds } }).select("name");
  const workspaceName = new Map(workspaces.map((w) => [String(w._id), w.name]));

  const [taskRollup, reviewRollup] = await Promise.all([
    Task.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      {
        $group: {
          _id: "$projectId",
          tasks: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $in: ["$status", TERMINAL_STATUSES] }, 1, 0] },
          },
          overdue: {
            $sum: {
              $cond: [
                // `$not`/`$in`, not `$nin`: inside a `$cond` these are
                // aggregation expressions, and `$nin` is a *query* operator, so
                // Mongo rejects the whole pipeline. ($match above may use $nin;
                // here it would throw "Unrecognized expression".)
                {
                  $and: [
                    { $not: { $in: ["$status", TERMINAL_STATUSES] } },
                    isOverdue(),
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    Deliverable.aggregate([
      {
        $match: {
          projectId: { $in: projectIds },
          status: { $in: PENDING_DELIVERABLE_STATUSES },
        },
      },
      { $group: { _id: "$projectId", pendingReviews: { $sum: 1 } } },
    ]),
  ]);

  const tasksByProject = new Map(taskRollup.map((row) => [String(row._id), row]));
  const reviewsByProject = new Map(reviewRollup.map((row) => [String(row._id), row]));

  return projects
    .map((project) => {
      const id = String(project._id);
      const rollup = tasksByProject.get(id) || { tasks: 0, completed: 0, overdue: 0 };
      const tasks = rollup.tasks || 0;
      const completed = rollup.completed || 0;
      return {
        id,
        name: project.name || "Untitled project",
        status: project.status || "ACTIVE",
        workspaceId: String(project.workspaceId),
        workspaceName: workspaceName.get(String(project.workspaceId)) || "Unknown workspace",
        tasks,
        completedTasks: completed,
        progress: progressPercent(completed, tasks),
        pendingReviews: reviewsByProject.get(id)?.pendingReviews || 0,
        overdueTasks: rollup.overdue || 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Overview figures for the selected scope (one project, or all of them).
 *
 * `byStatus` is returned as a plain object keyed by status rather than a list
 * so the frontend can render a distribution without re-deriving which statuses
 * are zero — an absent key means "no tasks in this state", not "unknown".
 */
async function getOverview({ projectIds }) {
  if (projectIds.length === 0) {
    return {
      projects: 0,
      tasks: 0,
      completedTasks: 0,
      activeTasks: 0,
      overdueTasks: 0,
      blockedTasks: 0,
      inProgressTasks: 0,
      submittedTasks: 0,
      underReviewTasks: 0,
      progress: 0,
      byStatus: {},
    };
  }

  const rows = await Task.aggregate([
    { $match: { projectId: { $in: projectIds } } },
    {
      $facet: {
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        total: [{ $count: "count" }],
        completed: [
          { $match: { status: { $in: TERMINAL_STATUSES } } },
          { $count: "count" },
        ],
        overdue: [
          {
            $match: {
              status: { $nin: TERMINAL_STATUSES },
              dueDate: { $ne: null, $lt: new Date() },
            },
          },
          { $count: "count" },
        ],
      },
    },
  ]);

  const facet = rows[0] || {};
  const total = facet.total?.[0]?.count || 0;
  const completed = facet.completed?.[0]?.count || 0;

  const byStatus = {};
  (facet.byStatus || []).forEach((row) => {
    byStatus[row._id] = row.count;
  });

  const countOf = (...statuses) =>
    statuses.reduce((sum, status) => sum + (byStatus[status] || 0), 0);

  return {
    // The scope's project count, not a count of projects that happen to have
    // tasks: a managed project with no tasks is still a managed project.
    projects: projectIds.length,
    tasks: total,
    completedTasks: completed,
    activeTasks: total - completed,
    overdueTasks: facet.overdue?.[0]?.count || 0,
    blockedTasks: countOf(...BLOCKED_STATUSES),
    inProgressTasks: countOf("IN_PROGRESS", "IN PROGRESS"),
    submittedTasks: countOf("SUBMITTED", "REVIEW"),
    underReviewTasks: countOf("UNDER_REVIEW"),
    progress: progressPercent(completed, total),
    byStatus,
  };
}

/**
 * The review queue: everything waiting on a manager decision.
 *
 * Two kinds of item exist, because two things can be submitted:
 *
 *   - `deliverable` — a version was submitted through the Phase 12 flow. The
 *     decision is recorded on the version, and the actions are the existing
 *     `/api/deliverables/:id/versions/:n/*` review endpoints.
 *   - `task` — the task itself reached SUBMITTED with no deliverable attached
 *     (a legal transition in its own right). The actions are the existing
 *     `PATCH /api/tasks/:taskId/status` transitions.
 *
 * A task that has a deliverable pending review yields exactly one row, keyed on
 * the deliverable, with the task attached for context. Surfacing both would
 * double-count the same piece of work in the queue.
 *
 * `actions` mirrors `TRANSITION_RULES` in task.service.js and the deliverable
 * service's preconditions rather than guessing: a row only offers the calls
 * that are legal from the state it is actually in.
 */
async function getPendingReviews({ projectIds, projectById }) {
  if (projectIds.length === 0) return [];

  const [tasks, deliverables] = await Promise.all([
    Task.find({
      projectId: { $in: projectIds },
      status: { $in: PENDING_TASK_STATUSES },
    })
      .select("title status priority dueDate updatedAt assignedTo projectId")
      .sort({ updatedAt: 1 })
      .limit(PENDING_REVIEW_LIMIT)
      .lean(),
    Deliverable.find({
      projectId: { $in: projectIds },
      status: { $in: PENDING_DELIVERABLE_STATUSES },
    })
      .select("title status currentVersion taskId projectId createdBy updatedAt")
      .sort({ updatedAt: 1 })
      .limit(PENDING_REVIEW_LIMIT)
      .lean(),
  ]);

  let versionIndex = new Map();
  let reviewIndex = new Map();

  if (deliverables.length > 0) {
    const deliverableIds = deliverables.map((d) => d._id);
    const wantedVersions = new Set(
      deliverables.map((d) => `${String(d._id)}:${d.currentVersion}`)
    );

    const [versions, reviews] = await Promise.all([
      // The current version carries the submission timestamp, the file and the
      // submitter. Fetched for all pending deliverables in one query and
      // matched to `currentVersion` in memory, because a deliverable's history
      // is short and a per-row lookup would be the N+1 this whole file exists
      // to avoid.
      DeliverableVersion.find({ deliverableId: { $in: deliverableIds } })
        .select(
          "deliverableId versionNumber status fileName fileSize submittedBy submittedAt reviewedAt"
        )
        .lean(),
      DeliverableReview.find({ deliverableId: { $in: deliverableIds } })
        .sort({ reviewedAt: -1, _id: -1 })
        .lean(),
    ]);

    versionIndex = new Map(
      versions
        .filter((v) => wantedVersions.has(`${String(v.deliverableId)}:${v.versionNumber}`))
        .map((v) => [`${String(v.deliverableId)}:${v.versionNumber}`, v])
    );

    // Last decision per deliverable: a manager deciding twice (changes
    // requested, then re-submitted) needs the most recent one shown. The sort
    // above is newest-first, so the first row seen per deliverable wins.
    reviews.forEach((review) => {
      const key = String(review.deliverableId);
      if (!reviewIndex.has(key)) {
        reviewIndex.set(key, review);
      }
    });
  }

  // Task context for deliverable rows, and the assignee list for every row.
  const taskIds = [
    ...new Set([
      ...deliverables.map((d) => d.taskId).filter(Boolean).map(String),
      ...tasks.map((t) => String(t._id)),
    ]),
  ];
  const contextTasks = taskIds.length
    ? await Task.find({ _id: { $in: taskIds } })
        .select("title status priority dueDate assignedTo projectId")
        .lean()
    : [];
  const taskById = new Map(contextTasks.map((t) => [String(t._id), t]));

  const actorIds = new Set();
  tasks.forEach((t) => t.assignedTo && actorIds.add(String(t.assignedTo)));
  contextTasks.forEach((t) => t.assignedTo && actorIds.add(String(t.assignedTo)));
  versionIndex.forEach((v) => v.submittedBy && actorIds.add(String(v.submittedBy)));
  reviewIndex.forEach((r) => r.reviewerId && actorIds.add(String(r.reviewerId)));
  deliverables.forEach((d) => d.createdBy && actorIds.add(String(d.createdBy)));

  const users = actorIds.size
    ? await User.find({ _id: { $in: [...actorIds] } }).select("name email avatar").lean()
    : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const brief = (user) =>
    user
      ? { id: String(user._id), name: user.name || "Unknown user", avatar: user.avatar || null }
      : null;

  const projectName = (projectId) => projectById.get(String(projectId))?.name || "Unknown project";

  const rows = [];

  deliverables.forEach((deliverable) => {
    const key = `${String(deliverable._id)}:${deliverable.currentVersion}`;
    const version = versionIndex?.get(key) || null;
    const review = reviewIndex?.get(String(deliverable._id)) || null;
    const task = deliverable.taskId ? taskById.get(String(deliverable.taskId)) : null;
    const submittedBy = version?.submittedBy ? userById.get(String(version.submittedBy)) : null;

    rows.push({
      id: `deliverable:${String(deliverable._id)}`,
      kind: "deliverable",
      status: deliverable.status,
      title: deliverable.title || task?.title || "Untitled deliverable",
      taskId: task ? String(task._id) : null,
      taskTitle: task?.title || null,
      taskStatus: task?.status || null,
      projectId: String(deliverable.projectId),
      projectName: projectName(deliverable.projectId),
      deliverableId: String(deliverable._id),
      version: deliverable.currentVersion || null,
      fileName: version?.fileName || null,
      submittedBy: brief(submittedBy),
      submittedAt: version?.submittedAt || deliverable.updatedAt || null,
      lastReview: review
        ? {
            decision: review.decision,
            feedback: review.feedback || "",
            reviewerName: brief(userById.get(String(review.reviewerId)))?.name || null,
            reviewedAt: review.reviewedAt || null,
          }
        : null,
      actions: {
        // Both the version review and the decision calls require the version to
        // be in a reviewable state; the services enforce this, and offering a
        // dead button would be worse than hiding it.
        startReview: deliverable.status === "SUBMITTED",
        approve: PENDING_DELIVERABLE_STATUSES.includes(deliverable.status),
        requestChanges: PENDING_DELIVERABLE_STATUSES.includes(deliverable.status),
      },
    });
  });

  // A task already represented by a pending deliverable row is not added again.
  const coveredTaskIds = new Set(
    deliverables.map((d) => String(d.taskId)).filter(Boolean)
  );

  tasks.forEach((task) => {
    if (coveredTaskIds.has(String(task._id))) return;
    const assignee = task.assignedTo ? userById.get(String(task.assignedTo)) : null;
    rows.push({
      id: `task:${String(task._id)}`,
      kind: "task",
      status: task.status,
      title: task.title || "Untitled task",
      taskId: String(task._id),
      taskTitle: task.title || "Untitled task",
      taskStatus: task.status,
      projectId: String(task.projectId),
      projectName: projectName(task.projectId),
      deliverableId: null,
      version: null,
      fileName: null,
      submittedBy: brief(assignee),
      submittedAt: task.updatedAt || null,
      lastReview: null,
      actions: {
        // Legacy `REVIEW` has no outgoing transition rule in task.service.js,
        // so it is surfaced for visibility without a dead action.
        startReview: task.status === "SUBMITTED",
        approve: task.status === "UNDER_REVIEW",
        requestChanges: task.status === "UNDER_REVIEW",
      },
    });
  });

  // Oldest submission first: the queue is a work order, and the item that has
  // been waiting longest is the one a manager should be able to find.
  return rows
    .sort((a, b) => new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0))
    .slice(0, PENDING_REVIEW_LIMIT);
}

/**
 * Per-assignee open workload.
 *
 * This is a count of open tasks, labelled as such in the UI. It is not a
 * capacity percentage: `Task` has no estimate, effort or capacity field, so
 * there is no honest denominator for one. `highPriority` is included because
 * it is the only load signal the schema does support.
 */
async function getWorkload({ projectIds }) {
  if (projectIds.length === 0) return [];

  const rows = await Task.aggregate([
    { $match: { projectId: { $in: projectIds }, status: { $nin: TERMINAL_STATUSES } } },
    {
      $group: {
        _id: "$assignedTo",
        open: { $sum: 1 },
        inProgress: { $sum: { $cond: [{ $in: ["$status", ["IN_PROGRESS", "IN PROGRESS"]] }, 1, 0] } },
        submitted: { $sum: { $cond: [{ $in: ["$status", ["SUBMITTED", "REVIEW"]] }, 1, 0] } },
        underReview: { $sum: { $cond: [{ $eq: ["$status", "UNDER_REVIEW"] }, 1, 0] } },
        highPriority: { $sum: { $cond: [{ $in: ["$priority", HIGH_PRIORITY_STATUSES] }, 1, 0] } },
        overdue: { $sum: { $cond: [isOverdue(), 1, 0] } },
      },
    },
    { $sort: { open: -1, overdue: -1 } },
    { $limit: WORKLOAD_LIMIT },
  ]);

  if (rows.length === 0) return [];

  // Resolve the grouped assignees against users in one read. A null `_id` is a
  // real bucket — work that is assigned to nobody — and is reported as such
  // rather than dropped, because unassigned work is exactly what a manager
  // needs to see.
  const ids = rows.map((row) => row._id).filter(Boolean);
  const users = ids.length
    ? await User.find({ _id: { $in: ids } }).select("name email avatar").lean()
    : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  return rows.map((row) => {
    const user = row._id ? userById.get(String(row._id)) : null;
    return {
      userId: row._id ? String(row._id) : null,
      name: user ? user.name || "Unknown user" : "Unassigned",
      avatar: user?.avatar || null,
      open: row.open || 0,
      inProgress: row.inProgress || 0,
      submitted: row.submitted || 0,
      underReview: row.underReview || 0,
      highPriority: row.highPriority || 0,
      overdue: row.overdue || 0,
    };
  });
}

/** Open tasks past their due date, most overdue first. */
async function getOverdueTasks({ projectIds, projectById }) {
  if (projectIds.length === 0) return [];

  const now = new Date();
  const tasks = await Task.find({
    projectId: { $in: projectIds },
    status: { $nin: TERMINAL_STATUSES },
    dueDate: { $ne: null, $lt: now },
  })
    .select("title status priority dueDate assignedTo projectId updatedAt")
    .sort({ dueDate: 1 })
    .limit(OVERDUE_LIMIT)
    .lean();

  if (tasks.length === 0) return [];

  const ids = tasks.map((t) => t.assignedTo).filter(Boolean);
  const users = ids.length
    ? await User.find({ _id: { $in: ids } }).select("name avatar").lean()
    : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  return tasks.map((task) => {
    const assignee = task.assignedTo ? userById.get(String(task.assignedTo)) : null;
    return {
      id: String(task._id),
      title: task.title || "Untitled task",
      status: task.status || "ASSIGNED",
      priority: task.priority || "MEDIUM",
      dueDate: task.dueDate || null,
      // Positive days: "3 days overdue" reads correctly without a sign flip in
      // the template.
      daysOverdue: Math.max(1, Math.ceil((now - new Date(task.dueDate)) / 86400000)),
      projectId: String(task.projectId),
      projectName: projectById.get(String(task.projectId))?.name || "Unknown project",
      assignee: assignee
        ? { id: String(assignee._id), name: assignee.name || "Unknown user", avatar: assignee.avatar || null }
        : null,
    };
  });
}

/**
 * Recent activity for the scope.
 *
 * Queried per project id rather than through `latestActivity`, whose
 * `$or: [{ projectId: null }, ...]` deliberately includes workspace-wide
 * events; a project-scoped panel should only show that project's history.
 */
async function getRecentActivity({ projectIds }) {
  if (projectIds.length === 0) return [];

  const activities = await Activity.find({ projectId: { $in: projectIds } })
    .sort({ createdAt: -1 })
    .limit(ACTIVITY_LIMIT)
    .populate("userId", "name avatar")
    .lean();

  return activities.map((activity) => ({
    id: String(activity._id),
    action: activity.action,
    targetType: activity.targetType || "task",
    targetId: activity.targetId ? String(activity.targetId) : null,
    metadata: activity.metadata || {},
    createdAt: activity.createdAt || null,
    user: activity.userId
      ? {
          id: String(activity.userId._id),
          name: activity.userId.name || "Unknown user",
          avatar: activity.userId.avatar || null,
        }
      : null,
  }));
}

module.exports = {
  TERMINAL_STATUSES,
  PENDING_TASK_STATUSES,
  PENDING_DELIVERABLE_STATUSES,
  BLOCKED_STATUSES,
  getManagedProjects,
  getOverview,
  getPendingReviews,
  getWorkload,
  getOverdueTasks,
  getRecentActivity,
};

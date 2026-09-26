"use strict";

/**
 * Phase 21 — project manager dashboard.
 *
 * Thin by design, and gated the same way as every other route in the app: the
 * user comes from `req.user` (set by the shared `authenticate` middleware) and
 * is never read from the query or body, so a caller cannot ask for somebody
 * else's dashboard. The optional `projectId` is a *scope* selector, never an
 * identity selector, and it is checked against the managed scope before any
 * query is built from it.
 *
 * All figures come from `services/managerDashboard.service.js`. There is no
 * second definition of "manages a project" here: the scope is
 * `managedProjectScope`, the same gate the review routes enforce.
 */

const mongoose = require("mongoose");
const managerDashboardService = require("../services/managerDashboard.service");
const { managedProjectScope } = require("../services/project.service");

/** 403 for a user who manages nothing, and for a project they do not manage. */
const NOT_A_MANAGER = "You do not have manager access to any project";
const NOT_A_MANAGER_FOR_PROJECT =
  "You do not have manager access to the requested project";

/**
 * Run a section, degrading to `null` if it fails.
 *
 * The sections are independent reads, so one failing must not blank the page or
 * leave it loading forever: it reports `null` and the frontend shows an error
 * for that panel only. A failure of the *scope* is different — with no
 * trustworthy project set there is nothing to report on, so the request fails
 * outright through the shared error middleware.
 */
async function section(label, run) {
  try {
    return await run();
  } catch (error) {
    console.error(`[manager-dashboard] ${label} section failed:`, error.message);
    return null;
  }
}

/**
 * GET /api/me/manager-dashboard?projectId=<id>
 *
 * Without `projectId` the response covers every project the user manages and
 * includes the list of those projects for the selector. With it, every figure
 * and list is scoped to that one project.
 */
async function getManagerDashboard(req, res, next) {
  try {
    const requestedProjectId = req.query.projectId;

    // A non-ObjectId in the query is a client bug, not an authorisation
    // question, so it is a 400 rather than a 403 — and it is rejected before
    // any database call.
    if (
      requestedProjectId !== undefined &&
      (typeof requestedProjectId !== "string" || !mongoose.isValidObjectId(requestedProjectId))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid projectId",
      });
    }

    // The authenticated document is the whole input to the scope: the manager
    // check reads nothing from the request that a caller controls.
    const scope = await managedProjectScope(req.user);

    // The capability itself is the authorisation. Without it there is no
    // manager dashboard, and saying so plainly is more useful than an empty
    // page full of zeroes.
    if (scope.projects.length === 0) {
      return res.status(403).json({
        success: false,
        message: NOT_A_MANAGER,
        code: "NOT_PROJECT_MANAGER",
      });
    }

    const projectById = new Map(scope.projects.map((p) => [String(p._id), p]));

    // A project id outside the managed scope is refused with the same message
    // whether it exists or not. Distinguishing "no such project" from "not your
    // project" would let a caller probe for the existence of projects they
    // cannot see.
    if (requestedProjectId !== undefined && !projectById.has(requestedProjectId)) {
      return res.status(403).json({
        success: false,
        message: NOT_A_MANAGER_FOR_PROJECT,
        code: "NOT_PROJECT_MANAGER",
      });
    }

    const projectIds = requestedProjectId === undefined
      ? scope.projects.map((p) => p._id)
      : [projectById.get(requestedProjectId)._id];

    const [managedProjects, overview, pendingReviews, workload, overdue, activity] =
      await Promise.all([
        // Always the full managed list: the selector has to keep offering the
        // other projects after one has been chosen.
        section("managedProjects", () => managerDashboardService.getManagedProjects(scope)),
        section("overview", () => managerDashboardService.getOverview({ projectIds })),
        section("pendingReviews", () =>
          managerDashboardService.getPendingReviews({ projectIds, projectById })
        ),
        section("workload", () => managerDashboardService.getWorkload({ projectIds })),
        section("overdue", () =>
          managerDashboardService.getOverdueTasks({ projectIds, projectById })
        ),
        section("activity", () => managerDashboardService.getRecentActivity({ projectIds })),
      ]);

    const selectedProject = requestedProjectId === undefined
      ? null
      : {
          id: requestedProjectId,
          name: projectById.get(requestedProjectId).name || "Untitled project",
          status: projectById.get(requestedProjectId).status || "ACTIVE",
        };

    return res.json({
      success: true,
      managerDashboard: {
        user: {
          id: String(req.user._id),
          name: req.user.name || null,
          avatar: req.user.avatar || null,
        },
        // `scope: "all"` is explicit so the client never has to infer whether
        // it is looking at one project or all of them.
        scope: requestedProjectId === undefined ? "all" : "project",
        selectedProject,
        projects: managedProjects,
        overview,
        pendingReviews,
        workload,
        overdue,
        activity,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getManagerDashboard };

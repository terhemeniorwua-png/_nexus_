"use strict";

/**
 * Phase 20 — dashboard.
 *
 * Thin by design: the user comes from `req.user` (set by the existing
 * `authenticate` middleware) and is never read from the query or body, so a
 * caller cannot ask for somebody else's dashboard. Every figure is computed in
 * `services/dashboard.service.js` from the database.
 */

const dashboardService = require("../services/dashboard.service");

/**
 * Run a section, degrading to `null` if it fails.
 *
 * The two sections are independent reads, so one failing should not blank the
 * page or leave it loading forever. A section that fails reports `null` and
 * the frontend shows its own error state for that panel only; the rest of the
 * dashboard still renders. Genuine auth/DB-wiring failures still surface
 * through the shared error middleware, because those would fail every section
 * identically.
 *
 * Notifications are deliberately absent: the dashboard reuses the existing
 * `useNotifications` hook, which already owns the list, the unread count, live
 * `notification:new` updates and mark-as-read. Returning a second copy here
 * would be two sources of truth for the same data.
 */
async function section(label, run) {
  try {
    return await run();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[dashboard] ${label} section failed:`, error.message);
    return null;
  }
}

/**
 * GET /api/me/dashboard
 *
 * One request for the whole page.
 */
async function getDashboard(req, res, next) {
  try {
    const userId = req.user._id;

    const core = await section("stats", () => dashboardService.getDashboardStats({ userId }));

    // Recently viewed is filtered by the same project scope the stats used, so
    // it needs `core` to have resolved. If that section failed there is no
    // trustworthy scope to filter against, and reporting an unfiltered list
    // would be the wrong answer.
    const recentlyViewed = core
      ? await section("recentlyViewed", () =>
          dashboardService.getRecentlyViewed({
            userId,
            projectIds: core.projectIds,
            projectById: core.projectById,
          })
        )
      : null;

    res.json({
      success: true,
      dashboard: {
        user: {
          id: String(req.user._id),
          name: req.user.name || null,
          email: req.user.email || null,
          avatar: req.user.avatar || null,
        },
        stats: core ? core.stats : null,
        myTasks: core ? core.myTasks : null,
        recentlyViewed,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getDashboard };

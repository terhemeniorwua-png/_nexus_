"use strict";

/**
 * Phase 18 — deliverable socket events.
 *
 * Every deliverable transition (created, new version uploaded, submitted,
 * review started, approved, changes requested, draft edited) is broadcast to
 * the project room *after* the database write committed, using exactly the
 * safe serialization the REST API returns for the same aggregate — so the
 * socket payload can never carry more than the API would.
 *
 * Notifications are unaffected and keep working alongside this: a reviewer is
 * alerted through their private `user:<id>` room, while the project room gets
 * the project-wide state change. Neither replaces the other.
 */

const { toProject } = require("../sockets/emit");
const { SOCKET_EVENTS } = require("../sockets/events");
const {
  loadDeliverableBundle,
  serializeDeliverable,
} = require("./deliverable.service");
const User = require("../models/user.model");

/**
 * Broadcast the whole deliverable aggregate (deliverable + version history +
 * reviews) to the project room.
 *
 * @param {object} req         the request, used only for its resolved project
 * @param {object} task        the task the deliverable belongs to
 * @param {string} deliverableId
 * @param {number|null} versionNumber  the version the action touched
 */
async function publishDeliverableUpdate(req, task, deliverableId, versionNumber = null) {
  if (!req?.project || !deliverableId) return null;

  try {
    const bundle = await loadDeliverableBundle(deliverableId);
    const creator = await User.findById(bundle.deliverable.createdBy)
      .select("name")
      .lean();

    const payload = {
      deliverable: serializeDeliverable({
        deliverable: bundle.deliverable,
        versions: bundle.versions,
        reviews: bundle.reviews,
        creator,
        task,
      }),
      taskId: task ? String(task._id) : null,
      versionNumber,
    };

    toProject(req.project._id, SOCKET_EVENTS.DELIVERABLE_UPDATED, payload);
    return payload;
  } catch {
    // A broadcast is a courtesy on top of a successful write; a failure here
    // must not turn a 200 into a 500.
    return null;
  }
}

module.exports = { publishDeliverableUpdate };

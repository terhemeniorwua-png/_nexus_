"use strict";

const Deliverable = require("../models/deliverable.model");
const DeliverableVersion = require("../models/deliverableVersion.model");
const DeliverableReview = require("../models/deliverableReview.model");

/**
 * Phase 12 — cascade a task's deliverable aggregate away with the task.
 *
 * Reviews and versions are separate collections, so deleting a deliverable
 * without this would orphan the audit trail. Shared by the task controller and
 * the board controller, which both implement task deletion.
 */
async function deleteTaskDeliverables(taskId) {
  const deliverableIds = await Deliverable.find({ taskId }).distinct("_id");
  if (deliverableIds.length === 0) return { deliverables: 0, versions: 0, reviews: 0 };

  const versions = await DeliverableVersion.countDocuments({ deliverableId: { $in: deliverableIds } });
  const reviews = await DeliverableReview.deleteMany({ deliverableId: { $in: deliverableIds } });
  await DeliverableVersion.deleteMany({ deliverableId: { $in: deliverableIds } });
  await Deliverable.deleteMany({ _id: { $in: deliverableIds } });

  return { deliverables: deliverableIds.length, versions, reviews: reviews.deletedCount || 0 };
}

module.exports = { deleteTaskDeliverables };

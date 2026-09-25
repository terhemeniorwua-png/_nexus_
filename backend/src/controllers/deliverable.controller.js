"use strict";

/**
 * Phase 12 — Deliverable HTTP layer.
 *
 * Thin by design: authenticate, read params/body, call the service, serialize.
 * Every state rule, permission nuance and write lives in the service or the
 * middleware, so the routes below read like the workflow diagram.
 */

const Task = require("../models/task.model");
const Deliverable = require("../models/deliverable.model");
const DeliverableVersion = require("../models/deliverableVersion.model");
const DeliverableReview = require("../models/deliverableReview.model");
const User = require("../models/user.model");
const { ApiError } = require("../middleware/errorHandler");
const {
  createDeliverableForTask,
  createNextVersion,
  decide,
  deliverableLink,
  loadDeliverableBundle,
  loadTaskDeliverable,
  notifyReviewerPending,
  notifySubmitter,
  recordDeliverableActivity,
  serializeDeliverable,
  serializeReview,
  serializeVersion,
  startReview,
  submitVersion,
  updateDraftVersion,
} = require("../services/deliverable.service");
const { publishTaskUpdate } = require("../services/taskEvents.service");
const { openStoredFile } = require("../services/storage.service");

function wantsSubmit(req) {
  const raw = req.body?.submit ?? req.query?.submit;
  return raw === true || raw === "true" || raw === "1" || raw === 1;
}

/**
 * The single response shape for the whole aggregate: the deliverable, its full
 * version history, and — when the request acted on one version — that version
 * at the top level, so the caller never has to diff two lists to find out what
 * just changed.
 */
async function deliverablePayload({ deliverable, versions, reviews, task, version = null }) {
  const creator = await User.findById(deliverable.createdBy).select("name");
  return {
    success: true,
    deliverable: serializeDeliverable({
      deliverable,
      versions,
      reviews,
      creator,
      task,
    }),
    versions: versions.map((v) => serializeVersion(v, { reviews })),
    version: version ? serializeVersion(version, { reviews }) : null,
    task: task ? { id: String(task._id), status: task.status, title: task.title } : null,
  };
}

// ---------------------------------------------------------------------------
// Task-scoped: the deliverable of one task
// ---------------------------------------------------------------------------

/** POST /api/tasks/:taskId/deliverables — create the deliverable + v1. */
async function createDeliverable(req, res, next) {
  try {
    const { deliverable, version } = await createDeliverableForTask({
      task: req.task,
      project: req.project,
      user: req.user,
      projectRole: req.projectRole,
      file: req.file,
      title: req.body?.title,
      description: req.body?.description,
      submit: wantsSubmit(req),
    });

    await recordDeliverableActivity({
      project: req.project,
      task: req.task,
      user: req.user,
      action: "DELIVERABLE_CREATED",
      deliverable,
      version,
    });

    if (wantsSubmit(req)) {
      await recordDeliverableActivity({
        project: req.project,
        task: req.task,
        user: req.user,
        action: "DELIVERABLE_SUBMITTED",
        deliverable,
        version,
      });
      await notifyReviewerPending({ project: req.project, task: req.task, version, user: req.user });
      await publishTaskUpdate(req, req.task);
    }

    const bundle = await loadDeliverableBundle(deliverable._id);
    return res.status(201).json(await deliverablePayload({ ...bundle, task: req.task, version }));
  } catch (error) {
    next(error);
  }
}

/** GET /api/tasks/:taskId/deliverable — the task's deliverable or null. */
async function getTaskDeliverable(req, res, next) {
  try {
    const bundle = await loadTaskDeliverable(req.task._id);
    if (!bundle) {
      return res.json({ success: true, deliverable: null, versions: [] });
    }
    return res.json(await deliverablePayload({ ...bundle, task: req.task }));
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Deliverable-scoped
// ---------------------------------------------------------------------------

/** GET /api/deliverables/:deliverableId — aggregate + full history. */
async function getDeliverable(req, res, next) {
  try {
    const bundle = await loadDeliverableBundle(req.deliverable._id);
    return res.json(await deliverablePayload({ ...bundle, task: req.task }));
  } catch (error) {
    next(error);
  }
}

/** GET /api/deliverables/:deliverableId/versions — chronological history. */
async function listVersions(req, res, next) {
  try {
    const { versions, reviews } = await loadDeliverableBundle(req.deliverable._id);
    return res.json({
      success: true,
      deliverableId: String(req.deliverable._id),
      currentVersion: req.deliverable.currentVersion,
      approvedVersion: req.deliverable.approvedVersion,
      versions: serializeDeliverable({
        deliverable: req.deliverable,
        versions,
        reviews,
        task: req.task,
      }).versions,
      reviews: reviews.map(serializeReview),
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/deliverables/:deliverableId/versions/:versionNumber — one version. */
async function getVersion(req, res, next) {
  try {
    const reviews = await DeliverableReview.find({ deliverableVersionId: req.version._id }).sort({
      reviewedAt: 1,
    });
    return res.json({
      success: true,
      version: serializeDeliverable({
        deliverable: req.deliverable,
        versions: [req.version],
        reviews,
        task: req.task,
      }).versions[0],
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/deliverables/:deliverableId/versions — next version after changes. */
async function createVersion(req, res, next) {
  try {
    const version = await createNextVersion({
      deliverable: req.deliverable,
      task: req.task,
      project: req.project,
      user: req.user,
      projectRole: req.projectRole,
      file: req.file,
      description: req.body?.description,
    });

    // The service already moved the deliverable back to DRAFT and the task
    // back into the work states, atomically (§32).
    await recordDeliverableActivity({
      project: req.project,
      task: req.task,
      user: req.user,
      action: "DELIVERABLE_VERSION_CREATED",
      deliverable: req.deliverable,
      version,
    });
    await publishTaskUpdate(req, req.task);

    const bundle = await loadDeliverableBundle(req.deliverable._id);
    return res.status(201).json(await deliverablePayload({ ...bundle, task: req.task, version }));
  } catch (error) {
    next(error);
  }
}

/** PATCH .../versions/:versionNumber — edit a draft description. */
async function patchVersion(req, res, next) {
  try {
    const version = await updateDraftVersion({
      version: req.version,
      deliverable: req.deliverable,
      user: req.user,
      data: req.body || {},
    });

    const bundle = await loadDeliverableBundle(req.deliverable._id);
    return res.status(200).json({
      success: true,
      version: bundle.versions
        .filter((v) => String(v._id) === String(version._id))
        .map((v) => serializeVersion(v, { reviews: bundle.reviews }))[0],
      deliverable: serializeDeliverable({
        deliverable: bundle.deliverable,
        versions: bundle.versions,
        reviews: bundle.reviews,
        task: req.task,
      }),
    });
  } catch (error) {
    next(error);
  }
}

/** PATCH .../versions/:versionNumber/submit — DRAFT → SUBMITTED. */
async function submitVersionHandler(req, res, next) {
  try {
    await submitVersion({
      deliverable: req.deliverable,
      version: req.version,
      task: req.task,
      project: req.project,
      user: req.user,
      projectRole: req.projectRole,
    });

    await recordDeliverableActivity({
      project: req.project,
      task: req.task,
      user: req.user,
      action: "DELIVERABLE_SUBMITTED",
      deliverable: req.deliverable,
      version: req.version,
    });
    await notifyReviewerPending({ project: req.project, task: req.task, version: req.version, user: req.user });
    await publishTaskUpdate(req, req.task);

    const bundle = await loadDeliverableBundle(req.deliverable._id);
    return res.json(await deliverablePayload({ ...bundle, task: req.task, version: req.version }));
  } catch (error) {
    next(error);
  }
}

/** PATCH .../versions/:versionNumber/review — SUBMITTED → UNDER_REVIEW. */
async function startReviewHandler(req, res, next) {
  try {
    await startReview({
      deliverable: req.deliverable,
      version: req.version,
      task: req.task,
      project: req.project,
      user: req.user,
      projectRole: req.projectRole,
    });

    await recordDeliverableActivity({
      project: req.project,
      task: req.task,
      user: req.user,
      action: "DELIVERABLE_REVIEW_STARTED",
      deliverable: req.deliverable,
      version: req.version,
    });
    await publishTaskUpdate(req, req.task);

    const bundle = await loadDeliverableBundle(req.deliverable._id);
    return res.json(await deliverablePayload({ ...bundle, task: req.task, version: req.version }));
  } catch (error) {
    next(error);
  }
}

async function handleDecision(req, res, next, decision) {
  try {
    const result = await decide({
      deliverable: req.deliverable,
      version: req.version,
      task: req.task,
      project: req.project,
      user: req.user,
      projectRole: req.projectRole,
      decision,
      feedback: req.body?.feedback,
    });

    await recordDeliverableActivity({
      project: req.project,
      task: req.task,
      user: req.user,
      action: decision === "APPROVED" ? "DELIVERABLE_APPROVED" : "DELIVERABLE_CHANGES_REQUESTED",
      deliverable: result.deliverable,
      version: result.version,
      metadata: { feedback: result.review.feedback },
    });
    await notifySubmitter({
      project: req.project,
      task: req.task,
      user: req.user,
      version: result.version,
      decision,
      feedback: result.review.feedback,
    });
    await publishTaskUpdate(req, req.task);

    const bundle = await loadDeliverableBundle(req.deliverable._id);
    return res.json({
      ...(await deliverablePayload({
        ...bundle,
        task: req.task,
        version: result.version,
      })),
      decision,
      review: serializeReview(result.review),
    });
  } catch (error) {
    next(error);
  }
}

const approveVersion = (req, res, next) => handleDecision(req, res, next, "APPROVED");
const requestChanges = (req, res, next) => handleDecision(req, res, next, "CHANGES_REQUESTED");

/**
 * GET .../versions/:versionNumber/download — stream the stored file.
 * Authorization has already happened in `deliverableAccess`; this only reads
 * the file and streams it with a sanitized filename (§46).
 */
async function downloadVersion(req, res, next) {
  try {
    const file = await openStoredFile(req.version.storageKey);

    res.setHeader("Content-Type", req.version.mimeType);
    res.setHeader("Content-Length", String(file.size));
    res.setHeader("Content-Disposition", `attachment; filename="${req.version.fileName}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");

    file.stream.on("error", () => next(new ApiError(500, "Could not read the file")));
    file.stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Project-scoped list (kept from the earlier deliverable phase)
// ---------------------------------------------------------------------------

/**
 * GET /api/workspaces/:workspaceId/projects/:projectId/deliverables — every
 * deliverable in the project with its latest version. One query for the
 * deliverables, one for the versions they point at (§56).
 */
async function listProjectDeliverables(req, res, next) {
  try {
    const taskIds = await Task.find({ projectId: req.project._id }).distinct("_id");
    if (!taskIds.length) return res.json({ success: true, count: 0, deliverables: [] });

    const deliverables = await Deliverable.find({ taskId: { $in: taskIds } })
      .sort({ updatedAt: -1 })
      .populate("createdBy", "name");

    const currentIds = deliverables.map((d) => d._id);
    const versions = await DeliverableVersion.find({ deliverableId: { $in: currentIds } }).sort({
      versionNumber: 1,
    });

    const byDeliverable = new Map();
    for (const version of versions) {
      const key = String(version.deliverableId);
      if (!byDeliverable.has(key)) byDeliverable.set(key, []);
      byDeliverable.get(key).push(version);
    }

    return res.json({
      success: true,
      count: deliverables.length,
      deliverables: deliverables.map((d) => {
        const own = byDeliverable.get(String(d._id)) || [];
        return serializeDeliverable({
          deliverable: d,
          versions: own,
          reviews: [],
          creator: d.createdBy && d.createdBy.name ? d.createdBy : null,
        });
      }),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  approveVersion,
  createDeliverable,
  createVersion,
  downloadVersion,
  getDeliverable,
  getTaskDeliverable,
  getVersion,
  listProjectDeliverables,
  listVersions,
  patchVersion,
  requestChanges,
  startReviewHandler,
  submitVersionHandler,
};

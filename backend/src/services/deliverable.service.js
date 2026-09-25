"use strict";

/**
 * Phase 12 — Deliverable and review system.
 *
 * The whole submission lifecycle lives here, deliberately separate from the
 * HTTP layer and from storage (Controller → this service → storage service).
 * The service owns:
 *
 *   - version numbering (server-computed, never accepted from the client)
 *   - the version/deliverable state machine
 *   - the task-status mirror (through Phase 10's transitionTaskStatus, never
 *     a second copy of the workflow rules)
 *   - all-or-nothing writes (runAtomically)
 *   - activity + notification side effects
 *
 * Nothing here trusts the client: not the version number, not the file type,
 * not the status to move to, and not the idea that the caller may review
 * their own work.
 */

const mongoose = require("mongoose");
const Task = require("../models/task.model");
const Deliverable = require("../models/deliverable.model");
const DeliverableVersion = require("../models/deliverableVersion.model");
const DeliverableReview = require("../models/deliverableReview.model");
const User = require("../models/user.model");
const { ApiError } = require("../middleware/errorHandler");
const { hasProjectPermission } = require("../permissions/permissions");
const { transitionTaskStatus, DELIVERABLE_COMPATIBLE_STATUSES } = require("./task.service");
const { assertSubtasksCompleteForApproval } = require("./progress.service");
const { recordActivity } = require("./activity.service");
const { createNotification } = require("./notification.service");
const { runAtomically } = require("./unitOfWork.service");
const storage = require("./storage.service");

/**
 * Version-level transitions (§31). Deliberately not a free-form map: a
 * version cannot jump DRAFT → APPROVED, and nothing moves backwards out of a
 * decided state.
 */
const VERSION_TRANSITIONS = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "CHANGES_REQUESTED"],
  CHANGES_REQUESTED: [],
  APPROVED: [],
};

/** The task status each deliverable state implies (§32). */
const TASK_STATUS_FOR_DELIVERABLE = {
  DRAFT: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  APPROVED: "APPROVED",
};

const REVIEWER_PERMISSION = {
  UNDER_REVIEW: "review_deliverable",
  APPROVED: "approve_deliverable",
  CHANGES_REQUESTED: "request_deliverable_changes",
};

function assertObjectId(value, message) {
  if (!value || !mongoose.isValidObjectId(String(value))) {
    throw new ApiError(404, message);
  }
}

function assertVersionTransition(fromStatus, toStatus) {
  const allowed = VERSION_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new ApiError(400, `Invalid deliverable transition ${fromStatus} → ${toStatus}`);
  }
}

/** Minimum feedback length for a change request (§25). */
const MIN_FEEDBACK_LENGTH = 10;

function assertFeedbackPresent(feedback) {
  const text = String(feedback || "").trim();
  if (text.length < MIN_FEEDBACK_LENGTH) {
    throw new ApiError(
      400,
      `Explain what needs changing (at least ${MIN_FEEDBACK_LENGTH} characters) so the submitter knows what to fix`
    );
  }
  return text;
}

/**
 * Nobody reviews their own work (§38). Deliberately unconditional: there is no
 * role today whose whole job is approving its own output, and an admin
 * bypass would be exactly the hole this rule exists to close.
 */
function assertNotSelfReview({ version, user }) {
  if (version.submittedBy && String(version.submittedBy) === String(user._id)) {
    throw new ApiError(403, "You cannot review your own submission — ask another reviewer");
  }
}

/**
 * Only the person working the task (or someone who manages it) may submit
 * work for it (§36). Mirrors the task-ownership rule from Phase 10.
 */
function assertMaySubmitForTask({ task, user, projectRole }) {
  if (hasProjectPermission(projectRole, "assign_task")) return;
  const isAssignee = task.assignedTo && String(task.assignedTo) === String(user._id);
  const isCreator = task.createdBy && String(task.createdBy) === String(user._id);
  if (!isAssignee && !isCreator) {
    throw new ApiError(403, "You can only submit deliverables for tasks assigned to you");
  }
}

function assertReviewerPermission({ action, projectRole }) {
  const permission = REVIEWER_PERMISSION[action];
  if (!permission || !hasProjectPermission(projectRole, permission)) {
    throw new ApiError(403, "You do not have permission to review this deliverable");
  }
}

function taskLink({ project, task }) {
  return `/projects/${String(project._id)}/tasks/${String(task._id)}`;
}

function deliverableLink({ project, task }) {
  return `${taskLink({ project, task })}#deliverable`;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializeVersion(version, { current = false, reviews = [] } = {}) {
  const raw = version.toJSON ? version.toJSON() : version;
  const submitter = raw.submittedBy && typeof raw.submittedBy === "object" ? raw.submittedBy : null;
  const versionReviews = reviews
    .filter((r) => String(r.deliverableVersionId || r._id) === String(raw._id || raw.id))
    .map((r) => serializeReview(r));

  return {
    id: String(raw._id || raw.id),
    versionNumber: raw.versionNumber,
    status: raw.status,
    description: raw.description || "",
    fileName: raw.fileName,
    fileSize: raw.fileSize,
    mimeType: raw.mimeType,
    checksum: raw.checksum || "",
    fileUrl: raw.fileUrl,
    downloadUrl: `/api/deliverables/${String(raw.deliverableId)}/versions/${raw.versionNumber}/download`,
    submittedBy: submitter
      ? { id: String(submitter._id || submitter.id), name: submitter.name }
      : raw.submittedBy
        ? { id: String(raw.submittedBy), name: null }
        : null,
    submittedAt: raw.submittedAt || null,
    reviewedAt: raw.reviewedAt || null,
    createdAt: raw.createdAt || null,
    isCurrent: current,
    isApproved: raw.status === "APPROVED",
    reviews: versionReviews,
  };
}

function serializeReview(review) {
  const raw = review.toJSON ? review.toJSON() : review;
  const reviewer = raw.reviewerId && typeof raw.reviewerId === "object" ? raw.reviewerId : null;
  return {
    id: String(raw._id || raw.id),
    versionId: String(raw.deliverableVersionId || ""),
    versionNumber: raw.versionNumber,
    decision: raw.decision,
    feedback: raw.feedback || "",
    reviewedAt: raw.reviewedAt || raw.createdAt || null,
    reviewer: reviewer
      ? { id: String(reviewer._id || reviewer.id), name: reviewer.name }
      : raw.reviewerId
        ? { id: String(raw.reviewerId), name: null }
        : null,
  };
}

function serializeDeliverable({ deliverable, versions = [], reviews = [], creator = null, task = null, permissions = {} }) {
  const raw = deliverable.toJSON ? deliverable.toJSON() : deliverable;
  const ordered = [...versions].sort((a, b) => (a.versionNumber || 0) - (b.versionNumber || 0));
  const current = ordered.find((v) => v.versionNumber === raw.currentVersion) || null;
  const approved = ordered.find((v) => v.versionNumber === raw.approvedVersion) || null;

  return {
    id: String(raw._id || raw.id),
    taskId: String(raw.taskId),
    projectId: String(raw.projectId),
    title: raw.title,
    status: raw.status,
    currentVersion: raw.currentVersion,
    approvedVersion: raw.approvedVersion,
    versionCount: ordered.length,
    createdBy: creator
      ? { id: String(creator._id || creator.id), name: creator.name }
      : raw.createdBy
        ? { id: String(raw.createdBy), name: null }
        : null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
    taskTitle: task ? task.title : undefined,
    currentVersionData: current ? serializeVersion(current, { current: true, reviews }) : null,
    approvedVersionData: approved ? serializeVersion(approved, { reviews }) : null,
    versions: ordered.map((v) =>
      serializeVersion(v, { current: v.versionNumber === raw.currentVersion, reviews })
    ),
  };
}

/**
 * Load a deliverable with its full audit trail in three queries — no N+1
 * when a project lists twenty deliverables (§56).
 */
async function loadDeliverableBundle(deliverableId, { session = null } = {}) {
  assertObjectId(deliverableId, "Deliverable not found");

  const deliverable = await Deliverable.findById(deliverableId, null, session ? { session } : {});
  if (!deliverable) throw new ApiError(404, "Deliverable not found");

  const [versions, reviews] = await Promise.all([
    DeliverableVersion.find({ deliverableId: deliverable._id }, null, session ? { session } : {}).sort({
      versionNumber: 1,
    }),
    DeliverableReview.find({ deliverableId: deliverable._id }, null, session ? { session } : {}).sort({
      reviewedAt: 1,
    }),
  ]);

  return { deliverable, versions, reviews };
}

async function loadReviewers(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } }).select("name avatar").lean();
  return new Map(users.map((u) => [String(u._id), u]));
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Create the task's single primary deliverable with version 1 (§6, §17).
 * A task may only ever have one, so this is the only place a deliverable row
 * is born; later rounds add versions to the same aggregate (§28).
 */
async function createDeliverableForTask({
  task,
  project,
  user,
  projectRole,
  file,
  title,
  description,
  submit = false,
  session = null,
}) {
  assertMaySubmitForTask({ task, user, projectRole });

  const existing = await Deliverable.findOne({ taskId: task._id });
  if (existing) {
    throw new ApiError(
      409,
      "This task already has a deliverable — upload a new version instead"
    );
  }

  // The attachment is validated before anything else: if the upload is empty,
  // of a disallowed type, oversized or not what it claims to be, that is the
  // fact the caller needs, not a complaint about their title.
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new ApiError(400, "A file is required — attach the work you are submitting");
  }
  storage.validateUpload(file);

  // The title is optional: the file name is a perfectly good label, and
  // forcing the submitter to invent one adds nothing. An explicit title wins.
  const explicitTitle = String(title || "").trim();
  if (explicitTitle.length > 200) throw new ApiError(400, "Title cannot exceed 200 characters");

  const cleanDescription = String(description || "").trim();
  if (cleanDescription.length > 5000) {
    throw new ApiError(400, "Description cannot exceed 5000 characters");
  }

  // The version number is decided here, by the server, before the file is
  // written, so the storage key can embed it (§8).
  const versionNumber = 1;
  const cleanTitle = explicitTitle || storage.sanitizeFileName(file.originalname);

  let deliverable;
  try {
    deliverable = await Deliverable.create(
      [
        {
          taskId: task._id,
          workspaceId: project.workspaceId,
          projectId: project._id,
          createdBy: user._id,
          title: cleanTitle,
          status: "DRAFT",
          currentVersion: versionNumber,
        },
      ],
      session ? { session } : {}
    ).then((docs) => docs[0]);
  } catch (error) {
    if (error && error.code === 11000) {
      throw new ApiError(409, "This task already has a deliverable — upload a new version instead");
    }
    throw error;
  }

  // From here on the deliverable row exists, so every failure has to undo the
  // part that already landed — otherwise a rejected upload leaves a
  // deliverable the task is not supposed to have.
  let upload = null;
  try {
    upload = await storage.saveUpload(file, {
      workspaceId: project.workspaceId,
      projectId: project._id,
      deliverableId: deliverable._id,
      versionNumber,
    });

    const version = await DeliverableVersion.create(
      [
        {
          deliverableId: deliverable._id,
          versionNumber,
          status: "DRAFT",
          description: cleanDescription,
          fileName: upload.fileName,
          storageKey: upload.storageKey,
          fileUrl: upload.fileUrl,
          fileSize: upload.fileSize,
          mimeType: upload.mimeType,
          checksum: upload.checksum,
        },
      ],
      session ? { session } : {}
    ).then((docs) => docs[0]);

    if (submit) {
      await submitVersionInternal({ deliverable, version, task, project, user, projectRole, session });
    }

    return { deliverable, version };
  } catch (error) {
    if (upload) await storage.removeStoredFile(upload.storageKey);
    if (session) {
      // A transaction will discard these writes with the session.
      throw error;
    }
    await DeliverableVersion.deleteMany({ deliverableId: deliverable._id });
    await Deliverable.deleteOne({ _id: deliverable._id });
    throw error;
  }
}

/**
 * Create the next version of an existing deliverable (§28, §29). Allowed only
 * after changes were requested — an approved deliverable is final, and a
 * draft in flight is already the current version.
 */
async function createNextVersion({
  deliverable,
  task,
  project,
  user,
  projectRole,
  file,
  description,
}) {
  // Ownership before state, like every other transition here: a caller who
  // may not submit should not be able to probe the deliverable's status.
  assertMaySubmitForTask({ task, user, projectRole });

  if (deliverable.status === "APPROVED") {
    throw new ApiError(400, "This deliverable is approved — approved work is final");
  }
  if (deliverable.status !== "CHANGES_REQUESTED") {
    throw new ApiError(
      400,
      "A new version can only be created after changes have been requested"
    );
  }

  const cleanDescription = String(description || "").trim();
  if (cleanDescription.length > 5000) {
    throw new ApiError(400, "Description cannot exceed 5000 characters");
  }

  // Server-computed next number: highest existing + 1. The unique index on
  // (deliverableId, versionNumber) turns a concurrent double-submit into a
  // 409 rather than two v2s (§30).
  const latest = await DeliverableVersion.findOne({ deliverableId: deliverable._id })
    .sort({ versionNumber: -1 })
    .select("versionNumber");
  const versionNumber = (latest ? latest.versionNumber : 0) + 1;

  const upload = await storage.saveUpload(file, {
    workspaceId: project.workspaceId,
    projectId: project._id,
    deliverableId: deliverable._id,
    versionNumber,
  });

  let version;
  try {
    version = await DeliverableVersion.create({
      deliverableId: deliverable._id,
      versionNumber,
      status: "DRAFT",
      description: cleanDescription,
      fileName: upload.fileName,
      storageKey: upload.storageKey,
      fileUrl: upload.fileUrl,
      fileSize: upload.fileSize,
      mimeType: upload.mimeType,
      checksum: upload.checksum,
    });
  } catch (error) {
    await storage.removeStoredFile(upload.storageKey);
    if (error && error.code === 11000) {
      throw new ApiError(409, "A newer version already exists — reload and try again");
    }
    throw error;
  }

  // The new draft becomes the current version and the deliverable returns to
  // DRAFT, with the task following it back into the work states — all three
  // or none (§32, §34).
  const previousVersion = deliverable.currentVersion;
  const previousStatus = deliverable.status;
  const previousTaskStatus = task.status;

  return runAtomically(async ({ session, registerUndo }) => {
    deliverable.currentVersion = versionNumber;
    deliverable.status = "DRAFT";
    if (session) await deliverable.save({ session });
    else await deliverable.save();

    if (registerUndo) {
      registerUndo(async () => {
        deliverable.currentVersion = previousVersion;
        deliverable.status = previousStatus;
        await deliverable.save();
        await DeliverableVersion.deleteOne({ _id: version._id });
        task.status = previousTaskStatus;
        await task.save();
      });
    }

    await syncTaskForNewVersion({ deliverable, version, task, user, projectRole, session });

    return version;
  });
}

/** Draft versions are editable; everything else is frozen (§12). */
async function updateDraftVersion({ version, deliverable, user, data }) {
  if (version.status !== "DRAFT") {
    throw new ApiError(400, "Only a draft version can be edited — upload a new version instead");
  }
  if (String(deliverable.createdBy) !== String(user._id)) {
    throw new ApiError(403, "You can only edit your own draft");
  }

  if (data.description !== undefined) {
    const text = String(data.description).trim();
    if (text.length > 5000) throw new ApiError(400, "Description cannot exceed 5000 characters");
    version.description = text;
  }

  await version.save();
  return version;
}

// ---------------------------------------------------------------------------
// Version transitions + task mirror
// ---------------------------------------------------------------------------

async function submitVersionInternal({ deliverable, version, task, project, user, projectRole, session = null }) {
  // Authorization before state: a caller who may not submit should not learn
  // the version's current status from the state machine's error message.
  if (String(task.assignedTo || "") !== String(user._id) && !hasProjectPermission(projectRole, "assign_task")) {
    throw new ApiError(403, "Only the assigned member can submit this work");
  }
  assertVersionTransition(version.status, "SUBMITTED");
  if (task.status !== "IN_PROGRESS") {
    throw new ApiError(
      400,
      task.status === "ASSIGNED"
        ? "Start the task before submitting a deliverable"
        : `The task is ${task.status}, so this deliverable cannot be submitted yet`
    );
  }

  const previousStatus = version.status;
  version.status = "SUBMITTED";
  version.submittedBy = user._id;
  version.submittedAt = new Date();
  if (session) await version.save({ session });
  else await version.save();

  const previousDeliverableStatus = deliverable.status;
  deliverable.status = "SUBMITTED";
  if (session) await deliverable.save({ session });
  else await deliverable.save();

  const previousTaskStatus = task.status;
  try {
    await transitionTaskStatus({
      task,
      toStatus: "SUBMITTED",
      user,
      projectRole,
      session,
      deliverable,
      source: "deliverable",
    });
  } catch (error) {
    version.status = previousStatus;
    deliverable.status = previousDeliverableStatus;
    task.status = previousTaskStatus;
    if (session) {
      await version.save({ session });
      await deliverable.save({ session });
      await task.save({ session });
    }
    throw error;
  }

  return { version, deliverable, task };
}

async function submitVersion(args) {
  return runAtomically(async ({ registerUndo }) => {
    const result = await submitVersionInternal(args);
    if (registerUndo) {
      registerUndo(async () => {
        result.version.status = "DRAFT";
        result.version.submittedBy = null;
        result.version.submittedAt = null;
        await result.version.save();
        result.deliverable.status = "DRAFT";
        await result.deliverable.save();
        result.task.status = "IN_PROGRESS";
        await result.task.save();
      });
    }
    return result;
  });
}

async function startReview({ deliverable, version, task, project, user, projectRole }) {
  assertReviewerPermission({ action: "UNDER_REVIEW", projectRole });
  assertNotSelfReview({ version, user });
  assertVersionTransition(version.status, "UNDER_REVIEW");

  if (task.status !== "SUBMITTED") {
    throw new ApiError(
      400,
      `The task is ${task.status}, so this deliverable cannot enter review yet`
    );
  }

  const previousVersionStatus = version.status;
  const previousDeliverableStatus = deliverable.status;
  const previousTaskStatus = task.status;

  return runAtomically(async ({ session: txSession, registerUndo }) => {
    version.status = "UNDER_REVIEW";
    deliverable.status = "UNDER_REVIEW";
    if (txSession) await version.save({ txSession });
    else await version.save();
    if (txSession) await deliverable.save({ txSession });
    else await deliverable.save();

    if (registerUndo) {
      registerUndo(async () => {
        version.status = previousVersionStatus;
        deliverable.status = previousDeliverableStatus;
        task.status = previousTaskStatus;
        await version.save();
        await deliverable.save();
        await task.save();
      });
    }

    await transitionTaskStatus({
      task,
      toStatus: "UNDER_REVIEW",
      user,
      projectRole,
      session: txSession,
      deliverable,
      source: "deliverable",
    });

    return { version, deliverable, task };
  });
}

/**
 * The shared decision path for APPROVED and CHANGES_REQUESTED. Both write a
 * review record, flip the version, flip the deliverable, and move the task —
 * atomically, so a partial failure cannot leave a version approved while the
 * task sits in review (§33, §34, §54).
 */
async function decide({ deliverable, version, task, project, user, projectRole, decision, feedback }) {
  const target = decision === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED";
  // Authorization and self-review before state, for the same reason as
  // submitVersionInternal: no state disclosure to callers who may not act.
  assertReviewerPermission({ action: target, projectRole });
  assertNotSelfReview({ version, user });
  assertVersionTransition(version.status, target);

  const cleanFeedback =
    target === "CHANGES_REQUESTED" ? assertFeedbackPresent(feedback) : String(feedback || "").trim();
  if (cleanFeedback.length > 5000) {
    throw new ApiError(400, "Feedback cannot exceed 5000 characters");
  }

  if (target === "APPROVED") {
    // Phase 11's invariant applies through this door too: a task may not be
    // APPROVED while its checklist is open, so an unfinished task cannot be
    // signed off just by approving its file.
    assertSubtasksCompleteForApproval(task);
    if (task.status !== "UNDER_REVIEW") {
      throw new ApiError(400, `The task is ${task.status}, so this deliverable cannot be approved yet`);
    }
  }

  return runAtomically(async ({ session, registerUndo }) => {
    const previousVersionStatus = version.status;
    const previousDeliverableStatus = deliverable.status;
    const previousApprovedVersion = deliverable.approvedVersion;
    const previousTaskStatus = task.status;
    const now = new Date();

    // Compare-and-set on the version status: if a concurrent reviewer already
    // decided this version, this update matches nothing and we bail out
    // instead of double-writing.
    const claimed = await DeliverableVersion.findOneAndUpdate(
      { _id: version._id, status: previousVersionStatus },
      { $set: { status: target, reviewedAt: now } },
      session ? { session, new: true } : { new: true }
    );
    if (!claimed) {
      throw new ApiError(409, "This version was already reviewed — reload to see the decision");
    }

    // Register the undo immediately after each write, so a failure in the
    // *next* step still unwinds the ones already applied. Registering it at
    // the end (the obvious way to write this) leaves a half-applied approval
    // behind when the task update is what fails.
    if (registerUndo) {
      registerUndo(async () => {
        await DeliverableVersion.updateOne(
          { _id: version._id },
          { $set: { status: previousVersionStatus, reviewedAt: version.reviewedAt || null } }
        );
      });
    }

    // Array form: `create(doc, {})` is read by Mongoose as a second document,
    // not as options, and then validation fails on the empty one.
    const review = await DeliverableReview.create(
      [
        {
          deliverableId: deliverable._id,
          deliverableVersionId: version._id,
          versionNumber: version.versionNumber,
          reviewerId: user._id,
          decision,
          feedback: cleanFeedback,
          reviewedAt: now,
        },
      ],
      session ? { session } : {}
    ).then((docs) => docs[0]);

    if (registerUndo) {
      registerUndo(async () => {
        await DeliverableReview.deleteOne({ _id: review._id });
      });
    }

    deliverable.status = target;
    if (target === "APPROVED") {
      deliverable.approvedVersion = version.versionNumber;
    }
    if (session) await deliverable.save({ session });
    else await deliverable.save();

    if (registerUndo) {
      registerUndo(async () => {
        deliverable.status = previousDeliverableStatus;
        deliverable.approvedVersion = previousApprovedVersion;
        await deliverable.save();
      });
    }

    await transitionTaskStatus({
      task,
      toStatus: TASK_STATUS_FOR_DELIVERABLE[target],
      user,
      projectRole,
      session,
      deliverable,
      source: "deliverable",
      requireCompleteSubtasks: target === "APPROVED",
    });

    if (registerUndo) {
      registerUndo(async () => {
        task.status = previousTaskStatus;
        await task.save();
      });
    }

    return { version: claimed, review, deliverable, task };
  });
}

/**
 * A new version means the submitter is back in the work states. This is the
 * only place the task returns to IN_PROGRESS automatically (§32).
 */
async function syncTaskForNewVersion({ deliverable, version, task, user, projectRole, session = null }) {
  if (task.status !== "CHANGES_REQUESTED") return;
  await transitionTaskStatus({
    task,
    toStatus: "IN_PROGRESS",
    user,
    projectRole,
    session,
    deliverable,
    source: "deliverable",
  });
}

// ---------------------------------------------------------------------------
// Side effects
// ---------------------------------------------------------------------------

/**
 * Activity + notification hooks. Kept out of the transactional core on
 * purpose: an audit entry that fails must never roll back a legitimate
 * approval, and the existing services already swallow/log their own errors
 * (§50, §51). The future notification channel hooks in here, not into the
 * state machine.
 */

async function recordDeliverableActivity({ project, task, user, action, deliverable, version, metadata = {} }) {
  return recordActivity({
    workspaceId: project.workspaceId,
    projectId: project._id,
    userId: user._id,
    action,
    targetType: version ? "deliverable" : "task",
    targetId: version ? version._id : task._id,
    metadata: {
      deliverableId: String(deliverable._id),
      taskId: String(task._id),
      taskTitle: task.title,
      projectName: project.name,
      versionNumber: version ? version.versionNumber : undefined,
      ...metadata,
    },
  });
}

/** Tell the submitter what the reviewer decided — unless they reviewed it (impossible, but cheap). */
async function notifySubmitter({ project, task, user, version, decision, feedback }) {
  const submitterId = version && version.submittedBy;
  if (!submitterId) return;
  if (String(submitterId) === String(user._id)) return;

  const approved = decision === "APPROVED";
  await createNotification({
    userId: submitterId,
    actorId: user._id,
    workspaceId: project.workspaceId,
    type: "DELIVERABLE_REVIEWED",
    title: approved ? "Your deliverable was approved" : "Changes requested on your deliverable",
    body: `v${version.versionNumber} — ${String(feedback || "").slice(0, 140)}`,
    link: deliverableLink({ project, task }),
  });
}

/** Tell the assignee a submission is waiting for them, if they are not the actor. */
async function notifyReviewerPending({ project, task, version, user }) {
  const reviewerId = project.managerId;
  if (!reviewerId) return;
  if (String(reviewerId) === String(user._id)) return;

  await createNotification({
    userId: reviewerId,
    actorId: user._id,
    workspaceId: project.workspaceId,
    type: "DELIVERABLE_SUBMITTED",
    title: "A deliverable is ready for review",
    body: `${task.title} — v${version.versionNumber}`,
    link: deliverableLink({ project, task }),
  });
}

/** The task's deliverable, or null when the task has none. */
async function loadTaskDeliverable(taskId) {
  const deliverable = await Deliverable.findOne({ taskId });
  if (!deliverable) return null;

  const [versions, reviews] = await Promise.all([
    DeliverableVersion.find({ deliverableId: deliverable._id }).sort({ versionNumber: 1 }),
    DeliverableReview.find({ deliverableId: deliverable._id }).sort({ reviewedAt: 1 }),
  ]);

  return { deliverable, versions, reviews };
}

module.exports = {
  DELIVERABLE_COMPATIBLE_STATUSES,
  MIN_FEEDBACK_LENGTH,
  REVIEWER_PERMISSION,
  TASK_STATUS_FOR_DELIVERABLE,
  VERSION_TRANSITIONS,
  assertFeedbackPresent,
  assertMaySubmitForTask,
  assertNotSelfReview,
  assertReviewerPermission,
  assertVersionTransition,
  createDeliverableForTask,
  createNextVersion,
  decide,
  deliverableLink,
  loadDeliverableBundle,
  loadReviewers,
  loadTaskDeliverable,
  notifyReviewerPending,
  notifySubmitter,
  recordDeliverableActivity,
  serializeDeliverable,
  serializeReview,
  serializeVersion,
  startReview,
  submitVersion,
  syncTaskForNewVersion,
  taskLink,
  updateDraftVersion,
};

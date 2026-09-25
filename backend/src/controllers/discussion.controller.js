"use strict";

/**
 * Project discussion.
 *
 * A discussion is a message thread scoped to one project. It is mounted under
 * the existing project routes so it inherits `projectAccess` — the same
 * middleware that guards the board, the deliverables and the members — and can
 * therefore only ever be reached by somebody who is already authorized for
 * that project.
 *
 * Posting additionally requires the `comment` action, the same permission task
 * comments use, so a project viewer reads the discussion and a project member
 * takes part in it. Reading requires `view_project`.
 *
 * Nothing here grants access. The decision is made on every request by
 * `resolveProjectRole`, and a discussion message is not an input to it.
 */

const messaging = require("../services/messaging.service");

/** GET /api/projects/:projectId/discussion */
async function listDiscussion(req, res, next) {
  try {
    const { messages } = await messaging.listProjectMessages({
      userId: req.user._id,
      projectId: req.params.projectId,
      limit: req.query.limit,
    });

    res.json({ success: true, messages });
  } catch (error) {
    next(error);
  }
}

/** POST /api/projects/:projectId/discussion */
async function postDiscussion(req, res, next) {
  try {
    const message = await messaging.postProjectMessage({
      userId: req.user._id,
      projectId: req.params.projectId,
      content: req.body.content,
    });

    res.status(201).json({ success: true, message });
  } catch (error) {
    next(error);
  }
}

module.exports = { listDiscussion, postDiscussion };

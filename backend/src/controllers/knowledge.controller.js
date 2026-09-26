"use strict";

/**
 * Phase 22 — Knowledge Base HTTP layer.
 *
 * Thin by design: `projectAccess` has already resolved and authorized the
 * project, and the route has already checked the one permission this endpoint
 * needs. What is left is reading query parameters and handing off to the
 * service, which owns every rule worth arguing about.
 */

const {
  listResources,
  getResource,
  createResource,
  updateResource,
  setResourceStatus,
  promoteDeliverable,
} = require("../services/knowledge.service");

/** GET /knowledge — the project's knowledge, with filters and a summary. */
async function list(req, res, next) {
  try {
    const result = await listResources({
      project: req.project,
      projectRole: req.projectRole,
      query: {
        search: req.query.search,
        category: req.query.category,
        status: req.query.status,
        resourceType: req.query.resourceType,
      },
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

/** GET /knowledge/:resourceId — one resource, with its provenance resolved. */
async function detail(req, res, next) {
  try {
    const resource = await getResource({
      project: req.project,
      resourceId: req.params.resourceId,
    });
    res.json({ success: true, resource });
  } catch (error) {
    next(error);
  }
}

/** POST /knowledge — a hand-curated resource. */
async function create(req, res, next) {
  try {
    const resource = await createResource({
      project: req.project,
      user: req.user,
      data: req.body,
    });
    res.status(201).json({ success: true, resource });
  } catch (error) {
    next(error);
  }
}

/** PATCH /knowledge/:resourceId — edit the resource's own content. */
async function update(req, res, next) {
  try {
    const resource = await updateResource({
      project: req.project,
      user: req.user,
      resourceId: req.params.resourceId,
      data: req.body,
    });
    res.json({ success: true, resource });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /knowledge/from-deliverable/:deliverableId — the approval bridge.
 *
 * Named for what it is rather than hidden behind a generic create: the only
 * way a submission becomes knowledge is through this door, and the service
 * refuses anything that is not APPROVED.
 */
async function promote(req, res, next) {
  try {
    const resource = await promoteDeliverable({
      project: req.project,
      user: req.user,
      deliverableId: req.params.deliverableId,
    });
    res.status(201).json({ success: true, resource });
  } catch (error) {
    next(error);
  }
}

/** PATCH /knowledge/:resourceId/status — archive or restore, behind its own permission. */
async function setStatus(req, res, next) {
  try {
    const resource = await setResourceStatus({
      project: req.project,
      user: req.user,
      resourceId: req.params.resourceId,
      status: req.body?.status,
    });
    res.json({ success: true, resource });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  detail,
  create,
  update,
  setStatus,
  promote,
};

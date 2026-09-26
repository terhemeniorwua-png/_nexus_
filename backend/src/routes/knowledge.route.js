"use strict";

/**
 * Phase 22 — project-scoped Knowledge Base routes.
 *
 *   /api/workspaces/:workspaceId/projects/:projectId/knowledge
 *
 * Same gate shape as the other project resources: `authenticate` → `memberOf`
 * → `projectAccess` resolves and authorizes the project once, and each route
 * then asks for the single permission it needs. Reading is open to every
 * project role; curating, editing and archiving are project-management
 * actions, so a MEMBER gets 403 rather than a hidden button.
 */

const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf } = require("../middleware/roleMiddleware");
const { projectAccess, requireProjectPermission } = require("../middleware/authorize");
const {
  list,
  detail,
  create,
  update,
  setStatus,
  promote,
} = require("../controllers/knowledge.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf, projectAccess);

router.get("/", requireProjectPermission("view_knowledge_base"), list);
router.get("/:resourceId", requireProjectPermission("view_knowledge_base"), detail);

// Declared before "/:resourceId" routes would match, though the methods differ
// anyway; keeping the literal path first documents that this is a distinct
// action rather than an id.
router.post(
  "/from-deliverable/:deliverableId",
  requireProjectPermission("create_knowledge_resource"),
  promote
);

router.post("/", requireProjectPermission("create_knowledge_resource"), create);
router.patch("/:resourceId", requireProjectPermission("update_knowledge_resource"), update);
router.patch(
  "/:resourceId/status",
  requireProjectPermission("archive_knowledge_resource"),
  setStatus
);

module.exports = router;

const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf } = require("../middleware/roleMiddleware");
const { projectAccess, requireProjectPermission } = require("../middleware/authorize");
const { listProjectDeliverables } = require("../controllers/deliverable.controller");

/**
 * Project-scoped deliverable listing:
 *   GET /api/workspaces/:workspaceId/projects/:projectId/deliverables
 *
 * The lifecycle itself (submit, review, approve, versions) is served by the
 * global `/api/deliverables/:deliverableId/...` routes, which are
 * version-scoped — a project-scoped "submit" endpoint cannot say *which*
 * version it means.
 */
const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf, projectAccess);

router.get("/", requireProjectPermission("view_deliverable"), listProjectDeliverables);

module.exports = router;

const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf } = require("../middleware/roleMiddleware");
const { projectAccess, requireProjectPermission } = require("../middleware/authorize");
const {
  listResources,
  createResource,
  updateResource,
  deleteResource,
} = require("../controllers/projectResource.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf, projectAccess);

router.get("/", requireProjectPermission("view_project_resources"), listResources);
router.post("/", requireProjectPermission("create_project_resource"), createResource);
router.patch("/:resourceId", requireProjectPermission("update_project_resource"), updateResource);
router.delete("/:resourceId", requireProjectPermission("delete_project_resource"), deleteResource);

module.exports = router;
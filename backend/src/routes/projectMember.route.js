const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { memberOf } = require("../middleware/roleMiddleware");
const { projectAccess, requireProjectPermission } = require("../middleware/authorize");
const {
  listProjectMembers,
  inviteProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
} = require("../controllers/projectMember.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, memberOf, projectAccess);

router.get("/", requireProjectPermission("view_project_members"), listProjectMembers);
router.post("/", requireProjectPermission("invite_project_member"), inviteProjectMember);
router.patch(
  "/:userId",
  requireProjectPermission("invite_project_member"),
  updateProjectMemberRole
);
router.delete(
  "/:userId",
  requireProjectPermission("remove_project_member"),
  removeProjectMember
);

module.exports = router;
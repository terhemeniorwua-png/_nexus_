const Document = require("../models/document.model");
const Project = require("../models/project.model");
const { ApiError } = require("../middleware/errorHandler");
const { recordActivity } = require("../services/activity.service");
const { getAccessibleProjectIds } = require("../services/access.service");
const { hasProjectPermission } = require("../permissions/permissions");

async function listDocuments(req, res, next) {
  try {
    const accessibleIds = await getAccessibleProjectIds({
      userId: req.user._id,
      workspaceId: req.workspace._id,
      isOwner: Boolean(req.isOwner),
      workspaceMemberRole: req.memberRole,
    });

    const documents = await Document.find({
      workspaceId: req.workspace._id,
      $or: [{ projectId: null }, { projectId: { $in: accessibleIds } }],
    })
      .select("-content")
      .populate("projectId", "name")
      .populate("createdBy", "name email avatar")
      .sort({ updatedAt: -1 });

    res.json({ success: true, documents });
  } catch (error) {
    next(error);
  }
}

async function createDocument(req, res, next) {
  try {
    const { title, content, projectId } = req.body;

    const targetProjectId = projectId || null;

    // Project-scoped documents require project access + the project-context
    // create_document permission.
    if (targetProjectId) {
      const project = await Project.findById(targetProjectId);
      if (!project || String(project.workspaceId) !== String(req.workspace._id)) {
        return next(new ApiError(403, "Project does not belong to this workspace"));
      }

      const { resolveProjectRole } = require("../services/access.service");
      const resolved = await resolveProjectRole({
        user: req.user,
        project,
        isOwner: Boolean(req.isOwner),
        workspaceMemberRole: req.memberRole,
      });
      if (!resolved || !hasProjectPermission(resolved.role, "create_document")) {
        return next(new ApiError(403, "You do not have permission to perform this action."));
      }
    }

    const document = await Document.create({
      workspaceId: req.workspace._id,
      projectId: targetProjectId,
      title: String(title || "Untitled").trim() || "Untitled",
      content: String(content || ""),
      createdBy: req.user._id,
    });

    await recordActivity({
      workspaceId: req.workspace._id,
      userId: req.user._id,
      action: "DOCUMENT_CREATED",
      targetType: "document",
      targetId: document._id,
      metadata: { title: document.title },
    });

    res.status(201).json({ success: true, document: document.toJSON() });
  } catch (error) {
    next(error);
  }
}

async function getDocument(req, res, next) {
  try {
    const document = await Document.findById(req.document._id)
      .populate("projectId", "name")
      .populate("createdBy", "name email avatar");

    res.json({ success: true, document });
  } catch (error) {
    next(error);
  }
}

async function updateDocument(req, res, next) {
  try {
    const document = req.document;

    const { title, content, projectId } = req.body;
    if (title !== undefined) document.title = String(title).trim() || "Untitled";
    if (content !== undefined) document.content = String(content);
    if (projectId !== undefined) document.projectId = projectId || null;

    await document.save();

    await recordActivity({
      workspaceId: req.workspace._id,
      userId: req.user._id,
      action: "DOCUMENT_UPDATED",
      targetType: "document",
      targetId: document._id,
      metadata: { title: document.title },
    });

    res.json({ success: true, document: document.toJSON() });
  } catch (error) {
    next(error);
  }
}

async function deleteDocument(req, res, next) {
  try {
    const document = req.document;

    await Document.deleteOne({ _id: document._id });

    res.json({ success: true, message: "Document deleted" });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listDocuments,
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
};
const Document = require("../models/document.model");
const { ApiError } = require("../middleware/errorHandler");
const { recordActivity } = require("../services/activity.service");

async function listDocuments(req, res, next) {
  try {
    const documents = await Document.find({ workspaceId: req.workspace._id })
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

    const document = await Document.create({
      workspaceId: req.workspace._id,
      projectId: projectId || null,
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
    const document = await Document.findOne({
      _id: req.params.docId,
      workspaceId: req.workspace._id,
    })
      .populate("projectId", "name")
      .populate("createdBy", "name email avatar");

    if (!document) return next(new ApiError(404, "Document not found"));

    res.json({ success: true, document });
  } catch (error) {
    next(error);
  }
}

async function updateDocument(req, res, next) {
  try {
    const document = await Document.findOne({
      _id: req.params.docId,
      workspaceId: req.workspace._id,
    });

    if (!document) return next(new ApiError(404, "Document not found"));

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
    const document = await Document.findOne({
      _id: req.params.docId,
      workspaceId: req.workspace._id,
    });

    if (!document) return next(new ApiError(404, "Document not found"));

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
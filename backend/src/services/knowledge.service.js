"use strict";

/**
 * Phase 22 — Knowledge Base service.
 *
 * The Knowledge Base is the terminal stage of the work lifecycle, so this
 * service is built around one rule: knowledge may only be *promoted* from a
 * deliverable that is genuinely APPROVED. Everything else — listing, search,
 * curated resources, archiving — is ordinary project-scoped CRUD on top of
 * that rule.
 *
 * Reads are always scoped to `projectId`, which the route layer has already
 * authorized via the Phase 9 access model. A resource id from another project
 * is therefore indistinguishable from one that does not exist (404), never a
 * cross-project leak.
 */

const KnowledgeResource = require("../models/knowledgeResource.model");
const Deliverable = require("../models/deliverable.model");
const DeliverableVersion = require("../models/deliverableVersion.model");
const Task = require("../models/task.model");
const User = require("../models/user.model");
const { ApiError } = require("../middleware/errorHandler");
const { recordActivity } = require("./activity.service");
const { hasProjectPermission } = require("../permissions/permissions");

const {
  CATEGORIES,
  RESOURCE_TYPES,
  STATUSES,
  SOURCE_TYPES,
  LINK_TYPES,
} = KnowledgeResource;

/** Escape user input before it reaches a RegExp — never build one from raw text. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertObjectId(value, message) {
  if (!value || !/^[a-f\d]{24}$/i.test(String(value))) {
    throw new ApiError(404, message);
  }
}

function pickEnum(value, allowed, fallback) {
  const upper = String(value || "").trim().toUpperCase();
  return allowed.includes(upper) ? upper : fallback;
}

/**
 * A link resource without a usable URL is not a link. Rejecting here (rather
 * than storing an empty string) is what stops a "GitHub Repository" card from
 * rendering a dead Open button.
 */
function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ApiError(400, "That URL is not valid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiError(400, "Only http and https URLs are supported");
  }
  return parsed.toString();
}

function serializeSourceFile(sourceFile) {
  if (!sourceFile) return null;
  const hasFile = Boolean(sourceFile.fileUrl || sourceFile.fileName);
  if (!hasFile) return null;
  return {
    fileName: sourceFile.fileName || "",
    fileUrl: sourceFile.fileUrl || "",
    mimeType: sourceFile.mimeType || "",
    fileSize: sourceFile.fileSize ?? null,
  };
}

function personShape(person) {
  if (!person) return null;
  return { id: String(person._id || person.id), name: person.name || null };
}

function serializeResource(resource, { task = null, project = null } = {}) {
  const raw = resource.toJSON ? resource.toJSON() : resource;
  return {
    id: String(raw._id || raw.id),
    projectId: String(raw.projectId),
    title: raw.title,
    description: raw.description || "",
    category: raw.category,
    resourceType: raw.resourceType,
    url: raw.url || "",
    content: raw.content || "",
    status: raw.status,
    sourceType: raw.sourceType,
    // Provenance: references, not copies. The deliverable stays the record of
    // truth; this only says "this knowledge came from that submission".
    sourceDeliverableId: raw.sourceDeliverableId ? String(raw.sourceDeliverableId) : null,
    sourceTaskId: raw.sourceTaskId ? String(raw.sourceTaskId) : null,
    sourceVersionNumber: raw.sourceVersionNumber ?? null,
    sourceFile: serializeSourceFile(raw.sourceFile),
    // `storageKey` is intentionally never serialized: it is a server-side
    // handle, and the file is served through the authorized download route.
    createdBy: personShape(resource.createdByDoc ?? raw.createdBy),
    approvedBy: personShape(resource.approvedByDoc ?? raw.approvedBy),
    approvedAt: raw.approvedAt || null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
    projectName: project ? project.name : raw.projectName || undefined,
    sourceTaskTitle: task ? task.title : raw.sourceTaskTitle || undefined,
  };
}

/** A compact reference used by the submission UI, so it never has to diff lists. */
function serializeReference(resource) {
  if (!resource) return null;
  const raw = resource.toJSON ? resource.toJSON() : resource;
  return {
    id: String(raw._id || raw.id),
    title: raw.title,
    status: raw.status,
    category: raw.category,
    resourceType: raw.resourceType,
  };
}

/**
 * Resolve the people behind a batch of resources in two queries rather than one
 * per resource, then attach them under names the serializer understands.
 */
async function attachPeople(resources) {
  const ids = new Set();
  for (const resource of resources) {
    if (resource.createdBy) ids.add(String(resource.createdBy));
    if (resource.approvedBy) ids.add(String(resource.approvedBy));
  }
  if (ids.size === 0) return;

  const people = await User.find({ _id: { $in: [...ids] } }).select("name");
  const byId = new Map(people.map((p) => [String(p._id), p]));
  for (const resource of resources) {
    if (resource.createdBy) {
      resource.createdByDoc = byId.get(String(resource.createdBy)) || null;
    }
    if (resource.approvedBy) {
      resource.approvedByDoc = byId.get(String(resource.approvedBy)) || null;
    }
  }
}

/**
 * Header summary for the project, computed over the *unfiltered* knowledge
 * base so the numbers describe the project rather than the current search.
 */
async function buildSummary(projectId) {
  const rows = await KnowledgeResource.aggregate([
    { $match: { projectId } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const byCategory = {};
  for (const category of CATEGORIES) byCategory[category] = 0;
  let total = 0;
  let archived = 0;
  for (const row of rows) {
    byCategory[row._id] = row.count;
    total += row.count;
  }
  const archivedCount = await KnowledgeResource.countDocuments({
    projectId,
    status: "ARCHIVED",
  });
  archived = archivedCount;
  return { total, active: total - archived, archived, byCategory };
}

/**
 * List a project's knowledge, optionally narrowed by search text, category,
 * status and resource type.
 *
 * Search spans title, description, category, resource type and the author's
 * name — plus the project name, because the page is already scoped to it, so
 * searching for the project's own name legitimately returns the whole base.
 */
async function listResources({ project, query = {}, projectRole }) {
  const filters = [];

  const search = String(query.search || "").trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    // Resolve author names to ids first: the People collection is the only
    // place a human-readable name lives, and the resource stores an id.
    const authors = await User.find({ name: rx }).select("_id").limit(200);
    const authorIds = authors.map((a) => a._id);
    const clauses = [
      { title: rx },
      { description: rx },
      { category: rx },
      { resourceType: rx },
      { sourceType: rx },
    ];
    if (project && project.name) clauses.push({ projectName: rx });
    if (authorIds.length) {
      clauses.push({ createdBy: { $in: authorIds } });
      clauses.push({ approvedBy: { $in: authorIds } });
    }
    filters.push({ $or: clauses });
  }

  if (query.category) {
    const category = String(query.category).trim().toUpperCase();
    if (category !== "ALL") {
      if (!CATEGORIES.includes(category)) {
        throw new ApiError(400, `Unknown category "${query.category}"`);
      }
      filters.push({ category });
    }
  }

  if (query.status) {
    const status = String(query.status).trim().toUpperCase();
    if (status !== "ALL") {
      if (!STATUSES.includes(status)) {
        throw new ApiError(400, `Unknown status "${query.status}"`);
      }
      filters.push({ status });
    }
  }

  if (query.resourceType) {
    const resourceType = String(query.resourceType).trim().toUpperCase();
    if (resourceType !== "ALL") {
      if (!RESOURCE_TYPES.includes(resourceType)) {
        throw new ApiError(400, `Unknown resource type "${query.resourceType}"`);
      }
      filters.push({ resourceType });
    }
  }

  const resources = await KnowledgeResource.find({
    projectId: project._id,
    ...(filters.length ? { $and: filters } : {}),
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(200);

  await attachPeople(resources);

  // Task titles make "Created from: Task #42 — Complete API Documentation"
  // possible without the client walking the chain itself.
  const taskIds = [...new Set(resources.map((r) => String(r.sourceTaskId)).filter(Boolean))];
  const tasks = taskIds.length
    ? await Task.find({ _id: { $in: taskIds } }).select("title")
    : [];
  const taskTitles = new Map(tasks.map((t) => [String(t._id), t.title]));

  const summary = await buildSummary(project._id);

  return {
    resources: resources.map((resource) =>
      serializeResource(resource, {
        task: taskTitles.get(String(resource.sourceTaskId))
          ? { title: taskTitles.get(String(resource.sourceTaskId)) }
          : null,
        project,
      })
    ),
    summary,
    // The client reads these instead of re-deriving role logic, so the UI can
    // never disagree with the permission the API actually enforced.
    permissions: {
      canCreate: hasProjectPermission(projectRole, "create_knowledge_resource"),
      canUpdate: hasProjectPermission(projectRole, "update_knowledge_resource"),
      canArchive: hasProjectPermission(projectRole, "archive_knowledge_resource"),
    },
    categories: CATEGORIES,
    resourceTypes: RESOURCE_TYPES,
    statuses: STATUSES,
  };
}

/** One resource, with its provenance resolved. Scoped to the project. */
async function getResource({ project, resourceId }) {
  assertObjectId(resourceId, "Knowledge resource not found");

  const resource = await KnowledgeResource.findOne({
    _id: resourceId,
    projectId: project._id,
  });
  if (!resource) throw new ApiError(404, "Knowledge resource not found");

  await attachPeople([resource]);
  const task = resource.sourceTaskId
    ? await Task.findById(resource.sourceTaskId).select("title status")
    : null;

  return serializeResource(resource, { task, project });
}

function readSharedFields(data) {
  const title = String(data.title || "").trim();
  if (!title) throw new ApiError(400, "Title is required");

  const description = data.description !== undefined ? String(data.description).trim() : "";
  if (description.length > 2000) {
    throw new ApiError(400, "Description cannot exceed 2000 characters");
  }

  return {
    title,
    description,
    category: pickEnum(data.category, CATEGORIES, "OTHER"),
    resourceType: pickEnum(data.resourceType, RESOURCE_TYPES, "DOCUMENT"),
    url: data.url !== undefined ? normalizeUrl(data.url) : "",
    content: data.content !== undefined ? String(data.content) : "",
  };
}

function assertUrlPresent(resourceType, url) {
  if (LINK_TYPES.includes(resourceType) && !url) {
    throw new ApiError(400, "A link or repository resource needs a URL");
  }
}

/** A hand-curated resource: a research note, an architecture summary, a repo link. */
async function createResource({ project, user, data }) {
  const fields = readSharedFields(data || {});
  assertUrlPresent(fields.resourceType, fields.url);

  const resource = await KnowledgeResource.create({
    projectId: project._id,
    workspaceId: project.workspaceId,
    title: fields.title,
    description: fields.description,
    category: fields.category,
    resourceType: fields.resourceType,
    url: fields.url,
    content: fields.content,
    status: "APPROVED",
    sourceType: fields.url ? "EXTERNAL_LINK" : "MANUAL",
    createdBy: user._id,
    approvedBy: user._id,
    approvedAt: new Date(),
  });

  await recordActivity({
    workspaceId: project.workspaceId,
    projectId: project._id,
    userId: user._id,
    action: "KNOWLEDGE_ADDED",
    targetType: "knowledgeResource",
    targetId: resource._id,
    metadata: { title: resource.title, category: resource.category, projectName: project.name },
  });

  await attachPeople([resource]);
  return serializeResource(resource, { project });
}

/**
 * Edit a resource, or archive / restore it.
 *
 * Provenance is immutable: `sourceType` and the source ids are never writable
 * from here, so a promoted resource can never be re-pointed at a different
 * submission to fake a lineage.
 */
async function updateResource({ project, user, resourceId, data }) {
  assertObjectId(resourceId, "Knowledge resource not found");

  const resource = await KnowledgeResource.findOne({
    _id: resourceId,
    projectId: project._id,
  });
  if (!resource) throw new ApiError(404, "Knowledge resource not found");

  const patch = data || {};

  if (patch.status !== undefined) {
    const status = String(patch.status).trim().toUpperCase();
    if (!STATUSES.includes(status)) {
      throw new ApiError(400, `Unknown status "${patch.status}"`);
    }
    resource.status = status;
  }

  const editsTitle =
    patch.title !== undefined || patch.description !== undefined || patch.category !== undefined;
  if (editsTitle) {
    const merged = {
      title: patch.title !== undefined ? patch.title : resource.title,
      description: patch.description !== undefined ? patch.description : resource.description,
      category: patch.category !== undefined ? patch.category : resource.category,
    };
    const title = String(merged.title).trim();
    if (!title) throw new ApiError(400, "Title is required");
    if (String(merged.description).length > 2000) {
      throw new ApiError(400, "Description cannot exceed 2000 characters");
    }
    resource.title = title;
    resource.description = String(merged.description).trim();
    resource.category = pickEnum(merged.category, CATEGORIES, resource.category);
  }

  if (patch.resourceType !== undefined) {
    const nextType = pickEnum(patch.resourceType, RESOURCE_TYPES, resource.resourceType);
    const nextUrl = patch.url !== undefined ? normalizeUrl(patch.url) : resource.url;
    assertUrlPresent(nextType, nextUrl);
    resource.resourceType = nextType;
    resource.url = nextUrl;
  } else if (patch.url !== undefined) {
    const nextUrl = normalizeUrl(patch.url);
    assertUrlPresent(resource.resourceType, nextUrl);
    resource.url = nextUrl;
  }

  if (patch.content !== undefined) {
    resource.content = String(patch.content);
  }

  await resource.save();

  if (patch.status !== undefined) {
    await recordActivity({
      workspaceId: project.workspaceId,
      projectId: project._id,
      userId: user._id,
      action: resource.status === "ARCHIVED" ? "KNOWLEDGE_ARCHIVED" : "KNOWLEDGE_RESTORED",
      targetType: "knowledgeResource",
      targetId: resource._id,
      metadata: { title: resource.title, projectName: project.name },
    });
  }

  await attachPeople([resource]);
  const task = resource.sourceTaskId
    ? await Task.findById(resource.sourceTaskId).select("title")
    : null;
  return serializeResource(resource, { task, project });
}

/**
 * Phase 22 §6 — promote an approved submission into the Knowledge Base.
 *
 * The guard is the whole feature: only a deliverable whose current status is
 * APPROVED may be promoted, so an unapproved submission can never appear as
 * approved knowledge no matter what the client asks for. Re-promoting the same
 * deliverable is a 409, answered by the service check and — under a race — by
 * the unique index on `sourceDeliverableId`.
 */
async function promoteDeliverable({ project, user, deliverableId }) {
  assertObjectId(deliverableId, "Deliverable not found");

  const deliverable = await Deliverable.findOne({
    _id: deliverableId,
    projectId: project._id,
  });
  // Scoped to this project: a deliverable from elsewhere is "not found", not
  // "forbidden", so the endpoint is not a cross-project existence oracle.
  if (!deliverable) throw new ApiError(404, "Deliverable not found");

  if (deliverable.status !== "APPROVED") {
    throw new ApiError(400, "Only an approved submission can be added to the Knowledge Base");
  }
  if (!deliverable.approvedVersion) {
    throw new ApiError(400, "This submission has no approved version to promote");
  }

  const existing = await KnowledgeResource.findOne({
    sourceDeliverableId: deliverable._id,
  });
  if (existing) {
    throw new ApiError(409, "This submission is already in the Knowledge Base");
  }

  const version = await DeliverableVersion.findOne({
    deliverableId: deliverable._id,
    versionNumber: deliverable.approvedVersion,
  });

  const task = await Task.findById(deliverable.taskId).select("title");
  const description = version && version.description
    ? String(version.description)
    : `Promoted from the approved submission "${deliverable.title}".`;

  let resource;
  try {
    resource = await KnowledgeResource.create({
      projectId: project._id,
      workspaceId: project.workspaceId,
      title: deliverable.title,
      description: description.slice(0, 2000),
      // The submitter names the category; RESEARCH and DOCUMENTATION are the
      // only honest defaults for a promoted deliverable.
      category: "DOCUMENTATION",
      resourceType: "DOCUMENT",
      status: "APPROVED",
      sourceType: "APPROVED_DELIVERABLE",
      sourceDeliverableId: deliverable._id,
      sourceTaskId: deliverable.taskId,
      sourceVersionNumber: deliverable.approvedVersion,
      sourceFile: version
        ? {
            fileName: version.fileName,
            fileUrl: version.fileUrl,
            storageKey: version.storageKey,
            mimeType: version.mimeType,
            fileSize: version.fileSize,
          }
        : undefined,
      createdBy: user._id,
      approvedBy: user._id,
      approvedAt: new Date(),
    });
  } catch (error) {
    // Lost a race against a concurrent promotion of the same submission.
    if (error && error.code === 11000) {
      throw new ApiError(409, "This submission is already in the Knowledge Base");
    }
    throw error;
  }

  await recordActivity({
    workspaceId: project.workspaceId,
    projectId: project._id,
    userId: user._id,
    action: "KNOWLEDGE_ADDED",
    targetType: "knowledgeResource",
    targetId: resource._id,
    metadata: {
      title: resource.title,
      category: resource.category,
      projectName: project.name,
      fromDeliverable: true,
    },
  });

  await attachPeople([resource]);
  return serializeResource(resource, { task, project });
}

/**
 * The knowledge resource a submission was promoted into, or null. Used by the
 * deliverable payload so the submission UI can say "Added to Knowledge Base"
 * without a second request, and can never show an "Add" action twice.
 */
async function findBySourceDeliverable(deliverableId) {
  if (!deliverableId || !/^[a-f\d]{24}$/i.test(String(deliverableId))) return null;
  const resource = await KnowledgeResource.findOne({
    sourceDeliverableId: deliverableId,
  });
  return serializeReference(resource);
}

module.exports = {
  CATEGORIES,
  RESOURCE_TYPES,
  STATUSES,
  SOURCE_TYPES,
  listResources,
  getResource,
  createResource,
  updateResource,
  promoteDeliverable,
  findBySourceDeliverable,
  serializeResource,
  serializeReference,
};

const mongoose = require("mongoose");
const { applyTransforms } = require("../utils/serialize");

/**
 * Phase 22 — the Knowledge Base: the last stage of the work lifecycle.
 *
 *   Task → Deliverable → Submission → Review → APPROVED → KnowledgeResource
 *
 * A resource is either *promoted* from an approved deliverable (so the team
 * keeps the reasoning behind shipped work) or *curated by hand* (a link to a
 * repository, a research note, an architecture summary).
 *
 * The provenance fields are the point of the whole model: `sourceType` says
 * where the knowledge came from, and the source ids let the UI walk back to the
 * exact submission and task that produced it instead of re-explaining it. They
 * are references, not copies — the deliverable remains the record of truth.
 */
const CATEGORIES = [
  "DOCUMENTATION",
  "REPORTS",
  "ARCHITECTURE",
  "RESEARCH",
  "TESTING",
  "REPOSITORIES",
  "OTHER",
];

const RESOURCE_TYPES = ["DOCUMENT", "LINK", "REPOSITORY", "REPORT", "OTHER"];

const STATUSES = ["APPROVED", "ARCHIVED"];

/** Where the knowledge came from. */
const SOURCE_TYPES = ["APPROVED_DELIVERABLE", "EXTERNAL_LINK", "MANUAL"];

/** Resource types whose value is a URL rather than inline content. */
const LINK_TYPES = ["LINK", "REPOSITORY"];

const knowledgeResourceSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Knowledge resource must belong to a project"],
      index: true,
    },
    // Denormalized the same way Deliverable does it, so list queries never
    // need a join. Never the authorization source of truth.
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    category: {
      type: String,
      enum: CATEGORIES,
      default: "OTHER",
    },
    resourceType: {
      type: String,
      enum: RESOURCE_TYPES,
      default: "DOCUMENT",
    },
    /** Only meaningful for LINK / REPOSITORY resources; validated in the service. */
    url: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "URL cannot exceed 1000 characters"],
    },
    /** In-app document body, for DOCUMENT / REPORT resources. */
    content: {
      type: String,
      default: "",
      maxlength: [200000, "Document is too large"],
    },
    status: {
      type: String,
      enum: STATUSES,
      // Promoted knowledge starts life approved — that is the whole point of
      // only ever promoting an APPROVED deliverable. Archiving is reversible.
      default: "APPROVED",
    },
    sourceType: {
      type: String,
      enum: SOURCE_TYPES,
      default: "MANUAL",
    },
    // --- provenance: set only for a promoted deliverable ---------------------
    sourceDeliverableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deliverable",
      default: null,
    },
    sourceTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    /** Which version was signed off, kept so the UI can say "v3". */
    sourceVersionNumber: {
      type: Number,
      default: null,
    },
    /**
     * A pointer to the approved version's stored file — not a copy of it. The
     * bytes stay in the storage service and are still served by the existing
     * deliverable download route, so promotion adds no new file handling.
     */
    sourceFile: {
      fileName: { type: String, default: "" },
      fileUrl: { type: String, default: "" },
      storageKey: { type: String, default: "" },
      mimeType: { type: String, default: "" },
      fileSize: { type: Number, default: null },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
    /** Who signed the knowledge off. Equals createdBy for a promotion. */
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

knowledgeResourceSchema.index({ projectId: 1, status: 1, updatedAt: -1 });
knowledgeResourceSchema.index({ projectId: 1, category: 1 });
knowledgeResourceSchema.index({ sourceTaskId: 1 }, { sparse: true });

/**
 * One knowledge resource per approved submission.
 *
 * `partialFilterExpression` (not `sparse`) is the important part: the schema
 * defaults `sourceDeliverableId` to `null`, and a sparse index still indexes a
 * present-but-null field, so curated resources would collide with each other
 * on the second insert. Restricting the index to real ObjectIds keeps the
 * guarantee exactly where it is needed — on the deliverable it promotes.
 *
 * The service also checks for an existing resource first; this index is what
 * makes the guarantee hold when two reviewers click the button at once.
 */
knowledgeResourceSchema.index(
  { sourceDeliverableId: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceDeliverableId: { $type: "objectId" } },
  }
);

applyTransforms(knowledgeResourceSchema);

const KnowledgeResource = mongoose.model("KnowledgeResource", knowledgeResourceSchema);

module.exports = KnowledgeResource;
module.exports.CATEGORIES = CATEGORIES;
module.exports.RESOURCE_TYPES = RESOURCE_TYPES;
module.exports.STATUSES = STATUSES;
module.exports.SOURCE_TYPES = SOURCE_TYPES;
module.exports.LINK_TYPES = LINK_TYPES;

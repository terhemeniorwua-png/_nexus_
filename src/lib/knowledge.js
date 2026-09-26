// Phase 22 — Knowledge Base vocabulary, mirroring the status/meta/endpoint
// convention already used for tasks and deliverables in workspaceApi.js. The
// backend is the single source of truth for the values themselves; these are
// the display names and colours for them, kept beside the existing ones so a
// filter can never drift from the API that validates it.

// Order is deliberate: it is the reading order of the category tab row.
export const KNOWLEDGE_CATEGORIES = [
  "DOCUMENTATION",
  "REPORTS",
  "ARCHITECTURE",
  "RESEARCH",
  "TESTING",
  "REPOSITORIES",
  "OTHER",
];

export const KNOWLEDGE_CATEGORY_META = {
  DOCUMENTATION: { label: "Documentation", color: "#3b82f6" },
  REPORTS: { label: "Reports", color: "#eab308" },
  ARCHITECTURE: { label: "Architecture", color: "#a855f7" },
  RESEARCH: { label: "Research", color: "#14b8a6" },
  TESTING: { label: "Testing", color: "#f97316" },
  REPOSITORIES: { label: "Repositories", color: "#8b8b91" },
  OTHER: { label: "Other", color: "#6b7280" },
};

export const KNOWLEDGE_TYPES = [
  "DOCUMENT",
  "LINK",
  "REPOSITORY",
  "REPORT",
  "OTHER",
];

export const KNOWLEDGE_TYPE_META = {
  DOCUMENT: { label: "Document", color: "#3b82f6" },
  LINK: { label: "Link", color: "#14b8a6" },
  REPOSITORY: { label: "Repository", color: "#8b8b91" },
  REPORT: { label: "Report", color: "#eab308" },
  OTHER: { label: "Other", color: "#6b7280" },
};

export const KNOWLEDGE_STATUSES = ["APPROVED", "ARCHIVED"];

export const KNOWLEDGE_STATUS_META = {
  APPROVED: { label: "Approved", color: "#22c55e" },
  ARCHIVED: { label: "Archived", color: "#8b8b91" },
};

// How the resource came to exist. A reader cares that the file was signed off
// by a reviewer, not that it arrived through a particular collection.
export const KNOWLEDGE_SOURCE_META = {
  MANUAL: { label: "Added by a project manager", color: "#8b8b91" },
  EXTERNAL_LINK: { label: "External link", color: "#14b8a6" },
  APPROVED_DELIVERABLE: { label: "From an approved submission", color: "#22c55e" },
};

// The summary strip. `metric` says which number from the API's summary object
// drives the card; per-category counts are read from summary.byCategory. Copy
// lives with the definition so a number and its label cannot drift apart.
export const KNOWLEDGE_SUMMARY_CARDS = [
  { metric: "total", label: "Total resources", hint: "Everything added to this project" },
  { metric: "active", label: "Approved", hint: "Visible to everyone in the project" },
  { metric: "archived", label: "Archived", hint: "Hidden from the active list" },
  {
    metric: "category",
    category: "DOCUMENTATION",
    label: "Documentation",
    hint: "Guides and references",
  },
];

export const KNOWLEDGE_ENDPOINTS = {
  list: (workspaceId, projectId) =>
    `/workspaces/${workspaceId}/projects/${projectId}/knowledge`,
  detail: (workspaceId, projectId, resourceId) =>
    `/workspaces/${workspaceId}/projects/${projectId}/knowledge/${resourceId}`,
  create: (workspaceId, projectId) =>
    `/workspaces/${workspaceId}/projects/${projectId}/knowledge`,
  update: (workspaceId, projectId, resourceId) =>
    `/workspaces/${workspaceId}/projects/${projectId}/knowledge/${resourceId}`,
  setStatus: (workspaceId, projectId, resourceId) =>
    `/workspaces/${workspaceId}/projects/${projectId}/knowledge/${resourceId}/status`,
  fromDeliverable: (workspaceId, projectId, deliverableId) =>
    `/workspaces/${workspaceId}/projects/${projectId}/knowledge/from-deliverable/${deliverableId}`,
};

export function knowledgeCategoryLabel(category) {
  return KNOWLEDGE_CATEGORY_META[category]?.label || "Other";
}

export function knowledgeTypeLabel(resourceType) {
  return KNOWLEDGE_TYPE_META[resourceType]?.label || "Resource";
}

export function knowledgeStatusLabel(status) {
  return KNOWLEDGE_STATUS_META[status]?.label || "Approved";
}

// Manual entries that carry a URL are the common case, so the modal offers
// "Document or link" as one type and splits on presence of the field.
export function knowledgeTypeForUrl(url) {
  return String(url || "").trim() ? "LINK" : "DOCUMENT";
}

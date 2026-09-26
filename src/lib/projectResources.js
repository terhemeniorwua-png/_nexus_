// Phase 23 — Project Resources vocabulary. Same shape and intent as
// src/lib/knowledge.js: the backend owns the accepted values, this owns the
// display names and the endpoint map, so a filter or a form can never offer a
// category the API would reject.
//
// Project Resources and the Knowledge Base are deliberately different things.
// Resources are the outside world's answers — a paper, a tool, a repo, a spec —
// that someone pointed the team at. The knowledge base is what this project
// produced and signed off. The category lists below come from the two separate
// backend enums and are not interchangeable.

// The reading order of the category filter row.
export const RESOURCE_CATEGORIES = [
  "RESEARCH",
  "AI",
  "DEVELOPMENT",
  "DESIGN",
  "DOCUMENTATION",
  "REFERENCE",
  "OTHER",
];

export const RESOURCE_CATEGORY_META = {
  RESEARCH: { label: "Research", color: "#14b8a6" },
  AI: { label: "AI & ML", color: "#a855f7" },
  DEVELOPMENT: { label: "Development", color: "#3b82f6" },
  DESIGN: { label: "Design", color: "#ec4899" },
  DOCUMENTATION: { label: "Documentation", color: "#22c55e" },
  REFERENCE: { label: "Reference", color: "#eab308" },
  OTHER: { label: "Other", color: "#6b7280" },
};

export const RESOURCE_ENDPOINTS = {
  list: (workspaceId, projectId) =>
    `/workspaces/${workspaceId}/projects/${projectId}/resources`,
  item: (workspaceId, projectId, resourceId) =>
    `/workspaces/${workspaceId}/projects/${projectId}/resources/${resourceId}`,
};

// The API refuses create/update/delete below project-manager level, so the
// client mirrors that only to decide which controls to draw. The endpoint
// re-checks the real permission, so this is a convenience, not the gate.
//
// Kept in step with PROJECT_MANAGER_ACTIONS in
// backend/src/permissions/permissions.js.
const CURATOR_ROLES = ["WORKSPACE_OWNER", "ADMIN", "PROJECT_MANAGER"];

export function canCurateResources(role) {
  return CURATOR_ROLES.includes(role);
}

export function resourceCategoryLabel(category) {
  return RESOURCE_CATEGORY_META[category]?.label || "Other";
}

// A bare host reads better in a dense list than a full URL, and it keeps a
// pasted link from stretching the card. Falls back to the raw value when the
// string is not a URL the browser can parse.
export function resourceHost(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return value;
  }
}

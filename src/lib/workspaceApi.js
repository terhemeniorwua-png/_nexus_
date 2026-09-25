import apiRequest from "@/lib/api";

export { apiRequest };

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export const SOCKET_URL = API_URL.replace(/\/api$/, "");

export const PRIORITY_COLORS = {
  Low: "#22c55e",
  Medium: "#eab308",
  High: "#f97316",
  Urgent: "#ef4444",
  LOW: "#22c55e",
  MEDIUM: "#eab308",
  HIGH: "#f97316",
  URGENT: "#ef4444",
};

// Phase 10 — canonical task workflow statuses.
export const TASK_STATUSES = [
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
];

export const TASK_STATUS_META = {
  ASSIGNED: { label: "Assigned", color: "#8b8b91" },
  IN_PROGRESS: { label: "In progress", color: "#3b82f6" },
  SUBMITTED: { label: "Submitted", color: "#a855f7" },
  UNDER_REVIEW: { label: "Under review", color: "#eab308" },
  CHANGES_REQUESTED: { label: "Changes requested", color: "#f97316" },
  APPROVED: { label: "Approved", color: "#22c55e" },
  // Legacy board statuses kept for rendering pre-existing tasks.
  "TO DO": { label: "To do", color: "#8b8b91" },
  "IN PROGRESS": { label: "In progress", color: "#3b82f6" },
  REVIEW: { label: "Review", color: "#a855f7" },
  DONE: { label: "Done", color: "#22c55e" },
  BLOCKED: { label: "Blocked", color: "#ef4444" },
};

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const TASK_PRIORITY_META = {
  LOW: { label: "Low", color: "#22c55e" },
  MEDIUM: { label: "Medium", color: "#eab308" },
  HIGH: { label: "High", color: "#f97316" },
  URGENT: { label: "Urgent", color: "#ef4444" },
};

export const SUBTASK_STATUSES = ["TODO", "IN_PROGRESS", "COMPLETED"];

export const SUBTASK_STATUS_META = {
  TODO: { label: "To do", color: "#8b8b91" },
  IN_PROGRESS: { label: "In progress", color: "#3b82f6" },
  COMPLETED: { label: "Completed", color: "#22c55e" },
};

export function taskStatusMeta(status) {
  return (
    TASK_STATUS_META[status] || { label: status || "—", color: "#8b8b91" }
  );
}

export function taskPriorityMeta(priority) {
  return (
    TASK_PRIORITY_META[priority] || PRIORITY_COLORS[priority] && {
      label: priority,
      color: PRIORITY_COLORS[priority],
    } || { label: priority || "—", color: "#8b8b91" }
  );
}

export const PROJECT_PRIORITY_META = {
  LOW: { label: "Low", color: "#22c55e" },
  MEDIUM: { label: "Medium", color: "#eab308" },
  HIGH: { label: "High", color: "#f97316" },
  URGENT: { label: "Urgent", color: "#ef4444" },
};

export const PROJECT_STATUS_META = {
  PLANNING: { label: "Planning", color: "#8b8b91" },
  ACTIVE: { label: "Active", color: "#3b82f6" },
  ON_HOLD: { label: "On hold", color: "#eab308" },
  COMPLETED: { label: "Completed", color: "#22c55e" },
  ARCHIVED: { label: "Archived", color: "#a855f7" },
};

export const STATUS_COLORS = {
  "TO DO": "#8b8b91",
  "IN PROGRESS": "#3b82f6",
  REVIEW: "#a855f7",
  DONE: "#22c55e",
  ASSIGNED: "#8b8b91",
  IN_PROGRESS: "#3b82f6",
  SUBMITTED: "#a855f7",
  UNDER_REVIEW: "#eab308",
  CHANGES_REQUESTED: "#f97316",
  APPROVED: "#22c55e",
  BLOCKED: "#ef4444",
};

export function initialsOf(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatRelative(value) {
  if (!value) return "";
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function isOverdue(task) {
  if (!task?.dueDate || task.status === "DONE" || task.status === "APPROVED") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

export function isDueSoon(task) {
  if (!task?.dueDate || task.status === "DONE" || task.status === "APPROVED") return false;
  const due = new Date(task.dueDate).getTime();
  return due >= Date.now() && due <= Date.now() + 7 * 24 * 60 * 60 * 1000;
}

/**
 * Display helper for subtask weights (e.g. 20 -> "20%", 33.33 -> "33.33%").
 * Weights arrive already validated by the backend; this only trims float
 * noise so "20.00" is never shown.
 */
export function formatWeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}
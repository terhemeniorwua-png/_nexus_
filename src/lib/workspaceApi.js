import apiRequest from "@/lib/api";

export { apiRequest };

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export const SOCKET_URL = API_URL.replace(/\/api$/, "");

export const PRIORITY_COLORS = {
  Low: "#22c55e",
  Medium: "#eab308",
  High: "#f97316",
  Urgent: "#ef4444",
};

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
  if (!task?.dueDate || task.status === "DONE") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

export function isDueSoon(task) {
  if (!task?.dueDate || task.status === "DONE") return false;
  const due = new Date(task.dueDate).getTime();
  return due >= Date.now() && due <= Date.now() + 7 * 24 * 60 * 60 * 1000;
}
"use client";

import { PROJECT_STATUS_META, PROJECT_PRIORITY_META } from "@/lib/workspaceApi";

export function ProjectStatusBadge({ status }) {
  const meta = PROJECT_STATUS_META[status];
  if (!meta) return null;
  return (
    <span
      className="shrink-0 rounded-md border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
      style={{ color: meta.color, backgroundColor: `${meta.color}14`, borderColor: `${meta.color}33` }}
    >
      {meta.label}
    </span>
  );
}

export function ProjectPriorityBadge({ priority }) {
  const meta = PROJECT_PRIORITY_META[priority];
  if (!meta) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10.5px] font-medium"
      style={{ color: meta.color, backgroundColor: `${meta.color}12`, borderColor: `${meta.color}33` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}
"use client";

import Link from "next/link";
import EmptyState from "../EmptyState";
import { ClockIcon } from "../icons";
import { PROJECT_STATUS_META } from "@/lib/workspaceApi";

/**
 * Phase 20 — Recently Viewed.
 *
 * The list is server-persisted (`ProjectView`, recorded when a project is
 * opened) and arrives already filtered to projects the user can still reach,
 * so this component never has to decide what is visible — a project deleted or
 * lost access to simply is not in the response.
 */
function relativeTime(value) {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function RecentlyViewed({ projects, loading }) {
  const list = Array.isArray(projects) ? projects : [];

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="ws-card h-[58px] animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <EmptyState
        icon={<ClockIcon size={18} />}
        title="No recently viewed projects"
        description="Projects you open will appear here, most recent first."
        className="py-8"
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {list.map((project) => {
        const status = PROJECT_STATUS_META[project.status] || {
          label: project.status || "Active",
          color: "#8b8b91",
        };
        const seen = relativeTime(project.lastViewedAt);

        return (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="ws-card group flex items-center gap-3 rounded-xl p-3.5"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[13px] font-bold text-white"
              style={{ backgroundColor: `${status.color}1f` }}
              aria-hidden="true"
            >
              {(project.name || "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-zinc-100">{project.name}</p>
              {seen && <p className="mt-0.5 text-[11.5px] text-zinc-600">Viewed {seen}</p>}
            </div>
            <span
              className="shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium"
              style={{
                color: status.color,
                borderColor: `${status.color}40`,
                backgroundColor: `${status.color}14`,
              }}
            >
              {status.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import Avatar from "../Avatar";
import EmptyState from "../EmptyState";
import { formatDate, TASK_STATUS_META } from "@/lib/workspaceApi";
import { ClockIcon } from "../icons";

/**
 * Phase 21 — overdue work.
 *
 * "Overdue" here means exactly what the backend counted: an unfinished task
 * whose due date has passed. Completed work is excluded even when it was late,
 * because the panel answers "what needs chasing now".
 *
 * The day count is the server's, so the figure on screen is the figure that was
 * queried rather than a re-derivation that could disagree after midnight.
 */
export default function OverdueTasks({ tasks, loading, error, showProject }) {
  if (error) {
    return (
      <div
        className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-5 py-6"
        role="alert"
      >
        <p className="text-[13px] font-semibold text-red-200">Overdue list unavailable</p>
        <p className="mt-1 text-[12.5px] text-red-200/70">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[1, 2].map((i) => (
          <div key={i} className="h-[54px] animate-pulse rounded-xl bg-white/[0.03]" aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <EmptyState
        icon={<ClockIcon size={18} />}
        title="Nothing overdue"
        description="Every task in this scope is either on time or finished."
        className="py-8"
      />
    );
  }

  return (
    <ul className="space-y-2.5">
      {tasks.map((task) => {
        const meta = TASK_STATUS_META[task.status] || { label: task.status, color: "#8b8b91" };
        return (
          <li key={task.id} className="ws-card flex items-center gap-3 rounded-xl px-3.5 py-3">
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums"
              style={{ color: "#ef4444", backgroundColor: "#ef44441f" }}
              title={`Due ${formatDate(task.dueDate)}`}
            >
              {task.daysOverdue}d late
            </span>

            <div className="min-w-0 flex-1">
              <Link
                href={`/projects/${task.projectId}/board`}
                className="block truncate text-[13px] font-semibold text-white transition-colors hover:text-zinc-300"
              >
                {task.title}
              </Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11.5px] text-zinc-500">
                <span style={{ color: meta.color }}>{meta.label}</span>
                <span className="flex items-center gap-1">
                  <Avatar name={task.assignee?.name} size={16} />
                  {task.assignee?.name || "Unassigned"}
                </span>
                {showProject && <span className="truncate text-zinc-600">{task.projectName}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

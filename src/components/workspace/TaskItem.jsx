"use client";

import Link from "next/link";
import Avatar from "./Avatar";
import { ClockIcon, ChevronLeftIcon } from "./icons";
import { PRIORITY_COLORS, isOverdue } from "@/lib/workspaceApi";

export default function TaskItem({ task, workspaceId }) {
  const color = PRIORITY_COLORS[task?.priority];
  const overdue = isOverdue(task);

  const href =
    task.projectId && task.workspaceId
      ? `/workspaces/${task.workspaceId}/projects/${task.projectId}/board`
      : workspaceId
        ? `/workspaces/${workspaceId}`
        : "/dashboard";

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-3.5 py-3 transition-colors hover:border-white/14 hover:bg-white/[0.045]"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color, boxShadow: color ? `0 0 8px ${color}66` : undefined }}
        title={`${task?.priority} priority`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-zinc-100">{task?.title}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-zinc-500">{task?.projectName}</p>
      </div>

      {task?.tags?.[0] && (
        <span className="hidden rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] text-zinc-400 sm:inline">
          {task.tags[0]}
        </span>
      )}

      {task?.dueDate && (
        <span
          className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
            overdue ? "bg-red-400/15 text-red-300" : "bg-white/5 text-zinc-400"
          }`}
        >
          <ClockIcon size={11} />
          {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          {overdue && <b className="font-bold">overdue</b>}
        </span>
      )}

      {task?.assignedTo && (
        <Avatar name={task.assignedTo.name} avatar={task.assignedTo.avatar} size={24} className="shrink-0" />
      )}
      <ChevronLeftIcon size={14} className="-scale-x-100 shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-300" />
    </Link>
  );
}
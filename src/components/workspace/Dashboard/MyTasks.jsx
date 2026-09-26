"use client";

import Link from "next/link";
import EmptyState from "../EmptyState";
import { ListTasksIcon, CalendarIcon } from "../icons";
import { taskStatusMeta } from "@/lib/workspaceApi";

/**
 * Phase 20 — My Tasks.
 *
 * `tasks` comes straight from the dashboard endpoint; the status label and
 * colour come from the shared `TASK_STATUS_META` table, so a task cannot be
 * styled as "Approved" in one place and "Done" in another.
 *
 * Layout follows the spec's table on desktop and collapses to stacked cards on
 * mobile rather than relying on horizontal scroll: a status column that needs
 * scrolling to read is not readable on a phone.
 */
function StatusBadge({ status }) {
  const meta = taskStatusMeta(status);
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium"
      style={{
        color: meta.color,
        borderColor: `${meta.color}40`,
        backgroundColor: `${meta.color}14`,
      }}
    >
      {meta.label}
    </span>
  );
}

function dueLabel(dueDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Where a task row should navigate to.
 *
 * The task detail page is `/projects/:projectId/tasks/:taskId`, which already
 * exists. `projectId` is null when the task's project is no longer reachable —
 * in that case the row renders as plain text rather than a link to a page that
 * would 404.
 */
function TaskRow({ task }) {
  const badge = <StatusBadge status={task.status} />;
  const due = dueLabel(task.dueDate);

  if (!task.projectId) {
    return (
      <tr className="border-b border-white/6 last:border-0">
        <td className="px-4 py-3">
          <p className="truncate text-[13.5px] font-medium text-zinc-100">{task.title}</p>
          <p className="mt-0.5 text-[11.5px] text-zinc-600">{task.projectName}</p>
        </td>
        <td className="hidden px-4 py-3 text-[12.5px] text-zinc-500 sm:table-cell">
          {task.projectName}
        </td>
        <td className="px-4 py-3 text-right">{badge}</td>
      </tr>
    );
  }

  return (
    <tr className="group border-b border-white/6 transition-colors last:border-0 hover:bg-white/[0.02]">
      <td className="px-4 py-3">
        <Link
          href={`/projects/${task.projectId}/tasks/${task.id}`}
          className="block truncate text-[13.5px] font-medium text-zinc-100 transition-colors hover:text-white"
        >
          {task.title}
        </Link>
        <p className="mt-0.5 text-[11.5px] text-zinc-600 sm:hidden">{task.projectName}</p>
      </td>
      <td className="hidden px-4 py-3 text-[12.5px] text-zinc-500 sm:table-cell">
        <Link
          href={`/projects/${task.projectId}`}
          className="truncate transition-colors hover:text-zinc-300"
        >
          {task.projectName}
        </Link>
      </td>
      <td className="px-4 py-3 text-right">{badge}</td>
    </tr>
  );
}

function MobileCard({ task }) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-[13.5px] font-medium text-zinc-100">{task.title}</p>
        <StatusBadge status={task.status} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-zinc-500">
        {task.projectId && <span className="truncate">{task.projectName}</span>}
        {dueLabel(task.dueDate) && (
          <span className="flex items-center gap-1">
            <CalendarIcon size={11} /> {dueLabel(task.dueDate)}
          </span>
        )}
      </div>
    </>
  );

  if (!task.projectId) {
    return <div className="ws-card rounded-xl p-3.5">{inner}</div>;
  }

  return (
    <Link
      href={`/projects/${task.projectId}/tasks/${task.id}`}
      className="ws-card block rounded-xl p-3.5 transition-colors hover:border-white/16"
    >
      {inner}
    </Link>
  );
}

export default function MyTasks({ tasks, loading }) {
  const list = Array.isArray(tasks) ? tasks : [];

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="ws-card h-[62px] animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <EmptyState
        icon={<ListTasksIcon size={18} />}
        title="No tasks assigned to you"
        description="When a task is assigned to you it will show up here with its current status."
        className="py-8"
      />
    );
  }

  return (
    <>
      {/* Desktop: real table semantics. */}
      <div className="ws-card hidden overflow-hidden rounded-2xl sm:block">
        <table className="w-full border-collapse">
          <caption className="sr-only">Tasks assigned to you</caption>
          <thead>
            <tr className="border-b border-white/8 text-left">
              <th scope="col" className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Task
              </th>
              <th scope="col" className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Project
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards, no horizontal scroll. */}
      <div className="space-y-2.5 sm:hidden">
        {list.map((task) => (
          <MobileCard key={task.id} task={task} />
        ))}
      </div>
    </>
  );
}

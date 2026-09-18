"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import { useResource } from "@/hooks/useResource";
import "../workspace.css";
import GlobalNav from "@/components/workspace/GlobalNav";
import EmptyState from "@/components/workspace/EmptyState";
import Avatar from "@/components/workspace/Avatar";
import { ListTasksIcon, ClockIcon, SearchIcon, CheckIcon } from "@/components/workspace/icons";
import { PRIORITY_COLORS, STATUS_COLORS } from "@/lib/workspaceApi";
import { useAuth } from "@/context/AuthContext";

function isOverdue(dueDate, status) {
  return Boolean(dueDate && status !== "DONE" && new Date(dueDate).getTime() < Date.now());
}

const STATUSES = ["TO DO", "IN PROGRESS", "REVIEW", "DONE"];
const TABS = ["ALL", ...STATUSES];

function StatusPill({ status }) {
  const color = STATUS_COLORS[status] || "#8b8b91";
  return (
    <span
      className="shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
      style={{ color, backgroundColor: `${color}14`, borderColor: `${color}33` }}
    >
      {status}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const color = PRIORITY_COLORS[priority];
  if (!color) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium"
      style={{ color, backgroundColor: `${color}12`, borderColor: `${color}33` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {priority}
    </span>
  );
}

function TaskRow({ task }) {
  const href = `/workspaces/${task.workspaceId}/projects/${task.projectId}/board`;
  const overdue = Boolean(isOverdue(task.dueDate, task.status));
  const subtaskDone = (task.subtasks || []).filter((s) => s.completed).length;
  const tags = task.tags || [];

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-3.5 py-3 transition-colors hover:border-white/14 hover:bg-white/[0.045]"
    >
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13.5px] font-medium text-zinc-100">{task.title}</p>
          {subtaskDone > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-500">
              <CheckIcon size={11} /> {subtaskDone}/{task.subtasks.length}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-400">
            {task.projectName}
          </span>
          <span className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-500">
            {task.workspaceName}
          </span>
          {tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-500">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <StatusPill status={task.status} />
      <PriorityBadge priority={task.priority} />

      {task.dueDate && (
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
            overdue ? "bg-red-400/15 text-red-300" : "bg-white/5 text-zinc-400"
          }`}
          title={overdue ? "Overdue" : "Due date"}
        >
          <ClockIcon size={11} />
          {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      )}

      <Avatar name={task.assignedTo?.name || "You"} size={24} className="shrink-0" />
    </Link>
  );
}

export default function TasksPage() {
  const { user } = useAuth();
  const { data, loading } = useResource("/me/tasks");
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const tasks = useMemo(() => data?.tasks || [], [data]);

  const counts = useMemo(() => {
    const map = { ALL: tasks.length };
    STATUSES.forEach((status) => {
      map[status] = tasks.filter((t) => t.status === status).length;
    });
    return map;
  }, [tasks]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter !== "ALL" && task.status !== filter) return false;
      if (!q) return true;
      return (
        String(task.title).toLowerCase().includes(q) ||
        String(task.projectName).toLowerCase().includes(q) ||
        (task.tags || []).some((tag) => String(tag).toLowerCase().includes(q))
      );
    });
  }, [tasks, filter, query]);

  const inProgress = counts["IN PROGRESS"] || 0;
  const overdue = tasks.filter((t) => isOverdue(t.dueDate, t.status)).length;

  return (
    <ProtectedRoute>
      <div className="ws-canvas relative min-h-dvh text-zinc-200">
        <div className="ws-glow left-[-8%] top-[-12%] h-[360px] w-[360px] bg-blue-600/18" />
        <div className="ws-glow right-[-8%] top-[28%] h-[340px] w-[340px] bg-purple-600/14" />

        <div className="relative z-10 min-h-dvh">
          <GlobalNav />

          <main className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-zinc-500">Assigned to you</p>
                <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-white">My Tasks</h1>
                <p className="mt-1 text-[14px] text-zinc-400">
                  {tasks.length} total · {inProgress} in progress · {overdue} overdue
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  <SearchIcon size={15} />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your tasks…"
                  className="ws-input w-full rounded-xl py-2.5 pl-9 pr-3.5 text-[13.5px]"
                />
              </div>
            </header>

            <div className="mt-6 flex gap-1.5 overflow-x-auto pb-1 ws-scroll">
              {TABS.map((tab) => {
                const active = filter === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors ${
                      active
                        ? "border-white/20 bg-white/12 text-white"
                        : "border-white/8 bg-white/[0.03] text-zinc-400 hover:border-white/16 hover:text-zinc-100"
                    }`}
                  >
                    {tab === "ALL" ? "All" : tab}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${
                        active ? "bg-white/15 text-white" : "bg-white/5 text-zinc-500"
                      }`}
                    >
                      {counts[tab] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            {loading && tasks.length === 0 ? (
              <div className="mt-6 space-y-2.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-[64px] animate-pulse rounded-xl border border-white/6 bg-white/[0.03]" />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <EmptyState
                icon={<ListTasksIcon size={20} />}
                title="No tasks assigned to you"
                description="Tasks assigned to you across your workspaces will show up here."
                className="mt-6"
              />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={<SearchIcon size={20} />}
                title="No matching tasks"
                description={`Nothing found${filter === "ALL" ? "" : ` in ${filter}`}${query ? ` for “${query}”` : ""}.`}
                className="mt-6"
              />
            ) : (
              <div className="mt-6 space-y-2.5">
                {visible.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
                {visible.length > 0 && user && (
                  <p className="pt-2 text-center text-[11.5px] text-zinc-600">
                    Showing {visible.length} of {tasks.length} assigned tasks
                  </p>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
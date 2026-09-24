"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import "../../../workspace.css";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import GlobalNav from "@/components/workspace/GlobalNav";
import EmptyState from "@/components/workspace/EmptyState";
import Avatar from "@/components/workspace/Avatar";
import TaskFormModal from "@/components/workspace/TaskFormModal";
import {
  ArrowLeftIcon,
  PlusIcon,
  ListTasksIcon,
  SearchIcon,
  ClockIcon,
  CheckIcon,
} from "@/components/workspace/icons";
import { useResource } from "@/hooks/useResource";
import {
  TASK_STATUSES,
  TASK_PRIORITY_META,
  taskStatusMeta,
  taskPriorityMeta,
  isOverdue,
  formatDate,
} from "@/lib/workspaceApi";

const LEGACY_STATUS_FILTERS = ["TO DO", "IN PROGRESS", "REVIEW", "DONE", "BLOCKED"];
const STATUS_FILTERS = ["ALL", ...TASK_STATUSES, ...LEGACY_STATUS_FILTERS];
const PRIORITY_FILTERS = ["ALL", ...Object.keys(TASK_PRIORITY_META)];

function Pill({ meta, children }) {
  return (
    <span
      className="shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
      style={{
        color: meta.color,
        backgroundColor: `${meta.color}14`,
        borderColor: `${meta.color}33`,
      }}
    >
      {children || meta.label}
    </span>
  );
}

function TaskRow({ task }) {
  const href = `/projects/${task.projectId}/tasks/${task.id}`;
  const overdue = isOverdue(task);
  const meta = taskStatusMeta(task.status);
  const priority = taskPriorityMeta(task.priority);
  const subtaskDone = (task.subtasks || []).filter((s) => s.completed).length;

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
          {(task.tags || []).slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-500">
              {tag}
            </span>
          ))}
          {task.progress !== null && (
            <span className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-500">
              {task.progress}% complete
            </span>
          )}
        </div>
      </div>

      <Pill meta={meta} />
      <Pill meta={priority} />

      {task.dueDate && (
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
            overdue ? "bg-red-400/15 text-red-300" : "bg-white/5 text-zinc-400"
          }`}
          title={overdue ? "Overdue" : "Due date"}
        >
          <ClockIcon size={11} />
          {formatDate(task.dueDate)}
        </span>
      )}

      <Avatar name={task.assignee?.name} size={26} className="shrink-0" />
    </Link>
  );
}

export default function ProjectTasksPage() {
  const params = useParams();
  const projectId = String(params.projectId);

  const { data: projectData, loading: projectLoading, error: projectError } = useResource(`/projects/${projectId}`);
  const { data: tasksData, loading: tasksLoading, refetch: refetchTasks } = useResource(
    `/projects/${projectId}/tasks`
  );

  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const project = projectData?.project;
  const tasks = useMemo(() => tasksData?.tasks || [], [tasksData]);
  const assignableMembers = useMemo(() => tasksData?.assignableMembers || [], [tasksData]);
  const role = project?.role || "";

  const canManage = ["WORKSPACE_OWNER", "ADMIN", "PROJECT_MANAGER"].includes(role);

  const counts = useMemo(() => {
    const map = { ALL: tasks.length };
    STATUS_FILTERS.forEach((s) => {
      if (s !== "ALL") map[s] = tasks.filter((t) => t.status === s).length;
    });
    return map;
  }, [tasks]);

  const visibleStatusFilters = useMemo(
    () => STATUS_FILTERS.filter((s) => s === "ALL" || counts[s]),
    [counts]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter !== "ALL" && task.status !== filter) return false;
      if (priorityFilter !== "ALL" && task.priority !== priorityFilter) return false;
      if (assigneeFilter !== "ALL" && String(task.assignedTo || "") !== assigneeFilter) return false;
      if (!q) return true;
      return (
        String(task.title).toLowerCase().includes(q) ||
        (task.tags || []).some((tag) => String(tag).toLowerCase().includes(q))
      );
    });
  }, [tasks, filter, priorityFilter, assigneeFilter, query]);

  if (projectLoading || tasksLoading) {
    return (
      <ProtectedRoute>
        <div className="ws-canvas relative min-h-dvh text-zinc-200">
          <div className="relative z-10">
            <GlobalNav />
            <main className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
              <div className="h-7 w-52 animate-pulse rounded-lg border border-white/6 bg-white/[0.03]" />
              <div className="mt-6 space-y-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-[60px] animate-pulse rounded-xl border border-white/6 bg-white/[0.03]" />
                ))}
              </div>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (projectError?.status === 403 || !project) {
    return (
      <ProtectedRoute>
        <div className="ws-canvas relative min-h-dvh text-zinc-200">
          <div className="relative z-10">
            <GlobalNav />
            <main className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
              <EmptyState
                icon={<ListTasksIcon size={20} />}
                title="Project not available"
                description="It may have been deleted or you may not have access."
                action={
                  <Link
                    href="/projects"
                    className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                  >
                    Back to projects
                  </Link>
                }
              />
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="ws-canvas relative min-h-dvh text-zinc-200">
        <div className="ws-glow left-[-8%] top-[-12%] h-[360px] w-[360px] bg-blue-600/18" />
        <div className="ws-glow right-[-8%] top-[28%] h-[340px] w-[340px] bg-purple-600/14" />

        <div className="relative z-10 min-h-dvh">
          <GlobalNav />

          <main className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
            <Link
              href={`/projects/${projectId}`}
              className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 transition-colors hover:text-white"
            >
              <ArrowLeftIcon size={15} /> {project.name}
            </Link>

            <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-[26px] font-semibold tracking-tight text-white">Tasks</h1>
                <p className="mt-1 text-[14px] text-zinc-400">
                  {tasks.length} total{project.workspace?.name ? ` · ${project.workspace.name}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                  >
                    <PlusIcon size={15} /> New task
                  </button>
                )}
              </div>
            </header>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="relative block">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  <SearchIcon size={15} />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tasks…"
                  className="ws-input w-full rounded-xl py-2.5 pl-9 pr-3.5 text-[13.5px]"
                />
              </label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="ws-input h-11 w-full rounded-xl px-3.5 text-[13.5px]"
                aria-label="Filter by priority"
              >
                {PRIORITY_FILTERS.map((p) => (
                  <option key={p} value={p}>
                    {p === "ALL" ? "All priorities" : `${TASK_PRIORITY_META[p].label}`}
                  </option>
                ))}
              </select>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="ws-input h-11 w-full rounded-xl px-3.5 text-[13.5px]"
                aria-label="Filter by assignee"
              >
                <option value="ALL">All assignees</option>
                <option value="">Unassigned</option>
                {assignableMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1 ws-scroll">
              {visibleStatusFilters.map((tab) => {
                const active = filter === tab;
                const label = tab === "ALL" ? "All" : taskStatusMeta(tab).label;
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
                    {label}
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

            {tasks.length === 0 ? (
              <EmptyState
                icon={<ListTasksIcon size={20} />}
                title="No tasks yet"
                description="Create the first task for this project, or add tasks from the board."
                className="mt-6"
                action={
                  canManage ? (
                    <button
                      type="button"
                      onClick={() => setShowCreate(true)}
                      className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                    >
                      Create task
                    </button>
                  ) : (
                    <Link
                      href={`/projects/${projectId}`}
                      className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                    >
                      Back to project
                    </Link>
                  )
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={<SearchIcon size={20} />}
                title="No matching tasks"
                description="Try adjusting your filters or search term."
                className="mt-6"
              />
            ) : (
              <div className="mt-6 space-y-2.5">
                {visible.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            )}
          </main>
        </div>

        <TaskFormModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          project={project}
          assignableMembers={assignableMembers}
          onSubmit={() => {
            refetchTasks();
          }}
        />
      </div>
    </ProtectedRoute>
  );
}
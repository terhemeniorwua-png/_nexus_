"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import { useResource } from "@/hooks/useResource";
import "../workspace.css";
import GlobalNav from "@/components/workspace/GlobalNav";
import EmptyState from "@/components/workspace/EmptyState";
import ProgressBar from "@/components/workspace/ProgressBar";
import { BoardIcon, PlusIcon, UsersIcon, CalendarIcon, CheckIcon } from "@/components/workspace/icons";
import Avatar from "@/components/workspace/Avatar";
import { ProjectStatusBadge, ProjectPriorityBadge } from "@/components/workspace/ProjectBadge";
import { formatDate, PROJECT_STATUS_META, PROJECT_PRIORITY_META } from "@/lib/workspaceApi";

const STATUS_FILTERS = ["", ...Object.keys(PROJECT_STATUS_META)];
const PRIORITY_FILTERS = ["", ...Object.keys(PROJECT_PRIORITY_META)];

function ProjectsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") || "";
  const priorityFilter = searchParams.get("priority") || "";

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [statusFilter, priorityFilter]);

  const { data, loading, error } = useResource(`/projects${query}`, { deps: [query] });
  const { data: metaData } = useResource("/projects/meta");

  const projects = data?.projects || [];
  const canCreate = (metaData?.workspaces?.length || 0) > 0;
  const showFilters = projects.length > 0 || statusFilter || priorityFilter;

  function setFilter(key, value) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(params.toString() ? `/projects?${params.toString()}` : "/projects");
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-white">Projects</h1>
          <p className="mt-1 text-[14px] text-zinc-400">
            Every project across your workspaces.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/projects/new"
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13.5px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            <PlusIcon size={16} /> New project
          </Link>
        )}
      </header>

      {error && (
        <p className="mt-6 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
          {error.message}
        </p>
      )}

      {showFilters && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-zinc-400">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setFilter("status", e.target.value)}
              className="ws-input h-10 rounded-lg px-3 text-[13.5px]"
            >
              <option value="">All</option>
              {STATUS_FILTERS.filter(Boolean).map((value) => (
                <option key={value} value={value}>
                  {PROJECT_STATUS_META[value].label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-[12.5px] text-zinc-400">
            Priority
            <select
              value={priorityFilter}
              onChange={(e) => setFilter("priority", e.target.value)}
              className="ws-input h-10 rounded-lg px-3 text-[13.5px]"
            >
              <option value="">All</option>
              {PRIORITY_FILTERS.filter(Boolean).map((value) => (
                <option key={value} value={value}>
                  {PROJECT_PRIORITY_META[value].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {loading && projects.length === 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl border border-white/6 bg-white/[0.03]" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<BoardIcon size={20} />}
            title={statusFilter || priorityFilter ? "No projects match these filters" : "No projects yet"}
            description={
              statusFilter || priorityFilter
                ? "Try a different status or priority filter."
                : "Create your first project to get started."
            }
            action={
              canCreate ? (
                <Link
                  href="/projects/new"
                  className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                >
                  New project
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const total = project.stats?.taskCount || 0;
            const done = project.stats?.doneCount || 0;
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="ws-card group flex flex-col rounded-2xl p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ProjectStatusBadge status={project.status} />
                    <ProjectPriorityBadge priority={project.priority} />
                  </div>
                  <span className="truncate rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-400">
                    {project.workspace?.name}
                  </span>
                </div>

                <p className="mt-4 text-[15px] font-semibold text-white">{project.name}</p>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-zinc-500">
                  {project.description || "No description yet."}
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <Avatar name={project.manager?.name} avatar={project.manager?.avatar} size={26} />
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-zinc-200">{project.manager?.name || "No manager"}</p>
                    <p className="truncate text-[11px] text-zinc-500">{project.team?.name} team</p>
                  </div>
                </div>

                {total > 0 ? (
                  <div className="mt-4">
                    <ProgressBar
                      value={project.progress}
                      label="Project progress"
                      size="sm"
                      className="[&>div:first-child]:mb-1.5"
                    />
                    <p className="mt-1.5 text-[10.5px] text-zinc-500">
                      {done} of {total} tasks done
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-[11px] text-zinc-600">No tasks yet</p>
                )}

                <div className="mt-4 flex items-center gap-4 border-t border-white/8 pt-3.5 text-[12px] text-zinc-500">
                  {project.startDate && (
                    <span className="flex items-center gap-1.5">
                      <CalendarIcon size={13} /> {formatDate(project.startDate)}
                    </span>
                  )}
                  {project.dueDate && (
                    <span className="flex items-center gap-1.5">
                      <CheckIcon size={13} /> {formatDate(project.dueDate)}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5">
                    <UsersIcon size={13} /> {project.stats?.memberCount || 0}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <ProtectedRoute>
      <div className="ws-canvas relative min-h-dvh text-zinc-200">
        <div className="ws-glow left-[-8%] top-[-12%] h-[360px] w-[360px] bg-blue-600/20" />
        <div className="ws-glow right-[-10%] top-[35%] h-[320px] w-[320px] bg-purple-600/15" />

        <div className="relative z-10 min-h-dvh">
          <GlobalNav />
          <main className="mx-auto w-full py-10 md:py-12">
            <Suspense fallback={null}>
              <ProjectsPageInner />
            </Suspense>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
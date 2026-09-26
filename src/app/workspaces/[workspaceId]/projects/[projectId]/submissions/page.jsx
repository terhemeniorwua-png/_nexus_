"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useResource } from "@/hooks/useResource";
import EmptyState from "@/components/workspace/EmptyState";
import { ChevronRightIcon, FileTextIcon, SearchIcon } from "@/components/workspace/icons";
import {
  DELIVERABLE_ENDPOINTS,
  DELIVERABLE_STATUSES,
  deliverableStatusMeta,
  formatRelative,
} from "@/lib/workspaceApi";

const EMPTY_FILTERS = { search: "", status: "" };

function Pill({ color, children }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium"
      style={{ backgroundColor: `${color}1f`, color }}
    >
      {children}
    </span>
  );
}

export default function ProjectSubmissionsPage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);
  const projectId = String(params.projectId);

  const { data, loading, error } = useResource(
    DELIVERABLE_ENDPOINTS.projectList(workspaceId, projectId)
  );

  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const all = useMemo(() => data?.deliverables || [], [data]);

  // Counts come from the unfiltered list so the chips stay stable while
  // searching, matching how the project resources page filters.
  const counts = useMemo(() => {
    const acc = {};
    for (const row of all) acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, [all]);

  const submissions = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return all.filter((row) => {
      if (filters.status && row.status !== filters.status) return false;
      if (!term) return true;
      return [row.title, row.taskTitle, row.createdBy?.name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [all, filters.search, filters.status]);

  const setFilter = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  if (loading && all.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
        <div className="h-8 w-52 animate-pulse rounded-lg border border-white/6 bg-white/[0.03]" />
        <div className="mt-6 space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-xl border border-white/6 bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
        <p
          className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300"
          role="alert"
        >
          {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight text-white">Submissions</h1>
        <p className="mt-1 text-[13.5px] text-zinc-400">
          Every file submitted against this project&apos;s tasks, newest first.
        </p>
      </header>

      {all.length > 0 ? (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter({ status: "" })}
              className={`rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
                filters.status === ""
                  ? "border-white/25 bg-white/10 text-white"
                  : "border-white/8 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
              }`}
            >
              All {all.length}
            </button>
            {DELIVERABLE_STATUSES.map((status) => {
              const count = counts[status] || 0;
              if (count === 0) return null;
              const meta = deliverableStatusMeta(status);
              const active = filters.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter({ status: active ? "" : status })}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-colors"
                  style={
                    active
                      ? { backgroundColor: `${meta.color}1f`, borderColor: `${meta.color}55`, color: meta.color }
                      : undefined
                  }
                >
                  <span
                    className={active ? "h-1.5 w-1.5 rounded-full" : "h-1.5 w-1.5 rounded-full opacity-50"}
                    style={{ backgroundColor: meta.color }}
                  />
                  <span className={active ? "" : "text-zinc-400"}>
                    {meta.label} {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative mt-4">
            <SearchIcon
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              value={filters.search}
              onChange={(event) => setFilter({ search: event.target.value })}
              placeholder="Search submissions"
              aria-label="Search submissions"
              className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-3 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
            />
          </div>
        </>
      ) : null}

      {submissions.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<FileTextIcon size={20} />}
            title={all.length === 0 ? "No submissions yet" : "Nothing matches"}
            description={
              all.length === 0
                ? "Files submitted from a task in this project will collect here."
                : "Try a different search term or status filter."
            }
          />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {submissions.map((row) => {
            const meta = deliverableStatusMeta(row.status);
            const latest = row.currentVersionData;
            return (
              <Link
                key={row.id}
                href={`/projects/${projectId}/tasks/${row.taskId}`}
                className="group flex items-center gap-3.5 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3.5 transition-colors hover:border-white/14 hover:bg-white/[0.045]"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                >
                  <FileTextIcon size={16} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-zinc-100">{row.title}</p>
                  <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                    {row.taskTitle ? (
                      <span className="text-zinc-400">{row.taskTitle}</span>
                    ) : (
                      <span className="italic text-zinc-600">Task unavailable</span>
                    )}
                    {latest?.fileName ? (
                      <>
                        {" · "}
                        <span className="font-mono">{latest.fileName}</span>
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-[12px] text-zinc-400">
                    {row.createdBy?.name || "Unknown"}
                  </p>
                  <p className="text-[11.5px] text-zinc-600">
                    v{row.currentVersion || 1}
                    {row.versionCount > 1 ? ` of ${row.versionCount}` : ""} ·{" "}
                    {formatRelative(row.updatedAt || row.createdAt)}
                  </p>
                </div>

                <Pill color={meta.color}>{meta.label}</Pill>
                <ChevronRightIcon
                  size={15}
                  className="shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-300"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

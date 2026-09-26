"use client";

import ProgressBar from "../ProgressBar";
import { BoardIcon, ListTasksIcon, CheckIcon, ClockIcon, FlagIcon } from "../icons";

/**
 * Phase 21 — the overview figures.
 *
 * Purely presentational. Every number arrives as a prop from
 * `GET /api/me/manager-dashboard` and the progress bar renders the percentage
 * the backend computed; nothing here re-derives a statistic, so the cards
 * cannot disagree with the lists shown beneath them.
 *
 * While `loading` is true the cards render skeletons rather than zeros —
 * "0 tasks" for a request still in flight reads as a real answer and jumps when
 * the numbers land.
 */
function Card({ icon, label, value, accent, tone, children }) {
  return (
    <div className="ws-card flex items-center gap-4 rounded-2xl p-[18px]">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10"
        style={{ color: accent, backgroundColor: `${accent}14` }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[24px] font-bold leading-none text-white">{value}</p>
        <p className="mt-1.5 truncate text-[12px] font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="ws-card flex h-[86px] animate-pulse items-center gap-4 rounded-2xl p-[18px]">
      <span className="h-11 w-11 shrink-0 rounded-xl border border-white/10 bg-white/5" />
      <div className="flex-1 space-y-2">
        <div className="h-5 w-12 rounded bg-white/8" />
        <div className="h-2.5 w-20 rounded bg-white/5" />
      </div>
    </div>
  );
}

/**
 * The workflow states shown in the distribution, in pipeline order.
 *
 * Ordered deliberately rather than sorted by size: this is a pipeline, and a
 * manager reads it left to right to see where work is piling up. Legacy
 * statuses appear only when the project actually contains them.
 */
const DISTRIBUTION = [
  { key: "ASSIGNED", label: "Assigned", color: "#8b8b91" },
  { key: "IN_PROGRESS", label: "In progress", color: "#3b82f6" },
  { key: "IN PROGRESS", label: "In progress (legacy)", color: "#3b82f6" },
  { key: "SUBMITTED", label: "Submitted", color: "#a855f7" },
  { key: "REVIEW", label: "Review (legacy)", color: "#a855f7" },
  { key: "UNDER_REVIEW", label: "Under review", color: "#eab308" },
  { key: "CHANGES_REQUESTED", label: "Changes requested", color: "#f97316" },
  { key: "BLOCKED", label: "Blocked", color: "#ef4444" },
  { key: "APPROVED", label: "Approved", color: "#22c55e" },
  { key: "DONE", label: "Done (legacy)", color: "#22c55e" },
  { key: "TO DO", label: "To do (legacy)", color: "#8b8b91" },
];

export default function ManagerOverview({ overview, pendingCount, loading, error }) {
  if (error) {
    return (
      <div
        className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-5 py-6"
        role="alert"
      >
        <p className="text-[13px] font-semibold text-red-200">Overview unavailable</p>
        <p className="mt-1 text-[12.5px] text-red-200/70">{error}</p>
      </div>
    );
  }

  if (loading || !overview) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  const {
    projects = 0,
    tasks = 0,
    completedTasks = 0,
    activeTasks = 0,
    overdueTasks = 0,
    blockedTasks = 0,
    progress = 0,
    byStatus = {},
  } = overview;

  const bars = DISTRIBUTION.filter((entry) => (byStatus[entry.key] || 0) > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          icon={<ListTasksIcon size={18} />}
          label="Open tasks"
          value={activeTasks}
          accent="#3b82f6"
        >
          <p className="mt-1 text-[11.5px] text-zinc-600">
            {tasks} total · {completedTasks} completed
          </p>
        </Card>

        <Card
          icon={<CheckIcon size={18} />}
          label="Completion"
          value={`${progress}%`}
          accent="#22c55e"
          tone="emerald"
        >
          <div className="mt-2">
            <ProgressBar
              value={progress}
              size="sm"
              tone="emerald"
              showValue={false}
              label={`${completedTasks} of ${tasks} tasks completed`}
            />
          </div>
        </Card>

        <Card
          icon={<ClockIcon size={18} />}
          label="Awaiting review"
          value={pendingCount ?? 0}
          accent="#eab308"
        >
          <p className="mt-1 text-[11.5px] text-zinc-600">
            {underReviewCount(byStatus)} in review · {submittedCount(byStatus)} submitted
          </p>
        </Card>

        <Card
          icon={<FlagIcon size={18} />}
          label="Needs attention"
          value={overdueTasks + blockedTasks}
          accent="#ef4444"
        >
          <p className="mt-1 text-[11.5px] text-zinc-600">
            {overdueTasks} overdue · {blockedTasks} blocked
          </p>
        </Card>
      </div>

      {bars.length > 0 && (
        <div className="ws-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <BoardIcon size={14} /> Where the work is
            </h3>
            <span className="text-[11.5px] text-zinc-600">{projects} projects in scope</span>
          </div>
          <ul className="space-y-2">
            {bars.map((entry) => {
              const count = byStatus[entry.key] || 0;
              const share = tasks > 0 ? Math.round((count / tasks) * 100) : 0;
              return (
                <li key={entry.key} className="flex items-center gap-3">
                  <span className="w-[132px] shrink-0 truncate text-[12px] text-zinc-400">
                    {entry.label}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${share}%`, backgroundColor: entry.color }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11.5px] tabular-nums text-zinc-500">
                    {count} · {share}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function submittedCount(byStatus) {
  return (byStatus.SUBMITTED || 0) + (byStatus.REVIEW || 0);
}

function underReviewCount(byStatus) {
  return byStatus.UNDER_REVIEW || 0;
}

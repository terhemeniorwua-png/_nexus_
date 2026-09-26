"use client";

import ProgressBar from "../ProgressBar";
import { GridIcon, ListTasksIcon, CheckIcon } from "../icons";

/**
 * Phase 20 — the three summary cards.
 *
 * Purely presentational: every value arrives as a prop from
 * `GET /api/me/dashboard`, and the progress bar renders that number rather than
 * deriving one. Nothing here computes a statistic, so there is no way for the
 * UI and the database to disagree.
 *
 * While `loading` is true the cards render skeletons rather than zeros —
 * showing "0 projects" for a request still in flight reads as a real answer
 * and causes a layout shift when the numbers arrive.
 */
function Card({ icon, label, value, sub, accent, children }) {
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
        {children || (sub ? <p className="mt-1 text-[11.5px] text-zinc-600">{sub}</p> : null)}
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

export default function StatCards({ stats, loading }) {
  if (loading || !stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  const { projects = 0, tasks = 0, completedTasks = 0, progress = 0 } = stats;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card
        icon={<GridIcon size={18} />}
        label="Projects"
        value={projects}
        accent="#3b82f6"
        sub={projects === 1 ? "1 project you can open" : `${projects} projects you can open`}
      />

      <Card
        icon={<ListTasksIcon size={18} />}
        label="My tasks"
        value={tasks}
        accent="#a855f7"
        sub={tasks === 0 ? "Nothing assigned to you" : `${tasks} assigned to you`}
      />

      <Card icon={<CheckIcon size={18} />} label="Progress" value={`${progress}%`} accent="#22c55e">
        <div className="mt-2">
          <ProgressBar
            value={progress}
            size="sm"
            tone="emerald"
            showValue={false}
            label={`${completedTasks} of ${tasks} tasks completed`}
          />
        </div>
        <p className="mt-1.5 text-[11.5px] text-zinc-600">
          {tasks === 0 ? "No tasks to complete yet" : `${completedTasks} of ${tasks} completed`}
        </p>
      </Card>
    </div>
  );
}

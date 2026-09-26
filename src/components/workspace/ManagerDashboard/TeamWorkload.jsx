"use client";

import Avatar from "../Avatar";
import EmptyState from "../EmptyState";
import ProgressBar from "../ProgressBar";
import { UsersIcon } from "../icons";

/**
 * Phase 21 — team workload.
 *
 * The bar is a share of the busiest person's open-task count, not a share of
 * capacity. Tasks have no estimate, effort or capacity field anywhere in the
 * schema, so there is no honest denominator for "how full is this person" —
 * the panel therefore says "open tasks" and nothing stronger, and the
 * "Busiest" marker is a relative comparison within the visible list.
 *
 * Completed work is excluded because a manager asking "who is overloaded" is
 * asking about work still to do.
 */
const MAX_BAR = 100;

function shareOf(value, max) {
  if (!max) return 0;
  return Math.max(3, Math.round((value / max) * MAX_BAR));
}

export default function TeamWorkload({ workload, loading, error }) {
  if (error) {
    return (
      <div
        className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-5 py-6"
        role="alert"
      >
        <p className="text-[13px] font-semibold text-red-200">Workload unavailable</p>
        <p className="mt-1 text-[12.5px] text-red-200/70">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-[46px] animate-pulse rounded-xl bg-white/[0.03]" aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (!workload || workload.length === 0) {
    return (
      <EmptyState
        icon={<UsersIcon size={18} />}
        title="No open work"
        description="Nobody has an unfinished task in this scope."
        className="py-8"
      />
    );
  }

  const max = Math.max(...workload.map((row) => row.open));

  return (
    <div className="space-y-2.5">
      {workload.map((row) => (
        <div key={row.userId || "unassigned"} className="ws-card rounded-xl px-3.5 py-3">
          <div className="flex items-center gap-3">
            <Avatar name={row.name} size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[13px] font-semibold text-white">
                  {row.name}
                  {row.open === max && workload.length > 1 && (
                    <span className="ml-2 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      Busiest
                    </span>
                  )}
                </p>
                <p className="shrink-0 text-[12px] tabular-nums text-zinc-400">
                  {row.open} open
                </p>
              </div>

              <div className="mt-1.5">
                <ProgressBar value={shareOf(row.open, max)} size="sm" tone="blue" showValue={false} />
              </div>

              <p className="mt-1.5 text-[11px] text-zinc-600">
                {row.inProgress} in progress
                {row.submitted + row.underReview > 0
                  ? ` · ${row.submitted + row.underReview} in review`
                  : ""}
                {row.highPriority > 0 ? ` · ${row.highPriority} high/urgent` : ""}
                {row.overdue > 0 ? (
                  <span className="text-red-400"> · {row.overdue} overdue</span>
                ) : null}
              </p>
            </div>
          </div>
        </div>
      ))}

      <p className="px-1 pt-1 text-[11px] leading-relaxed text-zinc-600">
        Counts are open (unfinished) tasks per person. Nexus stores no effort or
        capacity estimates, so this is a workload signal, not a utilisation
        percentage.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "../Avatar";
import EmptyState from "../EmptyState";
import {
  apiRequest,
  formatRelative,
  TASK_STATUS_META,
} from "@/lib/workspaceApi";
import { DocIcon, ClockIcon, CheckIcon, XIcon } from "../icons";

/**
 * Phase 21 — the review queue.
 *
 * Each row is one item of real pending work, and the buttons on it call the
 * endpoints that already existed and are already permission-gated:
 *
 *   deliverable row → PATCH /api/deliverables/:id/versions/:n/{review,approve,request-changes}
 *   task row        → PATCH /api/tasks/:taskId/status
 *
 * Nothing here performs an authorisation decision. The buttons shown come from
 * the payload's `actions` object, which mirrors the workflow's transition rules
 * on the server, and the server re-checks the same rules when the call arrives —
 * so a stale or hand-crafted client cannot approve work it may not approve.
 *
 * The single most important behaviour is that a decision must visibly change the
 * page: every successful call refreshes from the server rather than patching
 * local state, so what stays on screen is what the database now says.
 */
function statusMeta(status) {
  return TASK_STATUS_META[status] || { label: status, color: "#8b8b91" };
}

function ReviewRow({ row, onRefresh }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const meta = statusMeta(row.status);

  async function run(action, { body } = {}) {
    setBusy(action);
    setError(null);
    try {
      if (row.kind === "deliverable") {
        await apiRequest(
          `/deliverables/${row.deliverableId}/versions/${row.version}/${action}`,
          { method: "PATCH", body }
        );
      } else {
        // Task-level review uses the one status endpoint the workflow allows.
        const target = action === "review" ? "UNDER_REVIEW" : action === "approve" ? "APPROVED" : "CHANGES_REQUESTED";
        await apiRequest(`/tasks/${row.taskId}/status`, {
          method: "PATCH",
          body: { status: target },
        });
      }
      setFeedbackOpen(false);
      setFeedback("");
      // Refetch rather than mutate: the queue, the overview counts and the
      // workload all shift when work is approved, and only the server knows by
      // how much.
      await onRefresh();
    } catch (err) {
      setError(err?.message || "That action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="ws-card rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold"
              style={{ color: meta.color, backgroundColor: `${meta.color}1f` }}
            >
              {meta.label}
            </span>
            {row.kind === "deliverable" ? (
              <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                <DocIcon size={12} /> v{row.version}
                {row.fileName ? ` · ${row.fileName}` : ""}
              </span>
            ) : (
              <span className="text-[11px] text-zinc-500">Task submission</span>
            )}
            {row.projectName && (
              <span className="truncate text-[11px] text-zinc-600">{row.projectName}</span>
            )}
          </div>

          <p className="mt-1.5 truncate text-[13.5px] font-semibold text-white">{row.title}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-zinc-500">
            {row.submittedBy && (
              <span className="flex items-center gap-1.5">
                <Avatar name={row.submittedBy.name} size={18} />
                {row.submittedBy.name}
              </span>
            )}
            {row.submittedAt && (
              <span className="flex items-center gap-1">
                <ClockIcon size={12} /> submitted {formatRelative(row.submittedAt)}
              </span>
            )}
            {row.taskId && (
              <Link
                href={`/projects/${row.projectId}/board`}
                className="transition-colors hover:text-white"
              >
                Open board
              </Link>
            )}
          </div>

          {row.lastReview && (
            <p className="mt-2 rounded-lg border border-orange-500/20 bg-orange-500/[0.06] px-2.5 py-2 text-[11.5px] text-orange-200/80">
              <span className="font-semibold text-orange-200">
                {row.lastReview.decision === "APPROVED" ? "Approved" : "Changes requested"}
              </span>
              {row.lastReview.reviewerName ? ` by ${row.lastReview.reviewerName}` : ""}
              {row.lastReview.reviewedAt ? ` · ${formatRelative(row.lastReview.reviewedAt)}` : ""}
              {row.lastReview.feedback ? ` — “${row.lastReview.feedback}”` : ""}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {row.actions.startReview && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run("review")}
              className="rounded-lg border border-white/12 px-2.5 py-1.5 text-[12px] font-semibold text-zinc-200 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
            >
              {busy === "review" ? "Starting…" : "Start review"}
            </button>
          )}

          {row.actions.approve && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run("approve")}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              <CheckIcon size={13} />
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
          )}

          {row.actions.requestChanges && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => setFeedbackOpen((open) => !open)}
              className="flex items-center gap-1.5 rounded-lg border border-orange-500/30 px-2.5 py-1.5 text-[12px] font-semibold text-orange-200 transition-colors hover:bg-orange-500/10 disabled:opacity-50"
            >
              <XIcon size={13} /> Request changes
            </button>
          )}
        </div>
      </div>

      {feedbackOpen && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <label
            htmlFor={`feedback-${row.id}`}
            className="text-[11.5px] font-medium uppercase tracking-wide text-zinc-500"
          >
            Feedback for {row.submittedBy?.name || "the submitter"}
          </label>
          <textarea
            id={`feedback-${row.id}`}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={2}
            placeholder="What needs to change before this can be approved?"
            className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-zinc-600 focus:border-white/25"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => setFeedbackOpen(false)}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-400 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || feedback.trim().length === 0}
              onClick={() => run("request-changes", { body: { feedback: feedback.trim() } })}
              className="rounded-lg bg-orange-600 px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
            >
              {busy === "request-changes" ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11.5px] text-red-300" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

export default function PendingReviews({ reviews, loading, error, onRefresh }) {
  if (error) {
    return (
      <div
        className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-5 py-6"
        role="alert"
      >
        <p className="text-[13px] font-semibold text-red-200">Review queue unavailable</p>
        <p className="mt-1 text-[12.5px] text-red-200/70">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="ws-card h-[92px] animate-pulse rounded-2xl p-4"
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <EmptyState
        icon={<CheckIcon size={18} />}
        title="Nothing waiting on you"
        description="No submissions are awaiting review in this scope."
        className="py-8"
      />
    );
  }

  return (
    <ul className="space-y-2.5">
      {reviews.map((row) => (
        <ReviewRow key={row.id} row={row} onRefresh={onRefresh} />
      ))}
    </ul>
  );
}

/** Exported for the page header, so the count and the list cannot disagree. */
export function awaitingReviewLabel(count) {
  if (count === 0) return "No submissions waiting";
  return count === 1 ? "1 submission waiting" : `${count} submissions waiting`;
}

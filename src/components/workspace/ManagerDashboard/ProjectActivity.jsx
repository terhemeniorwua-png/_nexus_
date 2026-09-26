"use client";

import Avatar from "../Avatar";
import EmptyState from "../EmptyState";
import { formatRelative } from "@/lib/workspaceApi";
import {
  ActivityIcon,
  BoardIcon,
  DocIcon,
  CheckIcon,
  XIcon,
  SparkIcon,
  UsersIcon,
  ChatIcon,
  DotsIcon,
} from "../icons";

/**
 * Phase 21 — project activity.
 *
 * The shared `ActivityFeed` knows only the task/document/membership actions, so
 * a deliverable review — the thing a manager most wants to see here — would fall
 * through to "made an update". This panel labels the deliverable and review
 * actions explicitly instead, and reuses the same `formatRelative` helper and
 * `Avatar` so the two feeds stay visually identical.
 */
const META = {
  TASK_CREATED: { icon: <BoardIcon size={13} />, color: "#3b82f6", verb: "created a task" },
  TASK_STARTED: { icon: <BoardIcon size={13} />, color: "#3b82f6", verb: "started a task" },
  TASK_MOVED: { icon: <BoardIcon size={13} />, color: "#eab308", verb: "moved a task" },
  TASK_UPDATED: { icon: <BoardIcon size={13} />, color: "#a855f7", verb: "updated a task" },
  TASK_COMPLETED: { icon: <CheckIcon size={13} />, color: "#22c55e", verb: "completed a task" },
  TASK_DELETED: { icon: <BoardIcon size={13} />, color: "#ef4444", verb: "deleted a task" },
  SUBTASK_COMPLETED: { icon: <CheckIcon size={13} />, color: "#22c55e", verb: "completed a subtask" },
  DELIVERABLE_CREATED: { icon: <DocIcon size={13} />, color: "#0d9488", verb: "created a deliverable" },
  DELIVERABLE_VERSION_CREATED: {
    icon: <DocIcon size={13} />,
    color: "#0d9488",
    verb: "uploaded a new version",
  },
  DELIVERABLE_SUBMITTED: {
    icon: <DocIcon size={13} />,
    color: "#a855f7",
    verb: "submitted work for review",
  },
  DELIVERABLE_REVIEW_STARTED: {
    icon: <ActivityIcon size={13} />,
    color: "#eab308",
    verb: "started a review",
  },
  DELIVERABLE_APPROVED: {
    icon: <CheckIcon size={13} />,
    color: "#22c55e",
    verb: "approved a submission",
  },
  DELIVERABLE_CHANGES_REQUESTED: {
    icon: <XIcon size={13} />,
    color: "#f97316",
    verb: "requested changes",
  },
  DOCUMENT_CREATED: { icon: <DocIcon size={13} />, color: "#0d9488", verb: "created a document" },
  DOCUMENT_UPDATED: { icon: <DocIcon size={13} />, color: "#0d9488", verb: "edited a document" },
  RESOURCE_ADDED: { icon: <DocIcon size={13} />, color: "#0d9488", verb: "added a resource" },
  PROJECT_UPDATED: { icon: <SparkIcon size={13} />, color: "#22c55e", verb: "updated the project" },
  MEMBERSHIP_UPDATED: { icon: <UsersIcon size={13} />, color: "#8b8b91", verb: "changed the team" },
  MEMBER_INVITED: { icon: <UsersIcon size={13} />, color: "#8b8b91", verb: "invited a member" },
  COMMENT_ADDED: { icon: <ChatIcon size={13} />, color: "#38bdf8", verb: "commented" },
};

const FALLBACK = { icon: <DotsIcon size={13} />, color: "#8b8b91", verb: "made an update" };

export default function ProjectActivity({ activities, loading, error }) {
  if (error) {
    return (
      <div
        className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-5 py-6"
        role="alert"
      >
        <p className="text-[13px] font-semibold text-red-200">Activity unavailable</p>
        <p className="mt-1 text-[12.5px] text-red-200/70">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[40px] animate-pulse rounded-lg bg-white/[0.03]" aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <EmptyState
        icon={<ActivityIcon size={18} />}
        title="No activity yet"
        description="Nothing has happened in this project since it was created."
        className="py-8"
      />
    );
  }

  return (
    <ul className="space-y-0.5">
      {activities.map((activity) => {
        const meta = META[activity.action] || FALLBACK;
        const detail =
          activity.metadata?.title || activity.metadata?.name || activity.metadata?.feedback;

        return (
          <li
            key={activity.id}
            className="flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[0.03]"
          >
            <Avatar name={activity.user?.name} size={26} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] leading-snug text-zinc-400">
                <span className="font-semibold text-zinc-100">
                  {activity.user?.name || "Someone"}
                </span>
                <span style={{ color: meta.color }} className="inline-flex items-center gap-1">
                  {meta.icon}
                </span>
                <span>{meta.verb}</span>
                {detail && (
                  <span className="truncate font-medium text-zinc-300">“{detail}”</span>
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-600">
                {formatRelative(activity.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

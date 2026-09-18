"use client";

import Link from "next/link";
import Avatar from "./Avatar";
import { BoardIcon, DocIcon, SparkIcon, DotsIcon } from "./icons";
import { formatRelative } from "@/lib/workspaceApi";

const META = {
  TASK_CREATED: { icon: <BoardIcon size={14} />, color: "#3b82f6", text: (a) => <span>created task <b className="font-semibold text-zinc-200">&quot;{a.metadata?.title}&quot;</b></span> },
  TASK_MOVED: { icon: <BoardIcon size={14} />, color: "#eab308", text: (a) => <span>moved task <b className="font-semibold text-zinc-200">&quot;{a.metadata?.title}&quot;</b></span> },
  TASK_UPDATED: { icon: <BoardIcon size={14} />, color: "#a855f7", text: (a) => <span>updated task <b className="font-semibold text-zinc-200">&quot;{a.metadata?.title}&quot;</b></span> },
  TASK_DELETED: { icon: <BoardIcon size={14} />, color: "#ef4444", text: (a) => <span>deleted task <b className="font-semibold text-zinc-200">&quot;{a.metadata?.title}&quot;</b></span> },
  PROJECT_CREATED: { icon: <SparkIcon size={14} />, color: "#22c55e", text: (a) => <span>created project <b className="font-semibold text-zinc-200">&quot;{a.metadata?.name}&quot;</b></span> },
  PROJECT_UPDATED: { icon: <SparkIcon size={14} />, color: "#22c55e", text: (a) => <span>updated project <b className="font-semibold text-zinc-200">&quot;{a.metadata?.name}&quot;</b></span> },
  DOCUMENT_CREATED: { icon: <DocIcon size={14} />, color: "#0d9488", text: (a) => <span>created document <b className="font-semibold text-zinc-200">&quot;{a.metadata?.title}&quot;</b></span> },
  DOCUMENT_UPDATED: { icon: <DocIcon size={14} />, color: "#0d9488", text: (a) => <span>edited document <b className="font-semibold text-zinc-200">&quot;{a.metadata?.title}&quot;</b></span> },
  MEMBERSHIP_UPDATED: { icon: <DotsIcon size={14} />, color: "#8b8b91", text: (a) => <span>added {a.metadata?.email || "a member"}</span> },
};

function ActivityRow({ activity, workspaceId }) {
  const ws = workspaceId || activity.workspaceId;
  const action = activity.action || "";
  const meta = META[action] || { icon: <DotsIcon size={14} />, color: "#8b8b91", text: () => <span>made an update</span> };
  const Icon = meta.icon;

  return (
    <div className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
      <Avatar name={activity.userId?.name} size={26} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-zinc-400">
          <span className="font-semibold text-zinc-100">{activity.userId?.name || "Someone"}</span>{" "}
          {meta.text(activity)}
        </p>
        <p className="mt-0.5 text-[11.5px] text-zinc-600">{formatRelative(activity.createdAt)}</p>
      </div>
      {ws && activity.metadata?.projectId && (
        <Link
          href={`/workspaces/${ws}/projects/${activity.metadata.projectId}/board`}
          className="mt-0.5 shrink-0 rounded-md border border-white/8 px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:border-white/20 hover:text-white"
        >
          View
        </Link>
      )}
    </div>
  );
}

export default function ActivityFeed({ activities = [], workspaceId, limit }) {
  const rows = limit ? activities.slice(0, limit) : activities;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-[13px] text-zinc-600">
        Activity will appear here as your team works.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {rows.map((activity) => (
        <ActivityRow key={activity.id} activity={activity} workspaceId={workspaceId} />
      ))}
    </div>
  );
}
"use client";

import Link from "next/link";
import { CheckIcon, ClockIcon, LinkIcon, ListTasksIcon } from "../icons";

// One honest sentence about where a resource came from, shown on the card and
// again on the detail page. Three cases, no fourth: a manager added it, a
// manager added a link, or it was promoted from an approved submission.
export default function KnowledgeSource({ resource, workspaceId, projectId }) {
  const isPromoted = resource?.sourceType === "APPROVED_DELIVERABLE";
  const taskId = resource?.sourceTaskId;

  if (isPromoted) {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-zinc-500">
        <CheckIcon size={13} className="shrink-0 text-emerald-400" />
        <span>
          Created from{" "}
          {taskId ? (
            <Link
              href={`/workspaces/${workspaceId}/projects/${projectId}/board?task=${taskId}`}
              className="text-zinc-300 underline decoration-white/20 underline-offset-2 transition-colors hover:text-white hover:decoration-white/50"
            >
              {resource.sourceTaskTitle || "an approved submission"}
            </Link>
          ) : (
            <span className="text-zinc-300">an approved submission</span>
          )}
        </span>
        {resource.sourceVersionNumber ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon size={12} />
              v{resource.sourceVersionNumber}
            </span>
          </>
        ) : null}
      </p>
    );
  }

  if (resource?.sourceType === "EXTERNAL_LINK") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-zinc-500">
        <LinkIcon size={13} className="shrink-0 text-teal-400" />
        <span>External link added by a project manager</span>
      </p>
    );
  }

  return (
    <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-zinc-500">
      <ListTasksIcon size={13} className="shrink-0 text-zinc-500" />
      <span>Added by {resource?.createdBy?.name || "a project manager"}</span>
    </p>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useResource } from "@/hooks/useResource";
import EmptyState from "@/components/workspace/EmptyState";
import Avatar from "@/components/workspace/Avatar";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  EditIcon,
  ExternalLinkIcon,
  BookIcon,
} from "@/components/workspace/icons";
import { CategoryIcon, TypeIcon } from "@/components/workspace/KnowledgeBase/categoryIcon";
import KnowledgeSource from "@/components/workspace/KnowledgeBase/KnowledgeSource";
import AddResourceModal from "@/components/workspace/KnowledgeBase/AddResourceModal";
import {
  KNOWLEDGE_CATEGORY_META,
  KNOWLEDGE_ENDPOINTS,
  KNOWLEDGE_STATUS_META,
  knowledgeCategoryLabel,
  knowledgeTypeLabel,
} from "@/lib/knowledge";
import { DELIVERABLE_ENDPOINTS, toApiPath, formatRelative } from "@/lib/workspaceApi";

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/6 py-2.5 last:border-b-0">
      <span className="text-[12px] text-zinc-500">{label}</span>
      <span className="text-right text-[12.5px] text-zinc-300">{children}</span>
    </div>
  );
}

export default function KnowledgeDetailPage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);
  const projectId = String(params.projectId);
  const resourceId = String(params.resourceId);

  const { data, loading, error, refetch } = useResource(
    KNOWLEDGE_ENDPOINTS.detail(workspaceId, projectId, resourceId)
  );
  const { run, loading: acting } = useMutation();

  const [editOpen, setEditOpen] = useState(false);
  const [actionError, setActionError] = useState(null);

  const resource = data?.resource || null;
  const backHref = `/workspaces/${workspaceId}/projects/${projectId}/knowledge`;

  // Editing and archiving both need the permission the server reported for this
  // project, so the buttons can never offer something the API will refuse.
  const { data: listData } = useResource(KNOWLEDGE_ENDPOINTS.list(workspaceId, projectId));
  const canUpdate = Boolean(listData?.permissions?.canUpdate);
  const canArchive = Boolean(listData?.permissions?.canArchive);

  const category = KNOWLEDGE_CATEGORY_META[resource?.category] || KNOWLEDGE_CATEGORY_META.OTHER;
  const status = KNOWLEDGE_STATUS_META[resource?.status] || KNOWLEDGE_STATUS_META.APPROVED;
  const archived = resource?.status === "ARCHIVED";

  async function setStatus(next) {
    setActionError(null);
    const result = await run(KNOWLEDGE_ENDPOINTS.setStatus(workspaceId, projectId, resourceId), {
      method: "PATCH",
      body: { status: next },
    });
    if (result.error) {
      setActionError(result.error.message);
      return;
    }
    refetch();
  }

  function downloadSourceFile() {
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"}${toApiPath(
        DELIVERABLE_ENDPOINTS.download(resource.sourceDeliverableId, resource.sourceVersionNumber)
      )}`,
      "_blank",
      "noopener"
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1000px] px-5 py-7 md:px-8">
        <div className="h-6 w-48 animate-pulse rounded-lg bg-white/5" />
        <div className="mt-6 h-64 animate-pulse rounded-2xl border border-white/6 bg-white/[0.02]" />
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="mx-auto w-full max-w-[1000px] px-5 py-7 md:px-8">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeftIcon size={14} />
          Back to knowledge base
        </Link>
        <EmptyState
          className="mt-6"
          icon={<BookIcon size={20} />}
          title={error ? "We couldn't load this resource" : "Resource not found"}
          description={error?.message || "It may have been removed, or it belongs to another project."}
          action={
            <Link
              href={backHref}
              className="rounded-lg border border-white/12 px-3.5 py-2 text-[13px] font-medium text-zinc-200 transition-colors hover:bg-white/5"
            >
              Back to knowledge base
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 py-7 md:px-8">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeftIcon size={14} />
        Back to knowledge base
      </Link>

      <article className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-5 md:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium"
            style={{ backgroundColor: `${category.color}1f`, color: category.color }}
          >
            <CategoryIcon category={resource.category} size={13} />
            {knowledgeCategoryLabel(resource.category)}
          </span>
          <span
            className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium"
            style={{ backgroundColor: `${status.color}1f`, color: status.color }}
          >
            {status.label}
          </span>
          {archived ? (
            <span className="text-[11.5px] text-zinc-500">
              Hidden from the project&apos;s active list.
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 text-[22px] font-semibold leading-tight tracking-tight text-white">
          {resource.title}
        </h1>

        {resource.description ? (
          <p className="mt-2 text-[13.5px] leading-relaxed text-zinc-400">{resource.description}</p>
        ) : null}

        <KnowledgeSource resource={resource} workspaceId={workspaceId} projectId={projectId} />

        {resource.url ? (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-[13px] text-zinc-200 transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            <ExternalLinkIcon size={14} className="text-teal-400" />
            <span className="max-w-[420px] truncate">{resource.url}</span>
          </a>
        ) : null}

        {resource.sourceFile ? (
          <button
            type="button"
            onClick={downloadSourceFile}
            className="mt-4 flex w-full items-center gap-3 rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-zinc-300">
              <TypeIcon resourceType={resource.resourceType} size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-zinc-100">
                {resource.sourceFile.fileName}
              </span>
              <span className="block text-[11.5px] text-zinc-500">
                Approved file{resource.sourceFile.fileSize ? ` · ${Math.round(resource.sourceFile.fileSize / 1024)} KB` : ""}
              </span>
            </span>
            <span className="text-[12px] text-zinc-400">Download</span>
          </button>
        ) : null}

        {resource.content ? (
          <section className="mt-5">
            <h2 className="text-[12px] font-medium uppercase tracking-wide text-zinc-400">Notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-zinc-300">
              {resource.content}
            </p>
          </section>
        ) : null}

        <section className="mt-6 rounded-xl border border-white/6 bg-white/[0.015] px-4 py-1">
          <Row label="Type">{knowledgeTypeLabel(resource.resourceType)}</Row>
          <Row label="Category">{knowledgeCategoryLabel(resource.category)}</Row>
          <Row label="Added by">
            <span className="inline-flex items-center justify-end gap-1.5">
              {resource.createdBy?.name ? (
                <>
                  <Avatar name={resource.createdBy.name} size={20} />
                  {resource.createdBy.name}
                </>
              ) : (
                "—"
              )}
            </span>
          </Row>
          {resource.approvedAt ? (
            <Row label="Approved">
              {formatRelative(resource.approvedAt)}
              {resource.approvedBy?.name ? ` · ${resource.approvedBy.name}` : ""}
            </Row>
          ) : null}
          {resource.updatedAt && resource.updatedAt !== resource.createdAt ? (
            <Row label="Last updated">{formatRelative(resource.updatedAt)}</Row>
          ) : null}
        </section>

        {actionError ? (
          <p className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[12.5px] text-red-300">
            {actionError}
          </p>
        ) : null}

        {canUpdate || canArchive ? (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {canUpdate ? (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
              >
                <EditIcon size={14} />
                Edit
              </button>
            ) : null}

            {canArchive ? (
              <button
                type="button"
                disabled={acting}
                onClick={() => setStatus(archived ? "APPROVED" : "ARCHIVED")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3.5 py-2 text-[13px] font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-60"
              >
                <ArchiveIcon size={14} />
                {acting ? "Working…" : archived ? "Restore" : "Archive"}
              </button>
            ) : null}
          </div>
        ) : null}
      </article>

      {editOpen ? (
        <AddResourceModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={refetch}
          workspaceId={workspaceId}
          projectId={projectId}
          resource={resource}
        />
      ) : null}
    </div>
  );
}

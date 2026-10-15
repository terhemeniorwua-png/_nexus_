"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  KNOWLEDGE_CATEGORY_META,
  KNOWLEDGE_STATUS_META,
  KNOWLEDGE_TYPE_META,
  knowledgeCategoryLabel,
  knowledgeTypeLabel,
} from "@/lib/knowledge";
import { formatRelative } from "@/lib/workspaceApi";
import { CategoryIcon, TypeIcon } from "./categoryIcon";
import KnowledgeSource, { type KnowledgeCardResource } from "./KnowledgeSource";

interface PillProps {
  color: string;
  children: ReactNode;
}

function Pill({ color, children }: PillProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium"
      style={{ backgroundColor: `${color}1f`, color }}
    >
      {children}
    </span>
  );
}

export interface ResourceCardProps {
  resource: KnowledgeCardResource;
  workspaceId: string;
  projectId: string;
}

export default function ResourceCard({ resource, workspaceId, projectId }: ResourceCardProps) {
  const href = `/workspaces/${workspaceId}/projects/${projectId}/knowledge/${resource.id}`;
  const category =
    KNOWLEDGE_CATEGORY_META[resource.category as string] || KNOWLEDGE_CATEGORY_META.OTHER;
  const status =
    KNOWLEDGE_STATUS_META[resource.status as string] || KNOWLEDGE_STATUS_META.APPROVED;
  const type = KNOWLEDGE_TYPE_META[resource.resourceType as string] || KNOWLEDGE_TYPE_META.OTHER;
  const archived = resource.status === "ARCHIVED";
  const addedOn = formatRelative(resource.approvedAt || resource.createdAt);

  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-white/6 bg-white/[0.02] p-4 transition-colors hover:border-white/14 hover:bg-white/[0.045]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${category.color}1a`, color: category.color }}
            title={knowledgeCategoryLabel(resource.category)}
          >
            <CategoryIcon category={resource.category} size={16} />
          </span>
          <Pill color={category.color}>{category.label}</Pill>
        </div>
        {/* Archived resources are rare and easy to miss, so the state is stated
            rather than left to the absence of a colour. */}
        {archived && <Pill color={status.color}>{status.label}</Pill>}
      </div>

      <h3 className="mt-3 line-clamp-2 text-[14.5px] font-semibold leading-snug text-zinc-100 group-hover:text-white">
        {resource.title}
      </h3>

      {resource.description ? (
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-zinc-400">
          {resource.description}
        </p>
      ) : null}

      <KnowledgeSource resource={resource} workspaceId={workspaceId} projectId={projectId} />

      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-[11.5px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <TypeIcon resourceType={resource.resourceType} size={12} />
          {knowledgeTypeLabel(resource.resourceType)}
        </span>
        {addedOn ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{addedOn}</span>
          </>
        ) : null}
      </div>
    </Link>
  );
}

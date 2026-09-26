"use client";

import { formatRelative } from "@/lib/workspaceApi";
import {
  RESOURCE_CATEGORY_META,
  resourceCategoryLabel,
  resourceHost,
} from "@/lib/projectResources";
import { EditIcon, ExternalLinkIcon, TrashIcon } from "../icons";
import ResourceCategoryIcon from "./resourceCategoryIcon";

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

export default function ResourceCard({ resource, canManage, onEdit, onDelete }) {
  const category = RESOURCE_CATEGORY_META[resource.category] || RESOURCE_CATEGORY_META.OTHER;
  const url = String(resource.url || "").trim();
  const host = resourceHost(url);
  const addedOn = formatRelative(resource.createdAt);

  return (
    <article className="group flex flex-col rounded-2xl border border-white/6 bg-white/[0.02] p-4 transition-colors hover:border-white/14 hover:bg-white/[0.045]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${category.color}1a`, color: category.color }}
            title={resourceCategoryLabel(resource.category)}
          >
            <ResourceCategoryIcon category={resource.category} size={16} />
          </span>
          <Pill color={category.color}>{category.label}</Pill>
        </div>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(resource)}
              aria-label={`Edit ${resource.name}`}
              title="Edit"
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/8 hover:text-zinc-100"
            >
              <EditIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(resource)}
              aria-label={`Delete ${resource.name}`}
              title="Delete"
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-400/12 hover:text-red-300"
            >
              <TrashIcon size={14} />
            </button>
          </div>
        ) : null}
      </div>

      <h3 className="mt-3 line-clamp-2 text-[14.5px] font-semibold leading-snug text-zinc-100">
        {/* A resource is only as useful as where it leads, so a stored link is
            the title itself. Without one the name is plain text rather than a
            dead link. */}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-1.5 transition-colors hover:text-white hover:underline"
          >
            <span className="line-clamp-2">{resource.name}</span>
            <ExternalLinkIcon size={13} className="mt-1 shrink-0 opacity-60" />
          </a>
        ) : (
          resource.name
        )}
      </h3>

      {resource.description ? (
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-zinc-400">
          {resource.description}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-[11.5px] text-zinc-500">
        {host ? (
          <>
            <span className="truncate font-mono">{host}</span>
            <span aria-hidden="true">·</span>
          </>
        ) : null}
        {resource.createdBy?.name ? (
          <>
            <span className="truncate">{resource.createdBy.name}</span>
            <span aria-hidden="true">·</span>
          </>
        ) : null}
        {addedOn ? <span>{addedOn}</span> : null}
      </div>
    </article>
  );
}

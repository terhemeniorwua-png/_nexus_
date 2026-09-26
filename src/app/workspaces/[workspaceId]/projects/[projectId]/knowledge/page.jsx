"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useResource } from "@/hooks/useResource";
import EmptyState from "@/components/workspace/EmptyState";
import { BookIcon, PlusIcon, SearchIcon } from "@/components/workspace/icons";
import ResourceCard from "@/components/workspace/KnowledgeBase/ResourceCard";
import KnowledgeSummary from "@/components/workspace/KnowledgeBase/KnowledgeSummary";
import KnowledgeFilters from "@/components/workspace/KnowledgeBase/KnowledgeFilters";
import AddResourceModal from "@/components/workspace/KnowledgeBase/AddResourceModal";
import { KNOWLEDGE_ENDPOINTS } from "@/lib/knowledge";

const EMPTY_FILTERS = { search: "", category: "", status: "", resourceType: "" };

export default function KnowledgePage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);
  const projectId = String(params.projectId);

  const { data: projectsData } = useResource(`/workspaces/${workspaceId}/projects`);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // Typing should not fire a request per keystroke. The input stays
  // uncontrolled-by-network: it shows `filters.search` immediately while the
  // request waits for a pause.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const query = new URLSearchParams();
  if (debouncedSearch.trim()) query.set("search", debouncedSearch.trim());
  if (filters.category) query.set("category", filters.category);
  if (filters.status) query.set("status", filters.status);
  if (filters.resourceType) query.set("resourceType", filters.resourceType);

  const search = query.toString();
  const path = `${KNOWLEDGE_ENDPOINTS.list(workspaceId, projectId)}${search ? `?${search}` : ""}`;

  const { data, loading, error, refetch } = useResource(path);

  const project = projectsData?.projects?.find((p) => p.id === projectId);
  const resources = data?.resources || [];
  const summary = data?.summary || null;
  const canCreate = Boolean(data?.permissions?.canCreate);
  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 py-7 md:px-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            Knowledge Base
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-white">
            {project?.name || "Project knowledge"}
          </h1>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Everything the project has agreed is true, in one place.
          </p>
        </div>

        {canCreate ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            <PlusIcon size={14} />
            Add resource
          </button>
        ) : null}
      </header>

      <KnowledgeSummary summary={summary} />

      <div className="mt-6">
        <KnowledgeFilters
          filters={filters}
          onChange={setFilters}
          summary={summary}
          shownCount={resources.length}
          hasActiveFilters={hasActiveFilters}
        />
      </div>

      <div className="mt-4">
        {error ? (
          <EmptyState
            icon={<BookIcon size={20} />}
            title="We couldn't load the knowledge base"
            description={error.message}
            action={
              <button
                type="button"
                onClick={refetch}
                className="rounded-lg border border-white/12 px-3.5 py-2 text-[13px] font-medium text-zinc-200 transition-colors hover:bg-white/5"
              >
                Try again
              </button>
            }
          />
        ) : loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-[186px] animate-pulse rounded-2xl border border-white/6 bg-white/[0.02]"
              />
            ))}
          </div>
        ) : resources.length === 0 ? (
          hasActiveFilters ? (
            <EmptyState
              icon={<SearchIcon size={20} />}
              title="Nothing matches those filters"
              description="Try a different search term, or clear the filters to see the whole project."
              action={
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="rounded-lg border border-white/12 px-3.5 py-2 text-[13px] font-medium text-zinc-200 transition-colors hover:bg-white/5"
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={<BookIcon size={20} />}
              title="No knowledge yet"
              description={
                canCreate
                  ? "Add the first resource, or promote an approved submission from a task to start building this up."
                  : "Once a project manager approves a submission or adds a resource, it will show up here."
              }
              action={
                canCreate ? (
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                  >
                    <PlusIcon size={14} />
                    Add resource
                  </button>
                ) : null
              }
            />
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                workspaceId={workspaceId}
                projectId={projectId}
              />
            ))}
          </div>
        )}
      </div>

      {canCreate ? (
        <AddResourceModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={refetch}
          workspaceId={workspaceId}
          projectId={projectId}
        />
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useResource } from "@/hooks/useResource";
import EmptyState from "@/components/workspace/EmptyState";
import Modal from "@/components/workspace/Modal";
import ResourceCard from "@/components/workspace/ProjectResources/ResourceCard";
import ResourceFormModal from "@/components/workspace/ProjectResources/ResourceFormModal";
import { LinkIcon, PlusIcon, SearchIcon } from "@/components/workspace/icons";
import {
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_META,
  RESOURCE_ENDPOINTS,
  canCurateResources,
} from "@/lib/projectResources";

const EMPTY_FILTERS = { search: "", category: "" };

export default function ProjectResourcesPage() {
  const params = useParams();
  const workspaceId = String(params.workspaceId);
  const projectId = String(params.projectId);

  // The project list is the same request the knowledge base makes, and it is
  // where the viewer's role on this project comes from. Without it the page
  // would have to guess whether to offer the add button.
  const { data: projectsData } = useResource(`/workspaces/${workspaceId}/projects`);

  const { data, loading, error, refetch } = useResource(
    RESOURCE_ENDPOINTS.list(workspaceId, projectId)
  );

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const { run, loading: deleting2 } = useMutation();

  const project = projectsData?.projects?.find((p) => p.id === projectId);
  const role = project?.role || "";
  const canManage = canCurateResources(role);

  const all = useMemo(() => data?.resources || [], [data]);

  // The list endpoint returns a project's whole curated set in one response, so
  // narrowing happens here rather than costing a request per keystroke. A
  // project keeps tens of these, not thousands.
  const resources = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return all.filter((resource) => {
      if (filters.category && resource.category !== filters.category) return false;
      if (!term) return true;
      return [resource.name, resource.description, resource.url]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [all, filters.search, filters.category]);

  const hasActiveFilters = Boolean(filters.search || filters.category);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(resource) {
    setEditing(resource);
    setModalOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);

    const result = await run(RESOURCE_ENDPOINTS.item(workspaceId, projectId, deleting.id), {
      method: "DELETE",
    });

    if (result.error) {
      setDeleteError(result.error.message);
      return;
    }
    setDeleting(null);
    refetch();
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 py-7 md:px-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            Project resources
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-white">
            {project?.name || "Project resources"}
          </h1>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Papers, tools and links the team decided were worth keeping.
          </p>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            <PlusIcon size={14} />
            Add resource
          </button>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Search resources"
            aria-label="Search resources"
            className="ws-input h-9 w-full rounded-lg pl-9 pr-3 text-[13px] text-zinc-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, category: "" }))}
            className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              filters.category === "" ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            All
          </button>
          {RESOURCE_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  category: prev.category === category ? "" : category,
                }))
              }
              className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                filters.category === category
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {RESOURCE_CATEGORY_META[category]?.label || category}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[12px] text-zinc-500" aria-live="polite">
        {loading
          ? "Loading…"
          : hasActiveFilters
            ? `${resources.length} of ${all.length} shown`
            : `${all.length} ${all.length === 1 ? "resource" : "resources"}`}
      </p>

      <div className="mt-4">
        {error ? (
          <EmptyState
            icon={<LinkIcon size={20} />}
            title="We couldn't load the resources"
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
        ) : all.length === 0 ? (
          <EmptyState
            icon={<LinkIcon size={20} />}
            title="No resources yet"
            description={
              canManage
                ? "Add the first link worth keeping — a paper, a tool, a repo, or a spec the project is following."
                : "Once a project manager adds a resource, it will show up here."
            }
            action={
              canManage ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                >
                  <PlusIcon size={14} />
                  Add resource
                </button>
              ) : null
            }
          />
        ) : resources.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={20} />}
            title="Nothing matches that"
            description="Try another search term, or clear the filter to see every resource."            action={
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                canManage={canManage}
                onEdit={openEdit}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}
      </div>

      {canManage ? (
        <ResourceFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={refetch}
          workspaceId={workspaceId}
          projectId={projectId}
          resource={editing}
        />
      ) : null}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete resource"
        maxWidth="max-w-md"
      >
        <p className="text-[14px] leading-relaxed text-zinc-300">
          Remove{" "}
          <span className="font-medium text-white">{deleting?.name}</span> from the
          resource list? This cannot be undone.
        </p>
        {deleteError ? (
          <p
            className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300"
            role="alert"
          >
            {deleteError}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting2}
            className="rounded-lg bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-400 disabled:opacity-50"
          >
            {deleting2 ? "Deleting…" : "Delete resource"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

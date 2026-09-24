"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useResource, useMutation } from "@/hooks/useResource";
import "../../workspace.css";
import { ArrowLeftIcon, EditIcon, TrashIcon, BoardIcon, UsersIcon, CalendarIcon, CheckIcon } from "@/components/workspace/icons";
import Avatar from "@/components/workspace/Avatar";
import Modal from "@/components/workspace/Modal";
import EmptyState from "@/components/workspace/EmptyState";
import ProjectForm from "@/components/workspace/ProjectForm";
import { ProjectStatusBadge, ProjectPriorityBadge } from "@/components/workspace/ProjectBadge";
import { formatDate } from "@/lib/workspaceApi";

const MANAGEABLE_ROLES = ["WORKSPACE_OWNER", "ADMIN", "PROJECT_MANAGER"];
const DELETABLE_ROLES = ["WORKSPACE_OWNER", "ADMIN"];

function MetaItem({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-1.5 text-[13.5px] text-zinc-200">{children}</div>
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = String(params.projectId);

  const { data, loading, error, refetch } = useResource(`/projects/${projectId}`);
  const { run } = useMutation();

  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [discardError, setDiscardError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const project = data?.project;
  const role = project?.role || "";
  const canManage = MANAGEABLE_ROLES.includes(role);
  const canDelete = DELETABLE_ROLES.includes(role);
  const members = project?.members || [];
  const total = project?.stats?.taskCount || 0;
  const done = project?.stats?.doneCount || 0;

  async function handleUpdate(values, runFn) {
    const { data: updated, error: err } = await runFn(`/projects/${projectId}`, {
      method: "PATCH",
      body: values,
    });
    if (err) {
      setDiscardError(err.message || "Could not update the project");
      return;
    }
    setDiscardError("");
    setShowEdit(false);
    if (updated?.project) refetch();
  }

  async function handleDelete() {
    setDeleteError("");
    setDeleting(true);
    const { error: err } = await run(`/projects/${projectId}`, { method: "DELETE" });
    setDeleting(false);
    if (err) {
      setDeleteError(err.message || "Could not delete the project");
      return;
    }
    router.push("/projects");
  }

  if (loading && !project) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
        <div className="h-8 w-56 animate-pulse rounded-lg border border-white/6 bg-white/[0.03]" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-white/6 bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  if (error?.status === 403) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
        <EmptyState
          icon={<BoardIcon size={20} />}
          title="Private project"
          description="You do not have permission to view this project."
          action={
            <Link
              href="/projects"
              className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Back to projects
            </Link>
          }
        />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
        <EmptyState
          icon={<BoardIcon size={20} />}
          title="Project not found"
          description="It may have been deleted or you may not have access."
          action={
            <Link
              href="/projects"
              className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Back to projects
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 transition-colors hover:text-white"
      >
        <ArrowLeftIcon size={15} /> All projects
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[24px] font-semibold tracking-tight text-white">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
            <ProjectPriorityBadge priority={project.priority} />
          </div>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-zinc-400">
            {project.description || "No description yet."}
          </p>
          <p className="mt-2 text-[12px] text-zinc-500">
            {project.workspace?.name} · {project.team?.name} team
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setDiscardError("");
                setShowEdit(true);
              }}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-[13px] font-medium text-zinc-200 transition-colors hover:border-white/25 hover:text-white"
            >
              <EditIcon size={15} /> Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => {
                setDeleteError("");
                setConfirmDelete(true);
              }}
              className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-3.5 py-2.5 text-[13px] font-semibold text-red-300 transition-colors hover:bg-red-400/20 hover:text-red-200"
            >
              <TrashIcon size={15} /> Delete
            </button>
          )}
        </div>
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ws-card flex items-center gap-3 rounded-2xl p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-zinc-300">
            <UsersIcon size={17} />
          </span>
          <div>
            <p className="text-[22px] font-bold leading-none text-white">{members.length}</p>
            <p className="mt-1.5 text-[11.5px] font-medium uppercase tracking-wide text-zinc-500">Members</p>
          </div>
        </div>
        <div className="ws-card flex items-center gap-3 rounded-2xl p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-zinc-300">
            <BoardIcon size={17} />
          </span>
          <div>
            <p className="text-[22px] font-bold leading-none text-white">{total}</p>
            <p className="mt-1.5 text-[11.5px] font-medium uppercase tracking-wide text-zinc-500">Tasks</p>
          </div>
        </div>
        <div className="ws-card flex items-center gap-3 rounded-2xl p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-zinc-300">
            <CheckIcon size={17} />
          </span>
          <div>
            <p className="text-[22px] font-bold leading-none text-white">{done}</p>
            <p className="mt-1.5 text-[11.5px] font-medium uppercase tracking-wide text-zinc-500">Done</p>
          </div>
        </div>
        <div className="ws-card flex items-center gap-3 rounded-2xl p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-zinc-300">
            <CalendarIcon size={17} />
          </span>
          <div>
            <p className="text-[15px] font-bold leading-none text-white">
              {project.dueDate ? formatDate(project.dueDate) : "—"}
            </p>
            <p className="mt-1.5 text-[11.5px] font-medium uppercase tracking-wide text-zinc-500">Due date</p>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white">Tasks</h2>
            <span className="text-[12px] text-zinc-500">{total}</span>
          </div>
          {total === 0 ? (
            <EmptyState
              icon={<BoardIcon size={20} />}
              title="No tasks yet"
              description="No tasks have been created yet. Open the board to start tracking work."
              className="py-10"
              action={
                <Link
                  href={`/workspaces/${project.workspace?.id}/projects/${project.id}/board`}
                  className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                >
                  Open board
                </Link>
              }
            />
          ) : (
            <div className="ws-card rounded-2xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13.5px] text-zinc-300">
                  {done} of {total} tasks done
                </p>
                <span className="text-[12px] font-semibold text-white">
                  {total > 0 ? Math.round((done / total) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }}
                />
              </div>
              <Link
                href={`/workspaces/${project.workspace?.id}/projects/${project.id}/board`}
                className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-[13px] font-medium text-zinc-200 transition-colors hover:border-white/25 hover:text-white"
              >
                <BoardIcon size={15} /> Open board
              </Link>
            </div>
          )}

          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-white">Details</h2>
            </div>
            <div className="ws-card grid gap-5 rounded-2xl p-5 sm:grid-cols-2">
              <MetaItem label="Workspace">{project.workspace?.name || "—"}</MetaItem>
              <MetaItem label="Team">{project.team?.name || "—"}</MetaItem>
              {project.startDate && (
                <MetaItem label="Start date">{formatDate(project.startDate)}</MetaItem>
              )}
              {project.dueDate && <MetaItem label="Due date">{formatDate(project.dueDate)}</MetaItem>}
              <MetaItem label="Created">
                {project.createdAt ? formatDate(project.createdAt) : "—"}
              </MetaItem>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white">Members</h2>
            <span className="text-[12px] text-zinc-500">{members.length}</span>
          </div>
          <div className="ws-card rounded-2xl p-2">
            <div className="flex items-center gap-3 rounded-xl px-2.5 py-3">
              <Avatar name={project.manager?.name} avatar={project.manager?.avatar} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-zinc-100">{project.manager?.name || "—"}</p>
                <p className="truncate text-[11px] text-zinc-500">Manager</p>
              </div>
            </div>
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/[0.04]"
              >
                <Avatar name={member.user?.name} avatar={member.user?.avatar} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-zinc-100">{member.user?.name}</p>
                  <p className="truncate text-[11px] text-zinc-600">{member.user?.email}</p>
                </div>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    member.role === "PROJECT_MANAGER"
                      ? "bg-emerald-400/15 text-emerald-300"
                      : "bg-white/8 text-zinc-300"
                  }`}
                >
                  {member.role === "PROJECT_MANAGER" ? "Manager" : member.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ProjectForm
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit project"
        submitLabel="Save changes"
        project={project}
        onSubmit={handleUpdate}
      />

      {discardError && (
        <p className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
          {discardError}
        </p>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete project"
        maxWidth="max-w-md"
      >
        <p className="text-[14px] leading-relaxed text-zinc-300">
          Delete <span className="font-medium text-white">{project.name}</span>? Its tasks, board
          columns, memberships, and resources will be removed permanently. This cannot be undone.
        </p>
        {deleteError && (
          <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
            {deleteError}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg bg-red-500/90 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete project"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
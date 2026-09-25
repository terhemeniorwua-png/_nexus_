"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import "../../../../workspace.css";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import GlobalNav from "@/components/workspace/GlobalNav";
import EmptyState from "@/components/workspace/EmptyState";
import Avatar from "@/components/workspace/Avatar";
import Modal from "@/components/workspace/Modal";
import TaskFormModal from "@/components/workspace/TaskFormModal";
import {
  ArrowLeftIcon,
  TrashIcon,
  EditIcon,
  CalendarIcon,
  TagIcon,
  CheckIcon,
  PlusIcon,
  BoardIcon,
} from "@/components/workspace/icons";
import { useResource, useMutation } from "@/hooks/useResource";
import { useAuth } from "@/context/AuthContext";
import ProgressBar from "@/components/workspace/ProgressBar";
import DeliverablePanel from "@/components/workspace/Deliverables/DeliverablePanel";
import {
  SUBTASK_STATUS_META,
  taskStatusMeta,
  taskPriorityMeta,
  isOverdue,
  formatDate,
  formatWeight,
} from "@/lib/workspaceApi";

// Worker steps are assignee-only; reviewer steps need review/approve rights.
// The backend enforces both; we render the plausible next moves per status.
const TRANSITIONS = {
  ASSIGNED: [{ to: "IN_PROGRESS", label: "Start work", worker: true }],
  IN_PROGRESS: [{ to: "SUBMITTED", label: "Submit for review", worker: true }],
  SUBMITTED: [{ to: "UNDER_REVIEW", label: "Begin review", worker: false }],
  UNDER_REVIEW: [
    { to: "APPROVED", label: "Approve", worker: false },
    { to: "CHANGES_REQUESTED", label: "Request changes", worker: false },
  ],
  CHANGES_REQUESTED: [{ to: "IN_PROGRESS", label: "Rework", worker: true }],
};

function StatusBadge({ status }) {
  const meta = taskStatusMeta(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-semibold"
      style={{
        color: meta.color,
        backgroundColor: `${meta.color}14`,
        borderColor: `${meta.color}33`,
      }}
    >
      {meta.label}
    </span>
  );
}

function MetaRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
      <span className="text-zinc-500">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-medium uppercase tracking-wide text-zinc-600">{label}</p>
        <p className="truncate text-[13px] text-zinc-200">{value || "—"}</p>
      </div>
    </div>
  );
}

function SubtaskList({ subtasks, onToggle, onDelete, canManage }) {
  return (
    <div className="space-y-2">
      {subtasks.map((subtask) => {
        const meta = SUBTASK_STATUS_META[subtask.status] || SUBTASK_STATUS_META.TODO;
        const weight = Number(subtask.weight) || 0;
        return (
          <div
            key={subtask.id}
            className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5"
          >
            <button
              type="button"
              onClick={() => onToggle(subtask)}
              aria-label={subtask.completed ? "Mark subtask not done" : "Mark subtask done"}
              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
                subtask.completed
                  ? "border-emerald-400/70 bg-emerald-400/20 text-emerald-300"
                  : "border-white/20 text-transparent hover:border-white/40"
              }`}
            >
              <CheckIcon size={12} />
            </button>

            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-[13px] ${
                  subtask.completed ? "text-zinc-600 line-through" : "text-zinc-200"
                }`}
              >
                {subtask.title}
              </p>
              {subtask.dueDate && (
                <p className="text-[11px] text-zinc-500">{formatDate(subtask.dueDate)}</p>
              )}
            </div>

            {weight > 0 && (
              <span
                className="shrink-0 rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[10.5px] font-semibold text-zinc-400"
                title="Share of the task's progress this subtask carries"
              >
                {formatWeight(weight)}
              </span>
            )}

            <span
              className="shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                color: meta.color,
                backgroundColor: `${meta.color}14`,
                borderColor: `${meta.color}33`,
              }}
            >
              {meta.label}
            </span>

            {subtask.assignee?.name && (
              <Avatar name={subtask.assignee.name} size={22} className="shrink-0" />
            )}

            {canManage && (
              <button
                type="button"
                onClick={() => onDelete(subtask)}
                aria-label={`Delete subtask ${subtask.title}`}
                className="shrink-0 rounded-md p-1 text-zinc-600 transition-colors hover:bg-red-400/10 hover:text-red-400"
              >
                <TrashIcon size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SubtaskComposer({ onAdd, members, busy, weights }) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [weight, setWeight] = useState("");

  // `weights` comes from the backend with the task; the pre-check below is
  // only guidance — the server rejects an over-allocated task either way.
  const allocated = Number(weights?.total) || 0;
  const remaining = Math.max(0, Math.round((100 - allocated) * 100) / 100);
  const parsedWeight = weight === "" ? 0 : Number(weight);
  const invalidWeight = !Number.isFinite(parsedWeight) || parsedWeight < 0;
  const projected = allocated + (invalidWeight ? 0 : parsedWeight);
  const overBudget = !invalidWeight && projected > 100;

  const submit = (event) => {
    event.preventDefault();
    if (!title.trim() || invalidWeight || overBudget) return;
    onAdd({
      title: title.trim(),
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
      weight: parsedWeight,
    });
    setTitle("");
    setAssigneeId("");
    setDueDate("");
    setWeight("");
  };

  return (
    <form
      onSubmit={submit}
      className="mt-3 grid gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-3 sm:grid-cols-[1fr_88px_auto_auto_auto]"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a subtask…"
        className="ws-input h-9 rounded-lg px-3 text-[13px]"
      />
      <div className="relative">
        <input
          type="number"
          min="0"
          max="100"
          step="any"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder={String(remaining)}
          aria-label="Subtask weight (percent of the task)"
          className={`ws-input h-9 w-full rounded-lg px-2.5 pr-6 text-[12.5px] ${
            overBudget ? "border-red-400/60" : ""
          }`}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500">
          %
        </span>
      </div>
      <select
        value={assigneeId}
        onChange={(e) => setAssigneeId(e.target.value)}
        className="ws-input h-9 rounded-lg px-2.5 text-[12.5px]"
        aria-label="Subtask assignee"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="ws-input h-9 rounded-lg px-2.5 text-[12.5px]"
        aria-label="Subtask due date"
      />
      <button
        type="submit"
        disabled={busy || !title.trim() || invalidWeight || overBudget}
        className="flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-[12.5px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-50"
      >
        <PlusIcon size={14} /> Add
      </button>

      <p
        className={`text-[11.5px] sm:col-span-full ${
          overBudget ? "text-red-300" : invalidWeight ? "text-red-300" : "text-zinc-500"
        }`}
      >
        {overBudget ? (
          <>
            Current weight allocation: {formatWeight(allocated)}% · new subtask weight:{" "}
            {formatWeight(parsedWeight)}% · total {formatWeight(projected)}%. The total subtask
            weight cannot exceed 100%.
          </>
        ) : invalidWeight ? (
          "Weight must be a number between 0 and 100."
        ) : (
          <>
            Current weight allocation: {formatWeight(allocated)}% · remaining: {formatWeight(remaining)}%
          </>
        )}
      </p>
    </form>
  );
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const projectId = String(params.projectId);
  const taskId = String(params.taskId);

  const { data: projectData, loading: projectLoading } = useResource(`/projects/${projectId}`);
  const { data: taskData, loading: taskLoading, refetch } = useResource(`/api/tasks/${taskId}`);
  const { run, loading } = useMutation();

  const [statusError, setStatusError] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [subtaskBusy, setSubtaskBusy] = useState(false);
  const [subtaskError, setSubtaskError] = useState("");

  const project = projectData?.project;
  const task = taskData?.task;

  const members = useMemo(() => {
    const list = (project?.members || []).map((m) => ({
      id: String(m.user?.id || m.userId || ""),
      name: m.user?.name || "Unknown",
      email: m.user?.email || "",
    }));
    if (project?.manager?.id && !list.some((m) => m.id === String(project.manager.id))) {
      list.push({ id: String(project.manager.id), name: project.manager.name || "Manager", email: "" });
    }
    return list.filter((m) => m.id);
  }, [project]);

  const role = project?.role || "";
  const canManage = ["WORKSPACE_OWNER", "ADMIN", "PROJECT_MANAGER"].includes(role);

  const isAssignee = useMemo(() => {
    if (!task || !user) return false;
    return String(task.assignedTo || "") === String(user.id) || String(task.assignee?.id || "") === String(user.id);
  }, [task, user]);

  const transitions = task ? TRANSITIONS[task.status] || null : null;

  async function handleStatusMove(toStatus) {
    setStatusError("");
    const { data: result, error: err } = await run(`/api/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: toStatus },
    });
    if (err) {
      setStatusError(err.message || "Could not update the task status");
      return;
    }
    if (result) refetch();
  }

  async function handleToggleSubtask(subtask) {
    setSubtaskError("");
    setSubtaskBusy(true);
    const nextStatus = subtask.completed ? "TODO" : "COMPLETED";
    const { error: err } = await run(`/api/subtasks/${subtask.id}`, {
      method: "PATCH",
      body: { status: nextStatus },
    });
    setSubtaskBusy(false);
    if (err) {
      setSubtaskError(err.message || "Could not update the subtask");
      return;
    }
    refetch();
  }

  async function handleAddSubtask(payload) {
    setSubtaskError("");
    setSubtaskBusy(true);
    const { error: err } = await run(`/api/tasks/${task.id}/subtasks`, {
      method: "POST",
      body: payload,
    });
    setSubtaskBusy(false);
    if (err) {
      setSubtaskError(err.message || "Could not create the subtask");
      return;
    }
    refetch();
  }

  async function handleDeleteSubtask(subtask) {
    setSubtaskError("");
    setSubtaskBusy(true);
    const { error: err } = await run(`/api/subtasks/${subtask.id}`, { method: "DELETE" });
    setSubtaskBusy(false);
    if (err) {
      setSubtaskError(err.message || "Could not delete the subtask");
      return;
    }
    refetch();
  }

  async function handleDelete() {
    setDeleting(true);
    const { error: err } = await run(`/api/tasks/${task.id}`, { method: "DELETE" });
    setDeleting(false);
    if (err) {
      setStatusError(err.message || "Could not delete the task");
      return;
    }
    router.push(`/projects/${projectId}/tasks`);
  }

  const isLoading = projectLoading || taskLoading;

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="ws-canvas relative min-h-dvh text-zinc-200">
          <div className="relative z-10">
            <GlobalNav />
            <main className="mx-auto w-full max-w-4xl px-5 py-8 md:px-8">
              <div className="h-7 w-64 animate-pulse rounded-lg border border-white/6 bg-white/[0.03]" />
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-2xl border border-white/6 bg-white/[0.03]" />
                ))}
              </div>
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!task || (!project && task)) {
    return (
      <ProtectedRoute>
        <div className="ws-canvas relative min-h-dvh text-zinc-200">
          <div className="relative z-10">
            <GlobalNav />
            <main className="mx-auto w-full max-w-4xl px-5 py-8 md:px-8">
              <EmptyState
                icon={<BoardIcon size={20} />}
                title="Task not found"
                description="It may have been deleted or you may not have access."
                action={
                  <Link
                    href={`/projects/${projectId}/tasks`}
                    className="rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                  >
                    Back to tasks
                  </Link>
                }
              />
            </main>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const meta = taskStatusMeta(task.status);
  const priority = taskPriorityMeta(task.priority);
  const overdue = isOverdue(task);
  const subtasks = task.subtasks || [];
  const completedCount = subtasks.filter((s) => s.completed).length;
  // `task.progress` is always a number, computed by the backend from the
  // completed weight of these subtasks (or, with no subtasks, from APPROVED).
  const progress = task.progress ?? 0;
  const weights = task.weights || { total: 0, remaining: 100, completedWeight: 0, isComplete: false };
  const progressLabel = subtasks.length === 0 ? "No subtasks — progress follows the task status" : "Progress";

  return (
    <ProtectedRoute>
      <div className="ws-canvas relative min-h-dvh text-zinc-200">
        <div className="ws-glow left-[-8%] top-[-12%] h-[360px] w-[360px] bg-blue-600/18" />
        <div className="ws-glow right-[-8%] top-[28%] h-[340px] w-[340px] bg-purple-600/14" />

        <div className="relative z-10 min-h-dvh">
          <GlobalNav />

          <main className="mx-auto w-full max-w-4xl px-5 py-8 md:px-8">
            <Link
              href={`/projects/${projectId}/tasks`}
              className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 transition-colors hover:text-white"
            >
              <ArrowLeftIcon size={15} /> All tasks
            </Link>

            <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-[24px] font-semibold tracking-tight text-white">{task.title}</h1>
                  <StatusBadge status={task.status} />
                </div>
                <p className="mt-2 max-w-2xl whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-400">
                  {task.description || "No description yet."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {(task.tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-400"
                    >
                      <TagIcon size={10} /> {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusError("");
                      setShowEdit(true);
                    }}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-[13px] font-medium text-zinc-200 transition-colors hover:border-white/25 hover:text-white"
                  >
                    <EditIcon size={15} /> Edit
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusError("");
                      setConfirmDelete(true);
                    }}
                    className="flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-3.5 py-2.5 text-[13px] font-semibold text-red-300 transition-colors hover:bg-red-400/20 hover:text-red-200"
                  >
                    <TrashIcon size={15} /> Delete
                  </button>
                )}
              </div>
            </header>

            {statusError && (
              <p
                className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300"
                role="alert"
              >
                {statusError}
              </p>
            )}

            <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetaRow icon={<CalendarIcon size={15} />} label="Due date" value={overdue ? `${formatDate(task.dueDate)} (overdue)` : formatDate(task.dueDate)} />
              <MetaRow icon={<TagIcon size={15} />} label="Priority" value={priority.label} />
              <MetaRow
                icon={<CheckIcon size={15} />}
                label="Progress"
                value={subtasks.length === 0 ? `${progress}% · no subtasks` : `${progress}%`}
              />
              <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
                <Avatar name={task.assignee?.name} size={28} />
                <div className="min-w-0">
                  <p className="text-[10.5px] font-medium uppercase tracking-wide text-zinc-600">Assignee</p>
                  <p className="truncate text-[13px] text-zinc-200">{task.assignee?.name || "Unassigned"}</p>
                </div>
              </div>
            </section>

            {transitions && transitions.length > 0 && (
              <section className="mt-8">
                <h2 className="text-[14px] font-semibold text-white">Move task</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  {transitions.map((move) => {
                    const blockedWorker = move.worker && !isAssignee;
                    return (
                      <button
                        key={move.to}
                        type="button"
                        disabled={loading}
                        onClick={() => handleStatusMove(move.to)}
                        title={
                          blockedWorker
                            ? "Only the assigned member can take this step"
                            : `Move to ${taskStatusMeta(move.to).label}`
                        }
                        className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
                      >
                        {move.label}
                        {blockedWorker && <span className="rounded bg-zinc-900/10 px-1.5 py-0.5 text-[10px] font-bold">waiting on assignee</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[14px] font-semibold text-white">
                  Subtasks{" "}
                  {subtasks.length > 0 && (
                    <span className="ml-1 text-[12px] font-medium text-zinc-500">
                      {completedCount}/{subtasks.length}
                    </span>
                  )}
                </h2>
                {project?.workspace?.id && (
                  <Link
                    href={`/workspaces/${project.workspace.id}/projects/${project.id}/board`}
                    className="inline-flex items-center gap-1.5 text-[12px] text-zinc-500 transition-colors hover:text-white"
                  >
                    <BoardIcon size={14} /> Open board
                  </Link>
                )}
              </div>

              <div className="ws-card rounded-2xl p-4">
                <ProgressBar
                  value={progress}
                  label={progressLabel}
                  size="md"
                  tone="emerald"
                  hint={
                    subtasks.length > 0
                      ? `${formatWeight(weights.completedWeight)} of ${formatWeight(weights.total)} allocated weight completed`
                      : undefined
                  }
                />

                {subtasks.length > 0 && (
                  <p className="mt-2 text-[11.5px] text-zinc-500">
                    {formatWeight(weights.completedWeight)}% of {formatWeight(weights.total)}% weighted
                    work complete
                    {weights.remaining > 0 && ` · ${formatWeight(weights.remaining)}% weight unallocated`}
                  </p>
                )}

                <div className="mt-4">
                  {subtasks.length === 0 ? (
                    <p className="py-6 text-center text-[13.5px] text-zinc-500">
                      No subtasks yet{subtaskError ? "" : " — break this task into smaller pieces."}
                    </p>
                  ) : (
                    <SubtaskList
                      subtasks={subtasks}
                      onToggle={handleToggleSubtask}
                      onDelete={handleDeleteSubtask}
                      canManage={Boolean(canManage || isAssignee)}
                    />
                  )}
                </div>

                {subtaskError && (
                  <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[12.5px] text-red-300" role="alert">
                    {subtaskError}
                  </p>
                )}

                {(canManage || isAssignee) && (
                  <SubtaskComposer
                    onAdd={handleAddSubtask}
                    members={members}
                    busy={subtaskBusy}
                    weights={weights}
                  />
                )}
              </div>
            </section>

            <DeliverablePanel
              taskId={task.id}
              taskStatus={task.status}
              role={role}
              isAssignee={isAssignee}
              onChanged={refetch}
            />
          </main>
        </div>

        <TaskFormModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          project={project}
          assignableMembers={members}
          task={task}
          onSubmit={() => refetch()}
        />

        <Modal
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete task"
          maxWidth="max-w-md"
        >
          <p className="text-[14px] leading-relaxed text-zinc-300">
            Delete <span className="font-medium text-white">{task.title}</span>? Its deliverables,
            reviews, and comments will be removed permanently. This cannot be undone.
          </p>
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
              {deleting ? "Deleting…" : "Delete task"}
            </button>
          </div>
        </Modal>
      </div>
    </ProtectedRoute>
  );
}
"use client";

import { useEffect, useState } from "react";
import Modal from "../Modal";
import { useMutation } from "@/hooks/useResource";
import { PlusIcon, TrashIcon, CheckIcon, XIcon } from "../icons";
import TaskComments from "./TaskComments";

const STATUSES = ["TO DO", "IN PROGRESS", "REVIEW", "DONE"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({ value, onChange, children, className = "", disabled = false }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`ws-input h-10 w-full rounded-lg px-3 text-[13.5px] ${className}`}
    >
      {children}
    </select>
  );
}

export default function TaskModal({
  open,
  onClose,
  workspaceId,
  projectId,
  members = [],
  columns = [],
  task = null,
  defaultColumnId = null,
  defaultStatus = null,
  role = "",
  onSaved,
  onDeleted,
}) {
  const { run, loading } = useMutation();

  const canManage = ["WORKSPACE_OWNER", "ADMIN", "PROJECT_MANAGER"].includes(role);
  const canComment = canManage || role === "MEMBER";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("TO DO");
  const [priority, setPriority] = useState("Medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [subtasks, setSubtasks] = useState([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [error, setError] = useState("");
  const [isDeleted, setIsDeleted] = useState(false);

  // Rehydrate the form whenever it opens, seeded from the task being edited.
/* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setError("");
    setIsDeleted(false);
    setTitle(task?.title || "");
    setDescription(task?.description || "");
    setStatus(task?.status || defaultStatus || "TO DO");
    setPriority(task?.priority || "Medium");
    setAssignedTo(task?.assignedTo?.id || "");
    setDueDate(task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "");
    setTagsText((task?.tags || []).join(", "));
    setSubtasks(
      (task?.subtasks || []).map((s) => ({ title: s.title, completed: Boolean(s.completed) }))
    );
    setNewSubtask("");
  }, [open, task, defaultStatus]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function addSubtask() {
    const value = newSubtask.trim();
    if (!value) return;
    setSubtasks((prev) => [...prev, { title: value, completed: false }]);
    setNewSubtask("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Task title is required");
      return;
    }

    const payload = {
      title: title.trim(),
      description,
      status,
      priority,
      assignedTo: assignedTo || null,
      dueDate: dueDate || null,
      tags: tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      subtasks,
    };

    if (!task) {
      const col = columns.find((c) => c.name === status) || columns[0];
      payload.columnId = col?.id || defaultColumnId || null;
    }

    const path = task
      ? `/workspaces/${workspaceId}/projects/${projectId}/tasks/${task.id}`
      : `/workspaces/${workspaceId}/projects/${projectId}/tasks`;

    const { data, error: apiError } = await run(path, {
      method: task ? "PATCH" : "POST",
      body: payload,
    });

    if (apiError) {
      setError(apiError.message);
      return;
    }

    onSaved && onSaved(data.task);
    onClose();
  }

  async function handleDelete() {
    const { error: apiError } = await run(
      `/workspaces/${workspaceId}/projects/${projectId}/tasks/${task.id}`,
      { method: "DELETE" }
    );
    if (apiError) {
      setError(apiError.message);
      return;
    }
    setIsDeleted(true);
    onDeleted && onDeleted(task.id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? "Edit task" : "New task"} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Title">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="ws-input h-11 w-full rounded-lg px-3.5 text-[14.5px] font-medium"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Add context…"
            className="ws-input w-full rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Status">
            <Select value={status} onChange={setStatus}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={setPriority}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assignee">
            <Select
              value={assignedTo}
              onChange={setAssignedTo}
              disabled={!canManage}
              className={!canManage ? "opacity-50" : ""}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user?.id || m.id} value={m.user?.id}>
                  {m.user?.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="ws-input h-10 w-full rounded-lg px-3 text-[13.5px]"
            />
          </Field>
          <Field label="Tags (comma separated)">
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="design, backend"
              className="ws-input h-10 w-full rounded-lg px-3 text-[13.5px]"
            />
          </Field>
        </div>

        <Field label="Subtasks">
          <div className="space-y-2">
            {subtasks.map((subtask, index) => (
              <div key={index} className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setSubtasks((prev) =>
                      prev.map((s, i) => (i === index ? { ...s, completed: !s.completed } : s))
                    )
                  }
                  aria-label="Toggle subtask"
                  className={`flex h-4.5 w-4.5 items-center justify-center rounded border transition-colors ${
                    subtask.completed
                      ? "border-emerald-400/70 bg-emerald-400/20 text-emerald-300"
                      : "border-white/20 text-transparent hover:border-white/40"
                  }`}
                  style={{ width: 18, height: 18 }}
                >
                  <CheckIcon size={12} />
                </button>
                <span
                  className={`flex-1 text-[13px] ${subtask.completed ? "text-zinc-600 line-through" : "text-zinc-200"}`}
                >
                  {subtask.title}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSubtasks((prev) => prev.filter((_, i) => i !== index))
                  }
                  aria-label="Remove subtask"
                  className="text-zinc-600 transition-colors hover:text-red-400"
                >
                  <XIcon size={14} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSubtask();
                  }
                }}
                placeholder="Add a subtask…"
                className="ws-input h-9 flex-1 rounded-lg px-3 text-[13px]"
              />
              <button
                type="button"
                onClick={addSubtask}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
                aria-label="Add subtask"
              >
                <PlusIcon size={15} />
              </button>
            </div>
          </div>
        </Field>

        {task && (
          <TaskComments
            workspaceId={workspaceId}
            projectId={projectId}
            taskId={task.id}
            isAdmin={canManage}
            canComment={canComment}
          />
        )}

        {error && (
          <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          {task && canManage ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading || isDeleted}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] text-zinc-500 transition-colors hover:text-red-400 disabled:opacity-50"
            >
              <TrashIcon size={15} /> Delete
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
            >
              {loading ? "Saving…" : task ? "Save changes" : "Create task"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { useMutation } from "@/hooks/useResource";
import { PlusIcon, XIcon } from "./icons";
import { TASK_PRIORITIES, TASK_PRIORITY_META, taskStatusMeta } from "@/lib/workspaceApi";
import Avatar from "./Avatar";

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

function SubtaskEditor({ subtasks, onChange, onRemove }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onChange([...subtasks, { title: value }]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      {subtasks.map((subtask, index) => (
        <div
          key={index}
          className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2"
        >
          <span className="flex-1 text-[13px] text-zinc-200">{subtask.title}</span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label="Remove subtask"
            className="text-zinc-600 transition-colors hover:text-red-400"
          >
            <XIcon size={14} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a subtask…"
          className="ws-input h-9 flex-1 rounded-lg px-3 text-[13px]"
        />
        <button
          type="button"
          onClick={add}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
          aria-label="Add subtask"
        >
          <PlusIcon size={15} />
        </button>
      </div>
    </div>
  );
}

// Shared create/edit modal for the global (project-scoped) task endpoints.
// Status is intentionally NOT editable here: creation always starts in
// ASSIGNED, and later workflow moves go through the status endpoint so the
// transition rules (assignee-only worker steps, reviewer permissions) hold.
export default function TaskFormModal({
  open,
  onClose,
  project,
  assignableMembers = [],
  task = null,
  onSubmit,
}) {
  const { run, loading } = useMutation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [subtasks, setSubtasks] = useState([]);
  const [error, setError] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setError("");
    setTitle(task?.title || "");
    setDescription(task?.description || "");
    setPriority(task?.priority || "MEDIUM");
    setAssignedTo(task?.assignedTo?.id || task?.assignedTo || "");
    setDueDate(task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "");
    setTagsText((task?.tags || []).join(", "));
    setSubtasks([]);
  }, [open, task]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

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
      priority: TASK_PRIORITY_META[priority] ? priority : "MEDIUM",
      assignedTo: assignedTo || null,
      dueDate: dueDate || null,
      tags: tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    let outcome;
    if (task) {
      const path = `/api/tasks/${task.id}`;
      const { data, error: apiError } = await run(path, { method: "PATCH", body: payload });
      outcome = { data, error: apiError, path };
    } else {
      const path = `/projects/${project.id}/tasks`;
      const { data, error: apiError } = await run(path, {
        method: "POST",
        body: { ...payload, subtasks: subtasks.filter((s) => s.title.trim()) },
      });
      outcome = { data, error: apiError, path };
    }

    if (outcome.error) {
      setError(outcome.error.message);
      return;
    }

    onSubmit && onSubmit(outcome.data);
    onClose();
  }

  const priorityLabel = (p) => TASK_PRIORITY_META[p]?.label || p;

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

        {task && taskStatusMeta(task.status).label && (
          <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
            <span className="text-[12px] font-medium uppercase tracking-wide text-zinc-500">Status</span>
            <span
              className="rounded-md border px-2 py-0.5 text-[11.5px] font-semibold"
              style={{
                color: taskStatusMeta(task.status).color,
                backgroundColor: `${taskStatusMeta(task.status).color}14`,
                borderColor: `${taskStatusMeta(task.status).color}33`,
              }}
            >
              {taskStatusMeta(task.status).label}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Priority">
            <Select value={priority} onChange={setPriority}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assignee">
            <Select value={assignedTo} onChange={setAssignedTo}>
              <option value="">Unassigned</option>
              {assignableMembers.map((m) => (
                <option key={m.id || m.user?.id} value={m.id || m.user?.id}>
                  {m.name || m.user?.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="ws-input h-10 w-full rounded-lg px-3 text-[13.5px]"
            />
          </Field>
        </div>

        <Field label="Tags (comma separated)">
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="design, backend"
            className="ws-input h-10 w-full rounded-lg px-3 text-[13.5px]"
          />
        </Field>

        {!task && (
          <Field label="Subtasks">
            <SubtaskEditor
              subtasks={subtasks}
              onChange={setSubtasks}
              onRemove={(index) => setSubtasks((prev) => prev.filter((_, i) => i !== index))}
            />
          </Field>
        )}

        {assignableMembers.length === 0 && (
          <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-zinc-400">
            No assignable members yet. Add project members before assigning work.
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-1">
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
      </form>
    </Modal>
  );
}
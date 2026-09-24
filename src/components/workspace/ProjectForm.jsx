"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { useMutation, useResource } from "@/hooks/useResource";
import { PROJECT_STATUS_META, PROJECT_PRIORITY_META } from "@/lib/workspaceApi";

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function ProjectForm({ open, onClose, onSubmit, title, submitLabel, project = null }) {
  const { run, loading } = useMutation();
  const { data: meta } = useResource("/projects/meta", { enabled: open });

  const defaultWorkspaceId = project?.workspace?.id || "";
  const defaultTeamId = project?.team?.id || "";
  const defaultManagerId = project?.manager?.id || "";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState(defaultTeamId);
  const [managerId, setManagerId] = useState(defaultManagerId);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [status, setStatus] = useState("PLANNING");
  const [error, setError] = useState("");

  // Reset the form each time the modal opens (or the page mounts it open).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setName(project?.name || "");
      setDescription(project?.description || "");
      setTeamId(project?.team?.id || "");
      setManagerId(project?.manager?.id || "");
      setStartDate(toDateInput(project?.startDate));
      setDueDate(toDateInput(project?.dueDate));
      setPriority(project?.priority || "MEDIUM");
      setStatus(project?.status || "PLANNING");
      setError("");
    }
  }, [open, project]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const workspaces = useMemo(() => meta?.workspaces || [], [meta]);

  // In edit mode the workspace is fixed to the project's workspace; in create
  // mode derive it from the chosen team.
  const currentWorkspaceId = project
    ? defaultWorkspaceId
    : (workspaces.find((w) => w.teams?.some((t) => t.id === teamId))?.id || "");

  const teams = useMemo(() => {
    const source = project
      ? workspaces.find((w) => w.id === defaultWorkspaceId)?.teams || []
      : workspaces.flatMap((w) =>
          w.teams.map((t) => ({ ...t, workspaceId: w.id, workspaceName: w.name })),
        );
    return source;
  }, [workspaces, project, defaultWorkspaceId]);

  const managers = useMemo(() => {
    if (!currentWorkspaceId) return [];
    const workspace = workspaces.find((w) => w.id === currentWorkspaceId);
    return workspace?.members || [];
  }, [workspaces, currentWorkspaceId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("A project name is required");
      return;
    }
    if (!teamId) {
      setError("Choose a team for this project");
      return;
    }
    if (!managerId) {
      setError("Choose a project manager");
      return;
    }
    const values = {
      name: name.trim(),
      description: description.trim(),
      teamId,
      managerId,
      startDate: startDate || null,
      dueDate: dueDate || null,
      priority,
    };
    if (project) values.status = status;
    await onSubmit(values, run);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
            Name
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Website redesign"
            className="ws-input h-11 w-full rounded-lg px-3.5 text-[14.5px]"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What is this project about?"
            className="ws-input w-full rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
              Team
            </span>
            <select
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                if (!e.target.value) setManagerId("");
              }}
              className="ws-input h-11 w-full rounded-lg px-3 text-[14px]"
            >
              <option value="">Select a team…</option>
              {project
                ? teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))
                : workspaces.map((workspace) => (
                    <optgroup key={workspace.id} label={workspace.name}>
                      {workspace.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
              Manager
            </span>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              disabled={!currentWorkspaceId}
              className="ws-input h-11 w-full rounded-lg px-3 text-[14px] disabled:opacity-50"
            >
              <option value="">
                {currentWorkspaceId ? "Select a manager…" : "Choose a team first…"}
              </option>
              {managers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.email}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
              Start date
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="ws-input h-11 w-full rounded-lg px-3.5 text-[14.5px]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
              Due date
            </span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="ws-input h-11 w-full rounded-lg px-3.5 text-[14.5px]"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
              Priority
            </span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="ws-input h-11 w-full rounded-lg px-3 text-[14px]"
            >
              {Object.entries(PROJECT_PRIORITY_META).map(([value, metaItem]) => (
                <option key={value} value={value}>
                  {metaItem.label}
                </option>
              ))}
            </select>
          </label>

          {project && (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
                Status
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="ws-input h-11 w-full rounded-lg px-3 text-[14px]"
              >
                {Object.entries(PROJECT_STATUS_META).map(([value, metaItem]) => (
                  <option key={value} value={value}>
                    {metaItem.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[13px] text-red-300" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2.5 pt-1">
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
            {loading ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
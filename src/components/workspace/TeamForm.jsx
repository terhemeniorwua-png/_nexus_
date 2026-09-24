"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { useMutation } from "@/hooks/useResource";

export default function TeamForm({ open, onClose, onSubmit, title, submitLabel }) {
  const { run, loading } = useMutation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  // Reset the form each time the modal opens.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setError("");
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("A team name is required");
      return;
    }
    await onSubmit({ name: name.trim(), description: description.trim() }, run);
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
            Team name
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Engineering"
            maxLength={120}
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
            placeholder="What does this team do?"
            maxLength={1000}
            className="ws-input w-full rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed"
          />
        </label>

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
            {loading ? "Creating…" : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
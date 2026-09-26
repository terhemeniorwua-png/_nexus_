"use client";

import { useEffect, useState } from "react";
import Modal from "../Modal";
import { useMutation } from "@/hooks/useResource";
import {
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_META,
  RESOURCE_ENDPOINTS,
} from "@/lib/projectResources";

const EMPTY = { name: "", url: "", category: "RESEARCH", description: "" };

function Field({ label, hint, children, required = false }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
        {required ? <span className="ml-1 text-red-400">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11.5px] text-zinc-600">{hint}</span> : null}
    </label>
  );
}

export default function ResourceFormModal({
  open,
  onClose,
  onSaved,
  workspaceId,
  projectId,
  resource = null,
}) {
  const editing = Boolean(resource);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const { run, loading } = useMutation();

  // Reused for editing, so it seeds from the target whenever that changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      editing
        ? {
            name: resource.name || "",
            url: resource.url || "",
            category: resource.category || "OTHER",
            description: resource.description || "",
          }
        : EMPTY
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();
    if (!name) {
      setError("Give the resource a name so people recognise it in the list.");
      return;
    }

    // The PATCH handler only skips a field when it is `undefined`, so both
    // optional values are always sent — that is what lets a user clear a URL or
    // description that is already stored. Omitting blanks instead would leave
    // the old value in place with no way to remove it.
    const payload = {
      name,
      category: form.category,
      url: form.url.trim(),
      description: form.description.trim(),
    };

    const path = editing
      ? RESOURCE_ENDPOINTS.item(workspaceId, projectId, resource.id)
      : RESOURCE_ENDPOINTS.list(workspaceId, projectId);

    const result = await run(path, {
      method: editing ? "PATCH" : "POST",
      body: payload,
    });

    if (result.error) {
      setError(result.error.message);
      return;
    }

    onSaved?.(result.data?.resource || result.data);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit resource" : "Add resource"}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required>
          <input
            value={form.name}
            onChange={(event) => set({ name: event.target.value })}
            placeholder="Attention Is All You Need"
            maxLength={200}
            className="ws-input h-10 w-full rounded-lg px-3 text-[13.5px] text-zinc-100"
          />
        </Field>

        <Field
          label="Link"
          hint="Optional. Where the resource lives — a paper, a repo, a docs page."
        >
          <input
            value={form.url}
            onChange={(event) => set({ url: event.target.value })}
            placeholder="https://arxiv.org/abs/1706.03762"
            inputMode="url"
            maxLength={1000}
            className="ws-input h-10 w-full rounded-lg px-3 text-[13.5px] text-zinc-100"
          />
        </Field>

        <Field label="Category">
          <select
            value={form.category}
            onChange={(event) => set({ category: event.target.value })}
            className="ws-input h-10 w-full rounded-lg px-3 text-[13.5px] text-zinc-100"
          >
            {RESOURCE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {RESOURCE_CATEGORY_META[category]?.label || category}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Description"
          hint="Optional. Why the project is pointing at this, and when it is worth reading."
        >
          <textarea
            value={form.description}
            onChange={(event) => set({ description: event.target.value })}
            rows={3}
            maxLength={2000}
            placeholder="The reference implementation the attention mechanism in the final report is based on."
            className="ws-input w-full resize-y rounded-lg px-3 py-2 text-[13.5px] text-zinc-100"
          />
        </Field>

        {error ? (
          <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-[12.5px] text-red-300">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-[13px] font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? "Saving…" : editing ? "Save changes" : "Add resource"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

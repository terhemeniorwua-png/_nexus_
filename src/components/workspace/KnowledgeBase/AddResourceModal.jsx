"use client";

import { useEffect, useState } from "react";
import Modal from "../Modal";
import { useMutation } from "@/hooks/useResource";
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_META,
  KNOWLEDGE_TYPES,
  KNOWLEDGE_TYPE_META,
  knowledgeTypeForUrl,
} from "@/lib/knowledge";
import { PlusIcon } from "../icons";

const EMPTY = { title: "", description: "", category: "DOCUMENTATION", typeChoice: "", url: "", content: "" };

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

export default function AddResourceModal({ open, onClose, onSaved, workspaceId, projectId, resource = null }) {
  const editing = Boolean(resource);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const { run, loading } = useMutation();

  // The modal is reused for editing, so seed it whenever the target changes.
  // Same shape as TaskFormModal: the form mirrors the record it is editing, and
  // remounting would lose the draft the user just typed.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      editing
        ? {
            title: resource.title || "",
            description: resource.description || "",
            category: resource.category || "OTHER",
            // An explicit type is preserved on edit; only inferred types fall
            // back to "auto" so the dropdown keeps meaning what it said.
            typeChoice: KNOWLEDGE_TYPES.includes(resource.resourceType) ? resource.resourceType : "",
            url: resource.url || "",
            content: resource.content || "",
          }
        : EMPTY
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const resourceType = form.typeChoice || knowledgeTypeForUrl(form.url);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    const title = form.title.trim();
    if (!title) {
      setError("Give the resource a title so people can find it later.");
      return;
    }

    // Provenance fields are never sent: they are owned by the promotion path.
    const payload = {
      title,
      description: form.description.trim() || undefined,
      category: form.category,
      resourceType,
      url: form.url.trim() || undefined,
      content: form.content.trim() || undefined,
    };

    const result = await run(
      `/workspaces/${workspaceId}/projects/${projectId}/knowledge${editing ? `/${resource.id}` : ""}`,
      { method: editing ? "PATCH" : "POST", body: payload }
    );

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
        <Field label="Title" required>
          <input
            value={form.title}
            onChange={(event) => set({ title: event.target.value })}
            placeholder="Complete API Documentation"
            maxLength={200}
            className="ws-input h-10 w-full rounded-lg px-3 text-[13.5px] text-zinc-100"
          />
        </Field>

        <Field label="Description" hint="One or two lines on what this covers and when to use it.">
          <textarea
            value={form.description}
            onChange={(event) => set({ description: event.target.value })}
            rows={2}
            maxLength={1000}
            placeholder="Endpoint reference for the Nexus API, including auth and pagination."
            className="ws-input w-full resize-y rounded-lg px-3 py-2 text-[13.5px] text-zinc-100"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select
              value={form.category}
              onChange={(event) => set({ category: event.target.value })}
              className="ws-input h-10 w-full rounded-lg px-3 text-[13.5px] text-zinc-100"
            >
              {KNOWLEDGE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {KNOWLEDGE_CATEGORY_META[category]?.label || category}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Type"
            hint={
              form.typeChoice
                ? undefined
                : `Inferred as ${KNOWLEDGE_TYPE_META[resourceType]?.label?.toLowerCase() || "document"}.`
            }
          >
            <select
              value={form.typeChoice}
              onChange={(event) => set({ typeChoice: event.target.value })}
              className="ws-input h-10 w-full rounded-lg px-3 text-[13.5px] text-zinc-100"
            >
              <option value="">Automatic</option>
              {KNOWLEDGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {KNOWLEDGE_TYPE_META[type]?.label || type}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Link" hint="Optional. Add a URL for a web page, docs site or code repository.">
          <input
            value={form.url}
            onChange={(event) => set({ url: event.target.value })}
            placeholder="https://github.com/nexus/platform"
            inputMode="url"
            className="ws-input h-10 w-full rounded-lg px-3 text-[13.5px] text-zinc-100"
          />
        </Field>

        <Field label="Notes" hint="Optional. Paste an extract or a decision you want to keep with the resource.">
          <textarea
            value={form.content}
            onChange={(event) => set({ content: event.target.value })}
            rows={3}
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
          >
            <PlusIcon size={14} />
            {loading ? "Saving…" : editing ? "Save changes" : "Add resource"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

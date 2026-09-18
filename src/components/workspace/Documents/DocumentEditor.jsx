"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import EmptyState from "../EmptyState";
import Avatar from "../Avatar";
import { DocIcon, TrashIcon, CheckIcon, EditIcon } from "../icons";
import { useMutation } from "@/hooks/useResource";
import { formatRelative } from "@/lib/workspaceApi";

export default function DocumentEditor({ workspaceId, document, onSaved, onDeleted }) {
  const { run, loading } = useMutation();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState("split");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Reset the editor whenever a different document is opened/loaded.
/* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setTitle(document?.title || "");
    setContent(document?.content || "");
    setDirty(false);
    setError("");
  }, [document?.id, document?.content, document?.title]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!document) {
    return (
      <div className="hidden flex-1 items-center justify-center md:flex">
        <EmptyState
          icon={<DocIcon size={22} />}
          title="Select a document"
          description="Pick a document from the list, or create a new one."
        />
      </div>
    );
  }

  async function handleSave() {
    if (!dirty) return;
    setError("");
    const { data, error: apiError } = await run(
      `/workspaces/${workspaceId}/documents/${document.id}`,
      { method: "PATCH", body: { title: title.trim(), content } }
    );
    if (apiError) {
      setError(apiError.message);
      return;
    }
    setDirty(false);
    onSaved && onSaved(data.document);
  }

  async function handleDelete() {
    setDeleting(true);
    setError("");
    const { error: apiError } = await run(
      `/workspaces/${workspaceId}/documents/${document.id}`,
      { method: "DELETE" }
    );
    setDeleting(false);
    if (apiError) {
      setError(apiError.message);
      return;
    }
    onDeleted && onDeleted(document.id);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-3.5">
        <span className="text-zinc-500">
          <DocIcon size={18} />
        </span>

        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          aria-label="Document title"
          className="h-9 flex-1 bg-transparent font-mono text-[15px] font-semibold text-white outline-none placeholder:text-zinc-600"
          placeholder="Untitled"
        />

        <div className="hidden items-center rounded-lg border border-white/10 bg-white/5 p-0.5 sm:flex">
          {["split", "edit", "preview"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1.5 text-[11.5px] font-medium capitalize transition-colors ${
                mode === m ? "bg-white/15 text-white" : "text-zinc-500 hover:text-white"
              }`}
            >
              {m === "split" ? "Split" : m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {dirty && (
            <span className="flex items-center gap-1.5 text-[12px] text-amber-300/90">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
              Unsaved
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || loading}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[12.5px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-white/25 disabled:text-zinc-400"
          >
            {loading ? "Saving…" : (
              <>
                <CheckIcon size={13} /> Save
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete document"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:border-red-400/30 hover:text-red-400 disabled:opacity-50"
          >
            <TrashIcon size={15} />
          </button>
        </div>
      </div>

      {error && (
        <p className="border-b border-red-400/20 bg-red-400/10 px-5 py-2 text-[12.5px] text-red-300" role="alert">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className={`min-h-0 flex-1 ${mode === "edit" || mode === "split" ? "flex" : "hidden"}`}>
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            spellCheck={false}
            aria-label="Markdown source"
            className={`min-h-0 flex-1 resize-none bg-transparent font-mono text-[13.5px] leading-relaxed text-zinc-200 outline-none ws-scroll ${
              mode === "split" ? "w-1/2 border-r border-white/8 px-5 py-5" : "w-full px-5 py-5"
            }`}
            placeholder={"# Start writing in Markdown…\n\n**Bold**, _italic_, `code`, lists & tables all work."}
          />
        </div>

        <div className={`min-h-0 flex-1 ${mode === "preview" || mode === "split" ? "flex" : "hidden"}`}>
          <div
            className={`ws-prose min-h-0 flex-1 overflow-y-auto ws-scroll px-5 py-5 ${
              mode === "split" ? "w-1/2" : "w-full"
            }`}
          >
            {content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            ) : (
            <p className="text-zinc-600">Preview will appear here as you type.</p>
          )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/8 px-5 py-2.5 text-[11.5px] text-zinc-500">
        <span className="flex items-center gap-2">
          <Avatar name={document.createdBy?.name} size={18} />
          Edited by {document.createdBy?.name || "someone"}
        </span>
        <span className="flex items-center gap-1">
          <EditIcon size={12} /> Updated {formatRelative(document.updatedAt)}
        </span>
      </div>
    </div>
  );
}
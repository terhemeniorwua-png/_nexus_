"use client";

import { useState } from "react";
import EmptyState from "../EmptyState";
import Avatar from "../Avatar";
import { DocIcon, SearchIcon, PlusIcon } from "../icons";
import { formatRelative } from "@/lib/workspaceApi";

export default function DocumentList({ documents = [], selectedId, onSelect, onNew, loading }) {
  const [query, setQuery] = useState("");

  const filtered = documents.filter((doc) => {
    const haystack = `${doc.title} ${doc.projectId?.name || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <div className="flex h-full w-full flex-col md:w-72 md:border-r md:border-white/8">
      <div className="flex items-center gap-2 border-b border-white/8 p-3">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-500">
            <SearchIcon size={14} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter documents…"
            className="ws-input h-9 w-full rounded-lg pl-9 pr-3 text-[13px]"
          />
        </div>
        <button
          type="button"
          onClick={onNew}
          className="flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-[12.5px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
        >
          <PlusIcon size={14} /> New
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto ws-scroll p-2.5">
        {loading && documents.length === 0 && (
          <p className="px-3 py-6 text-center text-[13px] text-zinc-600">Loading documents…</p>
        )}

        {!loading && filtered.length === 0 && (
          <EmptyState
            icon={<DocIcon size={20} />}
            title="No documents"
            description="Create your first document to start writing."
          />
        )}

        {filtered.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => onSelect(doc.id)}
            className={`w-full rounded-xl border p-3 text-left transition-colors ${
              selectedId === doc.id
                ? "border-white/20 bg-white/[0.07]"
                : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="truncate text-[13.5px] font-medium text-zinc-100">{doc.title}</span>
              <Avatar name={doc.createdBy?.name} size={20} />
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-zinc-500">
              {doc.projectId?.name ? (
                <span className="rounded bg-white/5 px-1.5 py-0.5 font-medium text-zinc-400">
                  {doc.projectId.name}
                </span>
              ) : (
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-600">Untitled space</span>
              )}
              <span>{formatRelative(doc.updatedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
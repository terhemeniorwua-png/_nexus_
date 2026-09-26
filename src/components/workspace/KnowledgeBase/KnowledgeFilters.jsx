"use client";

import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_META,
  KNOWLEDGE_STATUSES,
  KNOWLEDGE_STATUS_META,
  KNOWLEDGE_TYPES,
  KNOWLEDGE_TYPE_META,
  knowledgeCategoryLabel,
  knowledgeStatusLabel,
  knowledgeTypeLabel,
} from "@/lib/knowledge";
import { SearchIcon, XIcon } from "../icons";
import { CategoryIcon } from "./categoryIcon";

function Select({ value, onChange, children, className = "", label }) {
  return (
    <label className={`block ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="ws-input h-9 w-full rounded-lg px-2.5 text-[12.5px] text-zinc-300"
      >
        {children}
      </select>
    </label>
  );
}

export default function KnowledgeFilters({
  filters,
  onChange,
  summary,
  shownCount,
  hasActiveFilters,
}) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const byCategory = summary?.byCategory || {};

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(event) => set({ search: event.target.value })}
            placeholder="Search titles, descriptions and people…"
            aria-label="Search knowledge base"
            className="ws-input h-9 w-full rounded-lg pl-9 pr-3 text-[12.5px] text-zinc-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:w-auto">
          <Select
            label="Filter by status"
            value={filters.status}
            onChange={(value) => set({ status: value })}
          >
            <option value="">All statuses</option>
            {KNOWLEDGE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {KNOWLEDGE_STATUS_META[status]?.label || knowledgeStatusLabel(status)}
              </option>
            ))}
          </Select>

          <Select
            label="Filter by type"
            value={filters.resourceType}
            onChange={(value) => set({ resourceType: value })}
          >
            <option value="">All types</option>
            {KNOWLEDGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {KNOWLEDGE_TYPE_META[type]?.label || knowledgeTypeLabel(type)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Category tabs double as the per-category counts, so "counts per
          category" is answered where the reader is already looking. */}
      <div className="ws-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => set({ category: "" })}
          aria-pressed={!filters.category}
          className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
            !filters.category
              ? "border-white/20 bg-white/10 text-white"
              : "border-white/6 bg-white/[0.02] text-zinc-400 hover:border-white/14 hover:text-zinc-200"
          }`}
        >
          All
          <span className="ml-1.5 text-[11px] text-zinc-500">{summary?.active ?? 0}</span>
        </button>

        {KNOWLEDGE_CATEGORIES.map((category) => {
          const meta = KNOWLEDGE_CATEGORY_META[category];
          const active = filters.category === category;
          return (
            <button
              key={category}
              type="button"
              onClick={() => set({ category: active ? "" : category })}
              aria-pressed={active}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                active
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/6 bg-white/[0.02] text-zinc-400 hover:border-white/14 hover:text-zinc-200"
              }`}
            >
              <CategoryIcon category={category} size={13} />
              {meta?.label || knowledgeCategoryLabel(category)}
              <span className="text-[11px] text-zinc-500">{byCategory[category] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 text-[12px] text-zinc-500">
        <span>
          {shownCount === 1 ? "1 resource" : `${shownCount} resources`}
          {hasActiveFilters ? " matching your filters" : " in this project"}
        </span>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() => onChange({ search: "", category: "", status: "", resourceType: "" })}
            className="inline-flex items-center gap-1 text-zinc-400 transition-colors hover:text-white"
          >
            <XIcon size={12} />
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

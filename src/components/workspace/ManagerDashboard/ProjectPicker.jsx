"use client";

/**
 * Phase 21 — the project selector.
 *
 * Presentational: the project list and the current selection arrive as props
 * from `GET /api/me/manager-dashboard`, and the component only reports an
 * intent. It cannot widen the scope, because the backend re-validates whatever
 * id is sent — this is a convenience, not the gate.
 *
 * "All managed projects" is a real option rather than an implied default: the
 * endpoint aggregates across every managed project when no id is sent, and
 * showing that as an explicit choice is honest about what the numbers mean.
 */
export default function ProjectPicker({ projects = [], selected, onSelect, loading }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label
        htmlFor="manager-project"
        className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-zinc-500"
      >
        Project
      </label>

      <div className="relative sm:min-w-[280px]">
        <select
          id="manager-project"
          value={selected || "all"}
          disabled={loading}
          onChange={(event) => onSelect(event.target.value === "all" ? null : event.target.value)}
          className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 py-2.5 pl-3.5 pr-9 text-[13px] font-medium text-white outline-none transition-colors hover:border-white/20 focus:border-white/30 disabled:opacity-60"
        >
          <option value="all" className="bg-zinc-900">
            All managed projects
          </option>
          {projects.map((project) => (
            <option key={project.id} value={project.id} className="bg-zinc-900">
              {project.name} · {project.workspaceName}
            </option>
          ))}
        </select>
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
          aria-hidden="true"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>

      {selected && (
        <p className="text-[12px] text-zinc-500">
          Figures below cover this project only.
        </p>
      )}
    </div>
  );
}

"use client";

export default function EmptyState({ icon, title, description, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 px-6 py-12 text-center ${className}`}>
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-white">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
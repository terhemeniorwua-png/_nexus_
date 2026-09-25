"use client";

/**
 * Phase 11 — one progress indicator for the whole app.
 *
 * The value always comes from the backend (task.progress / project.progress);
 * this component only renders it. The width is derived from the percentage so
 * no caller can hardcode a bar, and the value is exposed to assistive tech via
 * role="progressbar" + aria-value* rather than colour/width alone.
 */

const SIZES = {
  xs: { track: "h-1", text: "text-[10.5px]" },
  sm: { track: "h-1.5", text: "text-[11px]" },
  md: { track: "h-2", text: "text-[12px]" },
  lg: { track: "h-2.5", text: "text-[13px]" },
};

const TONES = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  purple: "bg-purple-500",
};

function toPercentage(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export default function ProgressBar({
  value,
  label,
  size = "sm",
  tone = "blue",
  showValue = true,
  hint,
  className = "",
}) {
  const percentage = toPercentage(value);
  const sizing = SIZES[size] || SIZES.sm;
  const fill = TONES[tone] || TONES.blue;

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className={`mb-1.5 flex items-center justify-between gap-2 ${sizing.text}`}>
          {label ? <span className="truncate text-zinc-500">{label}</span> : <span />}
          {showValue && (
            <span className="shrink-0 font-semibold text-zinc-300">{percentage}%</span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Progress"}
        aria-valuetext={`${percentage}%`}
        title={hint}
        className={`w-full overflow-hidden rounded-full bg-white/8 ${sizing.track}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${fill}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

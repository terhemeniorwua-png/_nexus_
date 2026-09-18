"use client";

import { NexusLogo } from "@/components/NexusLogo";

export function Spinner({ size = 16, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PageLoader({ label = "Loading…" }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background">
      <NexusLogoIcon />
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner size={16} />
        <span>{label}</span>
      </div>
    </div>
  );
}

function NexusLogoIcon() {
  return <NexusLogo showWordmark={false} size={40} />;
}
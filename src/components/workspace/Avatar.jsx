"use client";

import { initialsOf } from "@/lib/workspaceApi";

const PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#0d9488",
  "#ca8a04",
  "#dc2626",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

export function colorFor(name) {
  if (!name) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < String(name).length; i++) {
    hash = (hash * 31 + String(name).charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export default function Avatar({
  name,
  userId,
  online,
  size = 32,
  showPresence = false,
  className = "",
}) {
  const initials = initialsOf(name);
  const backgroundColor = colorFor(name || userId);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor,
        fontSize: Math.max(10, Math.round(size * 0.36)),
      }}
      title={name}
    >
      {initials}
      {showPresence && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full border-2 border-[#09090b] ${
            online ? "bg-emerald-400" : "bg-zinc-600"
          }`}
          style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28) }}
        />
      )}
    </span>
  );
}
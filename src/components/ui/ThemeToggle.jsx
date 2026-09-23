"use client";

import { useSyncExternalStore } from "react";

function SunIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

const THEME_EVENT = "nexus:theme";

function applyTheme(light) {
  const root = document.documentElement;
  root.classList.toggle("light", light);
  root.style.colorScheme = light ? "light" : "dark";
  try {
    localStorage.setItem("nexus-theme", light ? "light" : "dark");
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT));
}

function subscribe(callback) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

export function ThemeToggle({ className = "" }) {
  const isLight = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("light"),
    () => false
  );

  function handleToggle() {
    applyTheme(!isLight);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Switch to dark theme" : "Switch to light theme"}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:border-white/25 hover:text-white focus-ring ${className}`}
    >
      {isLight ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export default ThemeToggle;
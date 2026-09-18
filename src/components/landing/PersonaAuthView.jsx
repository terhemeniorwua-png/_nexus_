"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { LoginForm, LoginFooter } from "@/components/auth/LoginForm";
import { ArrowLeftIcon, XIcon } from "@/components/auth/AuthIcons";

export function PersonaAuthView({ persona, onChangeType, onClose }) {
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!isMounted) return null;

  function closeOnBackdrop(event) {
    if (event.target === event.currentTarget) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      onClick={closeOnBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${persona.optionTitle} sign in`}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 focus-ring"
        >
          <XIcon size={16} />
        </button>

        <div className="mb-5 flex items-center gap-3 pr-8">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 ${persona.accent}`}
          >
            <persona.icon size={18} />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-50">
              {persona.title}
            </h2>
            <p className="text-sm text-zinc-400">{persona.subtitle}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onChangeType}
          className="mb-5 inline-flex items-center gap-1.5 rounded text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-200 focus-ring"
        >
          <ArrowLeftIcon size={13} />
          Change account type
        </button>

        <LoginForm persona={persona} />

        <p className="mt-6 text-center text-sm text-zinc-400">
          <LoginFooter />
        </p>
      </div>
    </div>,
    document.body
  );
}
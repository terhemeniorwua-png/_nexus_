"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { PERSONAS } from "@/components/auth/personas";
import { ArrowLeftIcon, ArrowRightIcon, XIcon } from "@/components/auth/AuthIcons";

export function UserTypeSelector({ onSelect, onBack, onClose }) {
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
        aria-label="Choose account type"
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 focus-ring"
        >
          <XIcon size={16} />
        </button>

        <header className="pr-8">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-50">
            How will you use Nexus?
          </h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            Pick the account type that fits you best — you can change it later.
          </p>
        </header>

        <div className="mt-6 space-y-3">
          {PERSONAS.map((persona) => (
            <button
              key={persona.type}
              type="button"
              onClick={() => onSelect(persona.type)}
              className="group hero-card flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08] focus-ring"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 ${persona.accent}`}
              >
                <persona.icon size={20} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-zinc-100">
                  {persona.optionTitle}
                </span>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  {persona.optionRole}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-zinc-400">
                  {persona.optionCopy}
                </span>
              </span>

              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition-colors group-hover:border-indigo-400/40 group-hover:text-indigo-300">
                <ArrowRightIcon size={15} />
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onBack}
          className="mt-6 inline-flex items-center gap-1.5 rounded text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-200 focus-ring"
        >
          <ArrowLeftIcon size={13} />
          Back to Welcome
        </button>
      </div>
    </div>,
    document.body
  );
}
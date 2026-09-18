"use client";

import { useId, useState } from "react";

function EyeIcon({ className = "" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M2.04 12.32a1 1 0 0 1 0-.64C3.42 7.51 7.36 4.5 12 4.5s8.58 3.01 9.96 7.18a1 1 0 0 1 0 .64C20.58 16.49 16.64 19.5 12 19.5S3.42 16.49 2.04 12.32Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon({ className = "" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M10.6 5.08A9.8 9.8 0 0 1 12 5c4.64 0 8.58 3.01 9.96 7.18a1 1 0 0 1 0 .64 10.6 10.6 0 0 1-2.03 3.6M6.6 6.6A9.8 9.8 0 0 0 2.04 12.32a1 1 0 0 0 0 .64c1.38 4.17 5.32 7.04 9.96 7.04 2.06 0 3.97-.6 5.53-1.64"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AuthInput({
  id,
  label,
  error,
  hint,
  type = "text",
  leadingIcon,
  autoComplete,
  className = "",
  ...props
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && showPassword ? "text" : type;
  const hasError = Boolean(error);

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-zinc-200">
        {label}
      </label>

      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-zinc-500">
            {leadingIcon}
          </span>
        )}

        <input
          id={inputId}
          type={resolvedType}
          autoComplete={autoComplete}
          aria-invalid={hasError}
          aria-describedby={
            hasError
              ? `${inputId}-error`
              : hint
                ? `${inputId}-hint`
                : undefined
          }
          className={`h-11 w-full rounded-lg border bg-zinc-900/80 text-[15px] text-white backdrop-blur transition-colors placeholder:text-zinc-500 outline-none
            focus:border-white focus:ring-2 focus:ring-white/20 focus:outline-none
            ${leadingIcon ? "pl-11" : "px-3.5"}
            ${isPassword ? "pr-11" : ""}
            ${hasError ? "border-red-400/60" : "border-zinc-800 hover:border-zinc-600"}`}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-zinc-500 transition-colors hover:text-zinc-200 focus-ring"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>

      {hasError && (
        <p id={`${inputId}-error`} className="mt-1.5 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {!hasError && hint && (
        <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-zinc-500">
          {hint}
        </p>
      )}
    </div>
  );
}
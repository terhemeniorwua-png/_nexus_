"use client";

import { Spinner } from "@/components/auth/Loader";

const variants = {
  primary:
    "bg-primary text-white hover:bg-blue-700 focus-ring disabled:bg-blue-400/70",
  secondary:
    "bg-white text-foreground border border-border-subtle hover:bg-slate-50 focus-ring disabled:opacity-60",
  ghost:
    "bg-transparent text-primary hover:bg-blue-50 focus-ring disabled:opacity-60",
  danger:
    "bg-danger text-white hover:bg-red-700 focus-ring disabled:bg-red-400/70",
};

const sizes = {
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
  sm: "h-9 px-3 text-sm",
};

export function Button({
  type = "button",
  variant = "primary",
  size = "lg",
  loading = false,
  disabled = false,
  fullWidth = false,
  className = "",
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors
        ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && <Spinner size={15} />}
      {children}
    </button>
  );
}
// THEMED: shadcn-style button API while preserving existing imports.
import React from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:   "border border-sky-400/40 bg-[linear-gradient(135deg,#38bdf8_0%,#2563eb_100%)] text-white shadow-[0_14px_30px_rgba(37,99,235,0.28)] hover:brightness-105 focus-visible:ring-sky-500",
  secondary: "border border-white/90 bg-white/78 text-slate-700 shadow-[0_12px_28px_rgba(148,163,184,0.12)] hover:bg-white focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-800",
  ghost:     "bg-transparent text-slate-600 hover:bg-slate-100/80 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:bg-slate-800",
  danger:    "border border-red-400/30 bg-[linear-gradient(135deg,#fb7185_0%,#ef4444_100%)] text-white shadow-[0_14px_30px_rgba(239,68,68,0.22)] hover:brightness-105 focus-visible:ring-red-500",
  success:   "border border-emerald-400/30 bg-[linear-gradient(135deg,#34d399_0%,#10b981_100%)] text-white shadow-[0_14px_30px_rgba(16,185,129,0.22)] hover:brightness-105 focus-visible:ring-emerald-500",
};

const SIZES: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 rounded-xl",
  md: "text-sm px-4 py-2 rounded-xl",
  lg: "text-sm px-5 py-2.5 rounded-2xl",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-2 font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      ) : icon}
      {children}
    </button>
  );
}

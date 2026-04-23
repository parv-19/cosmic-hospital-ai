// THEMED: semantic shadcn-style badge primitive.
import React from "react";
import { cn } from "../../lib/utils";

type Variant = "success" | "warning" | "danger" | "info" | "neutral" | "live";

const VARIANTS: Record<Variant, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  danger:  "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  info:    "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  live:    "bg-emerald-500 text-white",
};

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export function Badge({ variant = "neutral", children, dot = false, className = "" }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-200", VARIANTS[variant], className)}>
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", variant === "live" ? "bg-white" : "bg-current")}
        />
      )}
      {children}
    </span>
  );
}

/** Maps common call outcomes to variant */
export function outcomeVariant(outcome: string): Variant {
  const o = outcome?.toLowerCase() ?? "";
  if (o.includes("rescheduled") || o.includes("reschedule")) return "warning";
  if (o.includes("booked") || o.includes("success")) return "success";
  if (o.includes("transfer")) return "info";
  if (o.includes("fail") || o.includes("abandon") || o.includes("error") || o.includes("cancel")) return "danger";
  if (o.includes("active") || o.includes("live")) return "live";
  return "neutral";
}

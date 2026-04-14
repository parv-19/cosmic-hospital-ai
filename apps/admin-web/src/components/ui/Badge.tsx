import React from "react";

type Variant = "success" | "warning" | "danger" | "info" | "neutral" | "live";

const VARIANTS: Record<Variant, string> = {
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger:  "bg-red-100 text-red-600",
  info:    "bg-indigo-100 text-indigo-700",
  neutral: "bg-slate-100 text-slate-600",
  live:    "bg-green-500 text-white",
};

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export function Badge({ variant = "neutral", children, dot = false, className = "" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${VARIANTS[variant]} ${className}`}>
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${variant === "live" ? "bg-white" : "bg-current"}`}
        />
      )}
      {children}
    </span>
  );
}

/** Maps common call outcomes → variant */
export function outcomeVariant(outcome: string): Variant {
  const o = outcome?.toLowerCase() ?? "";
  if (o.includes("booked") || o.includes("success")) return "success";
  if (o.includes("transfer")) return "info";
  if (o.includes("fail") || o.includes("abandon") || o.includes("error")) return "danger";
  if (o.includes("active") || o.includes("live")) return "live";
  return "neutral";
}

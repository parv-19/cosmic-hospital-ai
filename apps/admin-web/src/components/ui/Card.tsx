// THEMED: shadcn-style card primitives used across the admin SaaS UI.
import React from "react";
import { cn } from "../../lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: "sm" | "md" | "lg" | "none";
}

export function Card({ children, className = "", hover = false, padding = "md" }: CardProps) {
  const pad = { sm: "p-4", md: "p-5", lg: "p-6", none: "" }[padding];
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-100 bg-white shadow-card transition-colors duration-200 dark:border-slate-700 dark:bg-slate-800",
        pad,
        hover && "card-lift cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// THEMED: premium card primitives used across the admin SaaS UI.
import React from "react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../context/ThemeContext";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: "sm" | "md" | "lg" | "none";
}

export function Card({ children, className = "", hover = false, padding = "md" }: CardProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const pad = { sm: "p-4", md: "p-5", lg: "p-6", none: "" }[padding];
  return (
    <div
      className={cn(
        "rounded-[28px] border backdrop-blur-sm transition-colors duration-200",
        isDark
          ? "border-slate-700/90 bg-slate-900/72 shadow-[0_22px_60px_rgba(2,6,23,0.42)]"
          : "border-white/90 bg-white/78 shadow-[0_20px_50px_rgba(148,163,184,0.16)]",
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
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 className={cn("text-lg font-extrabold tracking-tight", isDark ? "text-white" : "text-slate-950")}>{title}</h2>
        {subtitle && <p className={cn("mt-1 text-xs font-medium", isDark ? "text-slate-400" : "text-slate-500")}>{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

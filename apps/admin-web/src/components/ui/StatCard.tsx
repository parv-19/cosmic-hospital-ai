// THEMED: premium KPI card primitive.
import React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../context/ThemeContext";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  iconBgLight?: string;
  iconBgDark?: string;
  sub?: string;
  trend?: { value: string; up: boolean };
}

export function StatCard({
  label,
  value,
  icon,
  iconBg,
  iconBgLight = "bg-sky-100",
  iconBgDark = "bg-sky-500/15",
  sub,
  trend,
}: StatCardProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const resolvedIconBg = iconBg ?? (isDark ? iconBgDark : iconBgLight);

  return (
    <div
      className={cn(
        "card-lift relative overflow-hidden rounded-[26px] border p-5 backdrop-blur-sm transition-colors duration-200 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-[linear-gradient(90deg,#38bdf8_0%,#6366f1_100%)]",
        isDark
          ? "border-slate-700/90 bg-slate-900/75 shadow-[0_22px_60px_rgba(2,6,23,0.4)]"
          : "border-white/90 bg-white/80 shadow-[0_20px_50px_rgba(148,163,184,0.16)]"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={cn("text-[11px] font-bold uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-400")}>{label}</p>
          <p className={cn("mt-2 text-3xl font-black tracking-tight", isDark ? "text-white" : "text-slate-950")}>{value}</p>
          {sub && <p className={cn("mt-0.5 text-xs", isDark ? "text-slate-500" : "text-slate-400")}>{sub}</p>}
          {trend && (
            <p className={cn("mt-1.5 inline-flex items-center gap-1 text-xs font-medium", trend.up ? (isDark ? "text-emerald-300" : "text-emerald-600") : (isDark ? "text-red-300" : "text-red-500"))}>
              {trend.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />} {trend.value}
            </p>
          )}
        </div>
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]", resolvedIconBg)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

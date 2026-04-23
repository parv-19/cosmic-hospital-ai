// THEMED: premium KPI card primitive.
import React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "../../lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  sub?: string;
  trend?: { value: string; up: boolean };
}

export function StatCard({ label, value, icon, iconBg = "bg-sky-100 dark:bg-sky-500/15", sub, trend }: StatCardProps) {
  return (
    <div className="card-lift rounded-2xl border border-slate-100 border-t-4 border-t-sky-500 bg-white p-5 shadow-card transition-colors duration-200 dark:border-slate-700 dark:border-t-sky-400 dark:bg-slate-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
          <p className="mt-1.5 text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
          {trend && (
            <p className={cn("mt-1.5 inline-flex items-center gap-1 text-xs font-medium", trend.up ? "text-emerald-600 dark:text-emerald-300" : "text-red-500 dark:text-red-300")}>
              {trend.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />} {trend.value}
            </p>
          )}
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconBg)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

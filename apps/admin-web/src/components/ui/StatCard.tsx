import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  sub?: string;
  trend?: { value: string; up: boolean };
}

export function StatCard({ label, value, icon, iconBg = "bg-indigo-100", sub, trend }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 card-lift">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-800">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
          {trend && (
            <p className={`text-xs font-medium mt-1.5 ${trend.up ? "text-emerald-600" : "text-red-500"}`}>
              {trend.up ? "▲" : "▼"} {trend.value}
            </p>
          )}
        </div>
        <div className={`w-11 h-11 ${iconBg} rounded-xl flex items-center justify-center shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// THEMED: dark-mode table primitive with the existing generic API.
import React from "react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../context/ThemeContext";

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No records found.",
  loading = false,
}: TableProps<T>) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-[24px] backdrop-blur-sm",
        isDark
          ? "border border-slate-700 bg-[#0f172a] shadow-[inset_0_1px_0_rgba(148,163,184,0.06)]"
          : "border border-slate-200/80 bg-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
      )}
    >
      <table className="w-full text-sm">
        <thead>
          <tr
            className={cn(
              "border-b",
              isDark
                ? "border-slate-700 bg-[#162236]"
                : "border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.9))]"
            )}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-[0.18em]",
                  isDark ? "text-slate-300" : "text-slate-500",
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-sm text-slate-400">
                <div className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin text-sky-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Loading...
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-sm text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-b transition-colors duration-200 last:border-0",
                  isDark
                    ? i % 2 === 0
                      ? "border-slate-700 bg-[#0f172a] hover:bg-slate-800/80"
                      : "border-slate-700 bg-[#111827] hover:bg-slate-800/80"
                    : i % 2 === 0
                      ? "border-slate-200/90 bg-white/70 hover:bg-sky-50/70"
                      : "border-slate-200/90 bg-slate-50/85 hover:bg-sky-50/70",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-4 py-3.5", isDark ? "text-slate-200" : "text-slate-800", col.className)}
                  >
                    {col.render ? col.render(row) : String(row[col.key] ?? "-")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

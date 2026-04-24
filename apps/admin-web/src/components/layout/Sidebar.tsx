// THEMED: responsive SaaS sidebar navigation.
import React from "react";
import {
  BarChart3,
  Bot,
  CalendarClock,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  PhoneCall,
  Settings,
  SlidersHorizontal,
  Users,
  X
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import type { Role } from "../../api";
import { cn } from "../../lib/utils";

export type NavPage =
  | "dashboard"
  | "analytics"
  | "call-logs"
  | "directory"
  | "settings"
  | "prompts"
  | "behaviour"
  | "ai-config";

interface NavItem {
  id: NavPage;
  label: string;
  roles: Role[];
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", roles: ["ADMIN", "DOCTOR", "READ_ONLY"], icon: <LayoutDashboard size={18} /> },
  { id: "analytics", label: "Analytics", roles: ["ADMIN", "READ_ONLY"], icon: <BarChart3 size={18} /> },
  { id: "call-logs", label: "Call Logs", roles: ["ADMIN", "DOCTOR", "READ_ONLY"], icon: <PhoneCall size={18} /> },
  { id: "directory", label: "Doctors", roles: ["ADMIN", "DOCTOR", "READ_ONLY"], icon: <Users size={18} /> },
  { id: "settings", label: "Settings", roles: ["ADMIN", "DOCTOR"], icon: <Settings size={18} /> },
  { id: "prompts", label: "Prompts", roles: ["ADMIN", "DOCTOR"], icon: <MessageSquareText size={18} /> },
  { id: "behaviour", label: "Behaviour", roles: ["ADMIN"], icon: <SlidersHorizontal size={18} /> },
  { id: "ai-config", label: "AI Providers", roles: ["ADMIN"], icon: <FlaskConical size={18} /> },
];

interface SidebarProps {
  current: NavPage;
  onChange: (page: NavPage) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ current, onChange, mobileOpen = false, onCloseMobile }: SidebarProps) {
  const { user, logout } = useAuth();
  const role = user?.role ?? "READ_ONLY";
  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role));

  function selectPage(page: NavPage) {
    onChange(page);
    onCloseMobile?.();
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm md:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full w-[272px] flex-col border-r border-white/60 bg-[linear-gradient(180deg,#fbfdff_0%,#f3f7ff_100%)] shadow-[0_20px_70px_rgba(148,163,184,0.18)] transition-transform duration-200 dark:border-slate-800 dark:bg-[linear-gradient(180deg,#0f172a_0%,#111c34_100%)] dark:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex items-center gap-3 border-b border-slate-200/70 px-5 py-5 dark:border-slate-800">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#38bdf8_0%,#2563eb_100%)] shadow-[0_14px_32px_rgba(37,99,235,0.28)]">
            <Bot size={20} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold leading-tight text-slate-950 dark:text-white">AI Receptionist</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-600/80 dark:text-sky-300/70">
              {role === "ADMIN" ? "Admin Console" : role === "DOCTOR" ? "Doctor Portal" : "Read Only"}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden dark:hover:bg-slate-800 dark:hover:text-white"
            onClick={onCloseMobile}
          >
            <X size={17} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Navigation</p>
          <div className="space-y-1.5">
            {visible.map((item) => {
              const active = current === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id}`}
                  onClick={() => selectPage(item.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-sm font-medium transition-all duration-200",
                    active
                      ? "border-sky-200 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(59,130,246,0.06))] text-sky-700 shadow-[0_10px_24px_rgba(14,165,233,0.10)] dark:border-sky-500/20 dark:bg-sky-900/20 dark:text-sky-300"
                      : "border-transparent text-slate-500 hover:border-white hover:bg-white/80 hover:text-slate-900 hover:shadow-[0_10px_24px_rgba(148,163,184,0.12)] dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                  )}
                >
                  <span className={cn("transition-transform duration-200", active ? "scale-105" : "group-hover:scale-105")}>{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.id === "call-logs" && <CalendarClock size={13} className="opacity-50" />}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          <div className="rounded-[24px] border border-white/80 bg-white/75 p-3 shadow-[0_14px_32px_rgba(148,163,184,0.14)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/50 dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#e0f2fe_0%,#dbeafe_100%)] text-xs font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                {(user?.name ?? "U")[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{user?.name ?? "User"}</p>
                <p className="truncate text-[10px] text-slate-400">{user?.email ?? ""}</p>
              </div>
              <button
                id="logout-btn"
                onClick={logout}
                title="Logout"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

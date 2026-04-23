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
  { id: "directory", label: "Directory", roles: ["ADMIN", "DOCTOR", "READ_ONLY"], icon: <Users size={18} /> },
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
          "fixed left-0 top-0 z-40 flex h-full w-[260px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 dark:border-slate-800">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500 shadow-card-md">
            <Bot size={20} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight text-slate-900 dark:text-white">AI Receptionist</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
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
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Navigation</p>
          <div className="space-y-1">
            {visible.map((item) => {
              const active = current === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id}`}
                  onClick={() => selectPage(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-left text-sm font-medium transition-colors duration-200",
                    active
                      ? "border-sky-500 bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300"
                      : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  )}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.id === "call-logs" && <CalendarClock size={13} className="opacity-50" />}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
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

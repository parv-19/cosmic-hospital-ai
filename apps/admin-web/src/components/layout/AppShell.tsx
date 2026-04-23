// THEMED: responsive application shell with dark mode controls.
import React, { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, Menu, Moon, Search, Sun, UserCircle } from "lucide-react";
import { Sidebar, type NavPage } from "./Sidebar";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { DashboardPage } from "../admin/dashboard/DashboardPage";
import { AnalyticsPage } from "../admin/analytics/AnalyticsPage";
import { CallLogsPage } from "../admin/call-logs/CallLogsPage";
import { DirectoryPage } from "../admin/directory/DirectoryPage";
import { SettingsPage } from "../admin/settings/SettingsPage";
import { PromptsPage } from "../admin/settings/PromptsPage";
import { BehaviourPage } from "../admin/settings/BehaviourPage";
import { AIConfigPage } from "../admin/settings/AIConfigPage";

const PAGE_TITLES: Record<NavPage, string> = {
  dashboard:  "Dashboard",
  analytics:  "Analytics",
  "call-logs": "Call Logs",
  directory:  "Directory",
  settings:   "Settings",
  prompts:    "Prompts",
  behaviour:  "Behaviour",
  "ai-config": "AI Providers",
};

function TopBar({ page, onOpenMenu }: { page: NavPage; onOpenMenu: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <header className="fixed left-0 right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:left-[260px] md:px-6 dark:border-slate-800 dark:bg-slate-900/95">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 md:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          onClick={onOpenMenu}
        >
          <Menu size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{PAGE_TITLES[page]}</h1>
          <p className="hidden text-xs text-slate-400 sm:block">{dateStr} · {timeStr}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative hidden w-72 lg:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search callers, doctors, settings..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition-colors duration-200 placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        <button className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
          <Bell size={17} />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800" />
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            <span className="h-2 w-2 rounded-full bg-emerald-400 live-pulse" />
            <span className="hidden sm:inline">{user?.role === "ADMIN" ? "Admin" : user?.role === "DOCTOR" ? "Doctor" : "Read Only"}</span>
            <UserCircle size={17} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-card-lg dark:border-slate-700 dark:bg-slate-800">
              <div className="px-2 py-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.name ?? "User"}</p>
                <p className="text-xs text-slate-400">{user?.email ?? ""}</p>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
              <DropdownMenu.Item
                onClick={logout}
                className="cursor-pointer rounded-lg px-2 py-2 text-sm font-medium text-red-600 outline-none transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                Logout
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const defaultPage: NavPage = user?.role === "DOCTOR" ? "dashboard" : "dashboard";
  const [page, setPage] = useState<NavPage>(defaultPage);
  const [mobileOpen, setMobileOpen] = useState(false);

  function renderPage() {
    switch (page) {
      case "dashboard":  return <DashboardPage />;
      case "analytics":  return <AnalyticsPage />;
      case "call-logs":  return <CallLogsPage />;
      case "directory":  return <DirectoryPage />;
      case "settings":   return <SettingsPage />;
      case "prompts":    return <PromptsPage />;
      case "behaviour":  return <BehaviourPage />;
      case "ai-config":  return <AIConfigPage />;
      default:           return <DashboardPage />;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 transition-colors duration-200 dark:bg-slate-900">
      <Sidebar current={page} onChange={setPage} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <TopBar page={page} onOpenMenu={() => setMobileOpen(true)} />
      <main className="min-h-screen pt-16 md:ml-[260px]">
        <div className="p-4 transition-all duration-200 sm:p-6 page-enter">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

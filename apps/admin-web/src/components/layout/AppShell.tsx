// THEMED: responsive application shell with premium light/dark controls.
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
  dashboard: "Dashboard",
  analytics: "Analytics",
  "call-logs": "Call Logs",
  directory: "Doctors",
  settings: "Settings",
  prompts: "Prompts",
  behaviour: "Behaviour",
  "ai-config": "AI Providers",
};

function TopBar({ page, onOpenMenu }: { page: NavPage; onOpenMenu: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <header className="fixed left-0 right-0 top-0 z-20 flex h-[74px] items-center justify-between border-b border-white/80 bg-white/78 px-4 backdrop-blur-xl md:left-[272px] md:px-8 dark:border-slate-800 dark:bg-[#0b1220]/96">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/90 bg-white/85 text-slate-600 shadow-[0_10px_24px_rgba(148,163,184,0.14)] md:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          onClick={onOpenMenu}
        >
          <Menu size={18} />
        </button>
        <div>
          <h1 className="text-[1.7rem] font-black tracking-tight text-slate-950 dark:text-white">{PAGE_TITLES[page]}</h1>
          <p className="hidden text-xs font-medium text-slate-500 sm:block dark:text-slate-400">{`${dateStr} · ${timeStr}`}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative hidden w-80 lg:block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search callers, doctors, settings..."
            className="h-12 w-full rounded-[18px] border border-white/90 bg-white/72 pl-11 pr-4 text-sm text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_12px_28px_rgba(148,163,184,0.12)] outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200"
          />
        </div>

        <button className="relative inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/90 bg-white/78 text-slate-500 shadow-[0_12px_28px_rgba(148,163,184,0.12)] transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800">
          <Bell size={17} />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800" />
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/90 bg-white/78 text-slate-500 shadow-[0_12px_28px_rgba(148,163,184,0.12)] transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex h-11 items-center gap-2 rounded-[18px] border border-white/90 bg-white/78 px-3 text-sm font-semibold text-slate-700 shadow-[0_12px_28px_rgba(148,163,184,0.12)] transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-800">
            <span className="h-2 w-2 rounded-full bg-emerald-400 live-pulse" />
            <span className="hidden sm:inline">
              {user?.role === "ADMIN" ? "Admin" : user?.role === "DOCTOR" ? "Doctor" : "Read Only"}
            </span>
            <UserCircle size={17} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 min-w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_54px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="px-2 py-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.name ?? "User"}</p>
                <p className="text-xs text-slate-400">{user?.email ?? ""}</p>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
              <DropdownMenu.Item
                onClick={logout}
                className="cursor-pointer rounded-xl px-2 py-2 text-sm font-medium text-red-600 outline-none transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
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
      case "dashboard":
        return <DashboardPage />;
      case "analytics":
        return <AnalyticsPage />;
      case "call-logs":
        return <CallLogsPage />;
      case "directory":
        return <DirectoryPage />;
      case "settings":
        return <SettingsPage />;
      case "prompts":
        return <PromptsPage />;
      case "behaviour":
        return <BehaviourPage />;
      case "ai-config":
        return <AIConfigPage />;
      default:
        return <DashboardPage />;
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.10),transparent_28%),radial-gradient(circle_at_top_right,rgba(99,102,241,0.08),transparent_24%),linear-gradient(180deg,#f7f9fc_0%,#eef3fb_100%)] transition-colors duration-200 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_22%),linear-gradient(180deg,#0b1220_0%,#0f172a_55%,#111827_100%)]">
      <Sidebar current={page} onChange={setPage} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <TopBar page={page} onOpenMenu={() => setMobileOpen(true)} />
      <main className="min-h-screen pt-[74px] md:ml-[272px]">
        <div className="p-4 transition-all duration-200 sm:p-6 md:p-7 page-enter">{renderPage()}</div>
      </main>
    </div>
  );
}

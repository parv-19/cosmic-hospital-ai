import React, { useState } from "react";
import { Sidebar, type NavPage } from "./Sidebar";
import { useAuth } from "../../context/AuthContext";
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

function TopBar({ page }: { page: NavPage }) {
  const { user } = useAuth();

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <header className="fixed top-0 left-60 right-0 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-20">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-slate-800">{PAGE_TITLES[page]}</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-slate-400 hidden sm:block">
          {dateStr} · {timeStr}
        </span>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 live-pulse" />
          <span className="text-xs font-medium text-slate-600">
            {user?.role === "ADMIN" ? "Admin" : user?.role === "DOCTOR" ? "Doctor" : "Read Only"}
          </span>
        </div>
      </div>
    </header>
  );
}

export function AppShell() {
  const { user } = useAuth();

  // Default landing page by role
  const defaultPage: NavPage = user?.role === "DOCTOR" ? "dashboard" : "dashboard";
  const [page, setPage] = useState<NavPage>(defaultPage);

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
    <div className="min-h-screen bg-slate-50">
      <Sidebar current={page} onChange={setPage} />
      <TopBar page={page} />
      <main className="ml-60 pt-14 min-h-screen">
        <div className="p-6 page-enter">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

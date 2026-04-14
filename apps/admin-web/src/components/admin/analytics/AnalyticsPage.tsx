import React, { useEffect, useState, useCallback } from "react";
import { fetchAnalytics, fetchCalls, type AnalyticsResponse, type CallRecord } from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { StatCard } from "../../ui/StatCard";
import { Card, CardHeader } from "../../ui/Card";
import { PageLoader } from "../../ui/Spinner";

function BarChart({ data, color = "#6366f1" }: { data: { label: string; value: number }[]; color?: string }) {
  if (!data || data.length === 0) return <p className="text-sm text-slate-400">No data available.</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-32 shrink-0 truncate">{item.label}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(item.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-700 w-6 text-right shrink-0">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function AnalyticsPage() {
  const { token } = useAuth();
  const [data, setData]   = useState<AnalyticsResponse | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]    = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [a, c] = await Promise.all([fetchAnalytics(token), fetchCalls(token)]);
      setData(a);
      setCalls(c);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader />;
  if (error)   return <div className="text-red-500 text-sm p-4">{error}</div>;

  // Derive extra stats from raw calls
  const avgDuration = calls.length
    ? Math.round(calls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0) / calls.length)
    : 0;

  const totalCost = 0; // cost field not in CallRecord — no fake data

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Calls"
          value={data?.totalCalls ?? calls.length}
          iconBg="bg-indigo-100"
          icon={<svg width="20" height="20" className="text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
        />
        <StatCard
          label="Booking Rate"
          value={`${Math.round((data?.bookingRate ?? 0) * 100)}%`}
          iconBg="bg-emerald-100"
          sub="of total calls"
          icon={<svg width="20" height="20" className="text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
        />
        <StatCard
          label="Transfer Rate"
          value={`${Math.round((data?.transferRate ?? 0) * 100)}%`}
          iconBg="bg-amber-100"
          sub="of total calls"
          icon={<svg width="20" height="20" className="text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>}
        />
        <StatCard
          label="Avg Duration"
          value={fmtDuration(avgDuration)}
          iconBg="bg-blue-100"
          sub="per call"
          icon={<svg width="20" height="20" className="text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Doctor Demand" subtitle="Call volume by doctor" />
          <BarChart data={data?.doctorDemand ?? []} color="#6366f1" />
        </Card>
        <Card>
          <CardHeader title="Intent Distribution" subtitle="What callers are asking for" />
          <BarChart data={data?.intentDistribution ?? []} color="#10b981" />
        </Card>
      </div>

      {/* Call outcome breakdown */}
      {calls.length > 0 && (
        <Card>
          <CardHeader title="Call Outcomes" subtitle={`Based on ${calls.length} total call records`} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Booked",    count: calls.filter(c => c.outcome?.toLowerCase().includes("book")).length,    color: "bg-emerald-400" },
              { label: "Transferred", count: calls.filter(c => c.outcome?.toLowerCase().includes("transfer")).length, color: "bg-amber-400" },
              { label: "Failed",    count: calls.filter(c => c.outcome?.toLowerCase().includes("fail")).length,    color: "bg-red-400" },
              { label: "Other",     count: calls.filter(c => !["book","transfer","fail"].some(k => c.outcome?.toLowerCase().includes(k))).length, color: "bg-slate-300" },
            ].map((item) => (
              <div key={item.label} className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className={`w-10 h-10 ${item.color} rounded-full mx-auto mb-2`} />
                <p className="text-xl font-bold text-slate-800">{item.count}</p>
                <p className="text-xs text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

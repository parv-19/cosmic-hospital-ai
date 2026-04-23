import React, { useEffect, useState, useCallback } from "react";
// THEMED: analytics uses existing call data with SaaS chart cards.
import { fetchAnalytics, fetchCalls, type AnalyticsResponse, type CallRecord } from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { StatCard } from "../../ui/StatCard";
import { Card, CardHeader } from "../../ui/Card";
import { PageLoader } from "../../ui/Spinner";

type ChartPoint = {
  label: string;
  value: number;
};

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

function pct(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtPercent(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  const percent = numeric > 1 ? numeric : numeric * 100;
  return `${percent.toFixed(2)}%`;
}

function fmtMoney(value: number | null | undefined) {
  return `Rs. ${Number(value ?? 0).toFixed(4)}`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function callDateValue(call: CallRecord) {
  return toDateInputValue(new Date(call.startedAt));
}

function buildLastSevenDays(calls: CallRecord[]): ChartPoint[] {
  const today = new Date();

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    const dateValue = toDateInputValue(day);

    return {
      label: day.toLocaleDateString("en-IN", { weekday: "short" }),
      value: calls.filter((call) => callDateValue(call) === dateValue).length,
    };
  });
}

function sumCost(calls: CallRecord[], key: "sttCost" | "ttsCost" | "llmCost" | "transferCost" | "totalCost") {
  return calls.reduce((sum, call) => sum + Number(call.costSummary?.[key] ?? 0), 0);
}

function BarChart({ data, color = "#0891b2" }: { data: { label: string; value: number }[]; color?: string }) {
  if (!data || data.length === 0) return <p className="text-sm text-slate-400">No data available.</p>;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-xs font-medium text-slate-500">{item.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(item.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-semibold text-slate-700">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ points, color = "#0891b2" }: { points: ChartPoint[]; color?: string }) {
  const width = 620;
  const height = 190;
  const max = Math.max(1, ...points.map((point) => point.value));
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coordinates = points.map((point, index) => {
    const x = Math.round(index * step);
    const y = Math.round(height - (point.value / max) * 140 - 26);
    return { ...point, x, y };
  });
  const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full overflow-visible" role="img" aria-label="Call trend">
        {[0, 1, 2, 3].map((line) => (
          <line key={line} x1="0" x2={width} y1={28 + line * 44} y2={28 + line * 44} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        <path d={areaPath} fill={color} opacity="0.09" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {coordinates.map((point) => (
          <g key={`${point.label}-${point.x}`}>
            <circle cx={point.x} cy={point.y} r="5" fill="white" stroke={color} strokeWidth="3" />
            <text x={point.x} y={point.y - 12} textAnchor="middle" className="fill-slate-500 text-[19px] font-semibold">
              {point.value}
            </text>
          </g>
        ))}
      </svg>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
        {points.map((point) => <span key={point.label}>{point.label}</span>)}
      </div>
    </div>
  );
}

function DonutChart({ segments, centerLabel, centerValue }: { segments: DonutSegment[]; centerLabel: string; centerValue: string }) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  let offset = 25;

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 42 42" className="h-36 w-36 -rotate-90" role="img" aria-label={centerLabel}>
          <circle cx="21" cy="21" r="15.915" fill="none" stroke="#e2e8f0" strokeWidth="6" />
          {segments.map((segment) => {
            const share = total ? (segment.value / total) * 100 : 0;
            const currentOffset = offset;
            offset -= share;

            return (
              <circle
                key={segment.label}
                cx="21"
                cy="21"
                r="15.915"
                fill="none"
                stroke={segment.color}
                strokeWidth="6"
                strokeDasharray={`${share} ${100 - share}`}
                strokeDashoffset={currentOffset}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-slate-800">{centerValue}</span>
          <span className="text-[10px] font-semibold uppercase text-slate-400">{centerLabel}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {segments.map((segment) => (
          <div key={segment.label}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-2 font-semibold text-slate-600">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: segment.color }} />
                {segment.label}
              </span>
              <span className="font-bold text-slate-800">{total ? `${pct(segment.value, total)}%` : "0%"}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${total ? pct(segment.value, total) : 0}%`, backgroundColor: segment.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightRow({ label, value, tone }: { label: string; value: string; tone: "cyan" | "emerald" | "amber" | "rose" }) {
  const toneClass = {
    cyan: "border-cyan-100 bg-cyan-50 text-cyan-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
  }[tone];

  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${toneClass}`}>
      <span className="text-xs font-semibold">{label}</span>
      <span className="truncate pl-3 text-sm font-bold">{value}</span>
    </div>
  );
}

export function AnalyticsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  if (error) return <div className="p-4 text-sm text-red-500">{error}</div>;

  const avgDuration = calls.length
    ? Math.round(calls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0) / calls.length)
    : 0;
  const totalCost = sumCost(calls, "totalCost");
  const avgCost = calls.length ? totalCost / calls.length : 0;
  const sevenDayTrend = buildLastSevenDays(calls);
  const bookedCount = calls.filter((c) => c.outcome?.toLowerCase().includes("book")).length;
  const transferredCount = calls.filter((c) => c.outcome?.toLowerCase().includes("transfer")).length;
  const failedCount = calls.filter((c) => c.outcome?.toLowerCase().includes("fail")).length;
  const otherCount = Math.max(0, calls.length - bookedCount - transferredCount - failedCount);
  const outcomeSegments = [
    { label: "Booked", value: bookedCount, color: "#10b981" },
    { label: "Transferred", value: transferredCount, color: "#f59e0b" },
    { label: "Failed", value: failedCount, color: "#ef4444" },
    { label: "Other", value: otherCount, color: "#64748b" },
  ].filter((segment) => segment.value > 0);
  const costSegments = [
    { label: "STT", value: sumCost(calls, "sttCost"), color: "#0891b2" },
    { label: "TTS", value: sumCost(calls, "ttsCost"), color: "#10b981" },
    { label: "LLM", value: sumCost(calls, "llmCost"), color: "#f59e0b" },
    { label: "Transfer", value: sumCost(calls, "transferCost"), color: "#f43f5e" },
  ].filter((segment) => segment.value > 0);
  const busiestDoctor = data?.doctorDemand?.slice().sort((a, b) => b.value - a.value)[0];
  const topIntent = data?.intentDistribution?.slice().sort((a, b) => b.value - a.value)[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard
          label="Total Calls"
          value={data?.totalCalls ?? calls.length}
          iconBg="bg-cyan-100"
          icon={<svg width="20" height="20" className="text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
        />
        <StatCard
          label="Booking Rate"
          value={fmtPercent(data?.bookingRate)}
          iconBg="bg-emerald-100"
          sub="of total calls"
          icon={<svg width="20" height="20" className="text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
        />
        <StatCard
          label="Transfer Rate"
          value={fmtPercent(data?.transferRate)}
          iconBg="bg-amber-100"
          sub="of total calls"
          icon={<svg width="20" height="20" className="text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>}
        />
        <StatCard
          label="Avg Duration"
          value={fmtDuration(avgDuration)}
          iconBg="bg-sky-100"
          sub="per call"
          icon={<svg width="20" height="20" className="text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
        />
        <StatCard
          label="Avg Cost"
          value={fmtMoney(avgCost)}
          iconBg="bg-slate-100"
          sub="per call"
          icon={<svg width="20" height="20" className="text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Call Trend"
            subtitle="Last 7 days across the platform"
            action={<span className="rounded-md bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">{calls.length} total calls</span>}
          />
          <TrendChart points={sevenDayTrend} />
        </Card>

        <Card>
          <CardHeader title="Operations Snapshot" subtitle="Highest demand signals" />
          <div className="space-y-3">
            <InsightRow label="Busiest doctor" value={busiestDoctor?.label ?? "No data"} tone="cyan" />
            <InsightRow label="Top intent" value={topIntent?.label ?? "No data"} tone="emerald" />
            <InsightRow label="Total cost" value={fmtMoney(totalCost)} tone="amber" />
            <InsightRow label="Failed calls" value={`${failedCount}`} tone="rose" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Outcome Mix" subtitle={`Based on ${calls.length} call records`} />
          <DonutChart
            segments={outcomeSegments.length ? outcomeSegments : [{ label: "No calls", value: 1, color: "#cbd5e1" }]}
            centerLabel="Calls"
            centerValue={String(calls.length)}
          />
        </Card>

        <Card>
          <CardHeader title="Cost Split" subtitle="Estimated provider spend" />
          <DonutChart
            segments={costSegments.length ? costSegments : [{ label: "No cost", value: 1, color: "#cbd5e1" }]}
            centerLabel="Cost"
            centerValue={fmtMoney(totalCost)}
          />
        </Card>

        <Card>
          <CardHeader title="Doctor Demand" subtitle="Call volume by doctor" />
          <BarChart data={data?.doctorDemand ?? []} color="#0891b2" />
        </Card>

        <Card>
          <CardHeader title="Intent Distribution" subtitle="What callers are asking for" />
          <BarChart data={data?.intentDistribution ?? []} color="#10b981" />
        </Card>
      </div>
    </div>
  );
}

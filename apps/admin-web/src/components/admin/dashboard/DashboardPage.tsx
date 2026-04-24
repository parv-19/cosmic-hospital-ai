import React, { useEffect, useState, useCallback } from "react";
// THEMED: dashboard keeps existing data calls with premium shared UI primitives.
import {
  fetchAppointments,
  fetchDashboard,
  fetchCalls,
  fetchDoctors,
  fetchSettings,
  fetchTranscript,
  type AppointmentRecord,
  type CallRecord,
  type DashboardResponse,
  type DoctorRecord,
  type SettingsRecord,
  type TranscriptEntry
} from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { StatCard } from "../../ui/StatCard";
import { Card, CardHeader } from "../../ui/Card";
import { Table } from "../../ui/Table";
import { Badge, outcomeVariant } from "../../ui/Badge";
import { Modal } from "../../ui/Modal";
import { PageLoader } from "../../ui/Spinner";
import { Button } from "../../ui/Button";
import { getDayNameFromDateInput, getSlotSummary } from "../../../utils/slot-visibility";

function fmtDuration(s: number) {
  if (!s) return "-";
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtDate(d: string) {
  if (!d) return "-";
  return new Date(d).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sept", "sep"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"]
];

function parseExplicitAppointmentDate(raw: string) {
  const normalized = raw.toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ");
  for (let month = 0; month < MONTHS.length; month += 1) {
    for (const name of MONTHS[month]) {
      const beforeDay = normalized.match(new RegExp(`\\b(\\d{1,2})\\s+${name}(?:\\s+(\\d{4}))?\\b`, "i"));
      const afterDay = normalized.match(new RegExp(`\\b${name}\\s+(\\d{1,2})(?:\\s+(\\d{4}))?\\b`, "i"));
      const match = beforeDay ?? afterDay;
      if (!match?.[1]) continue;
      const year = Number(match[2] ?? new Date().getFullYear());
      const date = new Date(year, month, Number(match[1]));
      if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === Number(match[1])) {
        return date;
      }
    }
  }
  return null;
}

function fmtAppointmentTarget(call: CallRecord) {
  const raw = (call.appointmentDate ?? [call.preferredDate, call.preferredTime].filter(Boolean).join(" ")).trim();
  if (!raw) return "-";

  const time = call.preferredTime ?? raw.match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/i)?.[0] ?? "";
  const explicitDate = parseExplicitAppointmentDate(raw);
  if (explicitDate) {
    const dateLabel = explicitDate.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    return `${dateLabel}${time ? `, ${time}` : ""}`;
  }

  const lower = raw.toLowerCase();
  const dayIndex = WEEKDAYS.findIndex((day) => lower.includes(day));

  if (dayIndex >= 0 && call.startedAt) {
    const started = new Date(call.startedAt);
    const target = new Date(started);
    const daysAhead = (dayIndex - started.getDay() + 7) % 7 || 7;
    target.setDate(started.getDate() + daysAhead);
    const dateLabel = target.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    return `${dateLabel}${time ? `, ${time}` : ""}`;
  }

  return raw;
}

function fmtMoney(value: number | null | undefined) {
  return `₹${Number(value ?? 0).toFixed(4)}`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recordMatchesDate(record: CallRecord, dateValue: string) {
  if (!dateValue) return true;
  return toDateInputValue(new Date(record.startedAt)) === dateValue;
}

function shortDay(dateKey: string) {
  return new Date(dateKey).toLocaleDateString("en-IN", { weekday: "short" });
}

function buildPastWeekSeries(calls: CallRecord[]) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - index));
    const key = toDateInputValue(d);
    const dayCalls = calls.filter((call) => toDateInputValue(new Date(call.startedAt)) === key);
    const booked = dayCalls.filter((call) => call.outcome === "BOOKED").length;
    return { label: shortDay(key), calls: dayCalls.length, booked };
  });
}

function buildOutcomeRows(calls: CallRecord[]) {
  const mapping = [
    { label: "Booked", key: "BOOKED", color: "from-emerald-400 to-emerald-500" },
    { label: "Transferred", key: "TRANSFERRED", color: "from-amber-400 to-amber-500" },
    { label: "Failed", key: "FAILED", color: "from-rose-400 to-rose-500" },
  ];
  return mapping.map((item) => ({
    ...item,
    value: calls.filter((call) => call.outcome === item.key).length,
  }));
}

function LineTrendChart({ data }: { data: { label: string; calls: number; booked: number }[] }) {
  const width = 520;
  const height = 220;
  const pad = 22;
  const max = Math.max(1, ...data.flatMap((item) => [item.calls, item.booked]));
  const stepX = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  const getX = (index: number) => pad + stepX * index;
  const getY = (value: number) => height - pad - ((height - pad * 2) * value) / max;
  const linePath = (key: "calls" | "booked") =>
    data.map((item, index) => `${index === 0 ? "M" : "L"} ${getX(index)} ${getY(item[key])}`).join(" ");
  const areaPath = `${linePath("calls")} L ${getX(data.length - 1)} ${height - pad} L ${getX(0)} ${height - pad} Z`;

  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.9))] p-5 dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(17,24,39,0.88))]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-extrabold tracking-tight text-slate-950 dark:text-white">Call Trend</p>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Last 7 days call volume vs bookings</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />Calls</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />Booked</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
        <defs>
          <linearGradient id="callsArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = pad + (height - pad * 2) * ratio;
          return <line key={ratio} x1={pad} x2={width - pad} y1={y} y2={y} stroke="rgba(148,163,184,0.18)" strokeDasharray="4 4" />;
        })}
        <path d={areaPath} fill="url(#callsArea)" />
        <path d={linePath("calls")} fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
        <path d={linePath("booked")} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
        {data.map((item, index) => (
          <g key={item.label}>
            <circle cx={getX(index)} cy={getY(item.calls)} r="4.5" fill="#38bdf8" />
            <circle cx={getX(index)} cy={getY(item.booked)} r="4.5" fill="#6366f1" />
            <text x={getX(index)} y={height - 4} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500 text-[11px] font-semibold">
              {item.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function OutcomeBars({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.9))] p-5 dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(17,24,39,0.88))]">
      <p className="text-base font-extrabold tracking-tight text-slate-950 dark:text-white">Outcome Mix</p>
      <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Selected date booking outcomes</p>
      <div className="mt-6 space-y-4">
        {data.map((item) => (
          <div key={item.label}>
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>{item.label}</span>
              <span>{item.value}</span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800/90">
              <div
                className={`h-3 rounded-full bg-gradient-to-r ${item.color}`}
                style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_COST_DISPLAY = {
  showSttCost: true,
  showTtsCost: true,
  showLlmCost: true,
  showTotalCost: true,
};

export function DashboardPage() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<DashboardResponse | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [dateFilter, setDateFilter] = useState(() => toDateInputValue(new Date()));
  const [costDisplay, setCostDisplay] = useState(DEFAULT_COST_DISPLAY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transcriptCall, setTranscriptCall] = useState<CallRecord | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [d, c, settings, doctorList, appointmentList] = await Promise.all([
        fetchDashboard(token),
        fetchCalls(token),
        fetchSettings(token),
        fetchDoctors(token),
        fetchAppointments(token),
      ]);
      setStats(d);
      const firstSettings = settings[0] as SettingsRecord | undefined;
      setCostDisplay({ ...DEFAULT_COST_DISPLAY, ...(firstSettings?.costDisplay ?? {}) });
      setDoctors(doctorList);
      setAppointments(appointmentList);
      setCalls(c.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function openTranscript(call: CallRecord) {
    setTranscriptCall(call);
    setTxLoading(true);
    setTranscript([]);
    try {
      const full = await fetchTranscript(token!, call.sessionId);
      setTranscript(full.transcriptHistory ?? []);
    } catch {
      setTranscript(call.transcriptHistory ?? []);
    } finally {
      setTxLoading(false);
    }
  }

  const isReadOnly = user?.role === "READ_ONLY";

  if (loading) return <PageLoader />;
  if (error) return <div className="p-4 text-sm text-red-500">{error}</div>;

  const totals = stats?.totals;
  const filteredCalls = calls.filter((call) => recordMatchesDate(call, dateFilter));
  const weeklySeries = buildPastWeekSeries(calls);
  const outcomeRows = buildOutcomeRows(filteredCalls);
  const slotDay = getDayNameFromDateInput(dateFilter);
  const slotSummaries = doctors
    .filter((doctor) => doctor.active)
    .map((doctor) => ({ doctor, summary: getSlotSummary(doctor, appointments, slotDay, dateFilter) }));

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Calls Today"
          value={totals?.callsToday ?? 0}
          iconBg="bg-indigo-100"
          icon={<svg width="20" height="20" className="text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8" /><path d="M1 1l22 22" /></svg>}
        />
        <StatCard
          label="Transfers"
          value={totals?.transferred ?? 0}
          iconBg="bg-amber-100"
          icon={<svg width="20" height="20" className="text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>}
        />
        <StatCard
          label="Appointments"
          value={totals?.appointments ?? 0}
          iconBg="bg-emerald-100"
          icon={<svg width="20" height="20" className="text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
        />
        <StatCard
          label="Booked"
          value={totals?.booked ?? 0}
          iconBg="bg-green-100"
          icon={<svg width="20" height="20" className="text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
        />
        <StatCard
          label="Total Cost"
          value={fmtMoney(totals?.totalCost)}
          iconBg="bg-cyan-100"
          icon={<svg width="20" height="20" className="text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <LineTrendChart data={weeklySeries} />
        <OutcomeBars data={outcomeRows} />
      </div>

      {stats?.doctorStats && stats.doctorStats.length > 0 && (
        <Card>
          <CardHeader title="Doctor Performance" subtitle="Today's call breakdown by doctor" />
          <Table
            columns={[
              { key: "doctorName", header: "Doctor" },
              { key: "calls", header: "Calls", render: (r) => <span className="font-bold text-slate-900 dark:text-white">{r.calls as number}</span> },
              { key: "booked", header: "Booked", render: (r) => <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">{r.booked as number}</span> },
              { key: "transferred", header: "Transfers", render: (r) => <span className="rounded-md bg-amber-100 px-2 py-0.5 font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{r.transferred as number}</span> },
              { key: "failed", header: "Failed", render: (r) => <span className="rounded-md bg-red-100 px-2 py-0.5 font-bold text-red-700 dark:bg-red-500/15 dark:text-red-200">{r.failed as number}</span> },
            ]}
            data={stats.doctorStats as unknown as Record<string, unknown>[]}
          />
        </Card>
      )}

      <Card>
        <CardHeader title="Slot Visibility" subtitle={`${slotDay} availability from doctor hours and booked appointments`} />
        {slotSummaries.length === 0 ? (
          <p className="text-sm text-slate-400">No active doctors found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {slotSummaries.map(({ doctor, summary }) => (
              <div key={doctor.doctorId} className="rounded-[24px] border border-white/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.88))] p-4 shadow-[0_18px_42px_rgba(148,163,184,0.12)] transition-colors duration-200 dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(17,24,39,0.84))] dark:shadow-[0_18px_42px_rgba(2,6,23,0.28)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-slate-950 dark:text-white">{doctor.name}</p>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{doctor.specialization || doctor.specialty || "Doctor"}</p>
                  </div>
                  <Badge variant={summary.availableSlots.length > 0 ? "success" : "warning"}>
                    {summary.availableSlots.length > 0 ? "Slots open" : summary.unavailableReason ?? "Full"}
                  </Badge>
                </div>

                <div className="mt-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Available</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.availableSlots.length > 0 ? (
                      summary.availableSlots.slice(0, 8).map((slot) => (
                        <span key={slot} className="rounded-md border border-sky-300 bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-200">
                          {slot}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">No open slot</span>
                    )}
                    {summary.availableSlots.length > 8 && (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">+{summary.availableSlots.length - 8} more</span>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Booked</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.bookedSlots.length > 0 ? (
                      summary.bookedSlots.slice(0, 6).map((slot) => (
                        <span key={`${slot.time}-${slot.patientName}`} className="rounded-md border border-emerald-300 bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200">
                          {slot.time} · {slot.patientName}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">No booking</span>
                    )}
                    {summary.bookedSlots.length > 6 && (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">+{summary.bookedSlots.length - 6} more</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Calls"
          subtitle={`${filteredCalls.length} call${filteredCalls.length !== 1 ? "s" : ""} for selected date`}
          action={
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {!isReadOnly && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={load}
                  icon={<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg>}
                >
                  Refresh
                </Button>
              )}
            </div>
          }
        />
        <Table
          columns={[
            {
              key: "callerNumber",
              header: "Caller",
              render: (r) => <span className="rounded-md bg-slate-200 px-2 py-1 font-mono text-xs font-bold text-slate-800 dark:bg-slate-700 dark:text-slate-100">{r.callerNumber as string}</span>,
            },
            {
              key: "outcome",
              header: "Outcome",
              render: (r) => <Badge variant={outcomeVariant(r.outcome as string)}>{r.outcome as string || "-"}</Badge>,
            },
            {
              key: "appointmentDate",
              header: "Appointment",
              render: (r) => <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{fmtAppointmentTarget(r as unknown as CallRecord)}</span>,
            },
            {
              key: "selectedDoctor",
              header: "Doctor",
              render: (r) => <span className="text-slate-600 dark:text-slate-300">{(r.selectedDoctor as string) || "-"}</span>,
            },
            {
              key: "durationSeconds",
              header: "Duration",
              render: (r) => fmtDuration(r.durationSeconds as number),
            },
            ...(costDisplay.showSttCost ? [{
              key: "sttCost",
              header: "STT Cost",
              render: (r: Record<string, unknown>) => fmtMoney((r as unknown as CallRecord).costSummary?.sttCost),
            }] : []),
            ...(costDisplay.showTtsCost ? [{
              key: "ttsCost",
              header: "TTS Cost",
              render: (r: Record<string, unknown>) => fmtMoney((r as unknown as CallRecord).costSummary?.ttsCost),
            }] : []),
            ...(costDisplay.showLlmCost ? [{
              key: "llmCost",
              header: "LLM Cost",
              render: (r: Record<string, unknown>) => fmtMoney((r as unknown as CallRecord).costSummary?.llmCost),
            }] : []),
            ...(costDisplay.showTotalCost ? [{
              key: "totalCost",
              header: "Total Cost",
              render: (r: Record<string, unknown>) => <span className="font-semibold">{fmtMoney((r as unknown as CallRecord).costSummary?.totalCost)}</span>,
            }] : []),
            {
              key: "startedAt",
              header: "Time",
              render: (r) => <span className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(r.startedAt as string)}</span>,
            },
          ]}
          data={filteredCalls as unknown as Record<string, unknown>[]}
          emptyMessage="No calls recorded for this date."
          onRowClick={(r) => openTranscript(r as unknown as CallRecord)}
        />
        {filteredCalls.length > 0 && (
          <p className="mt-3 text-right text-xs font-medium text-slate-400">Click a row to view transcript</p>
        )}
      </Card>

      <Modal open={!!transcriptCall} onClose={() => setTranscriptCall(null)} title={`Transcript - ${transcriptCall?.callerNumber ?? ""}`} size="lg">
        {txLoading ? (
          <div className="flex justify-center py-8"><PageLoader /></div>
        ) : transcript.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No transcript available.</p>
        ) : (
          <div className="space-y-3">
            {transcript.map((entry, i) => (
              <div key={i} className={`flex gap-3 ${entry.speaker === "bot" ? "flex-row-reverse" : ""}`}>
                <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${entry.speaker === "bot" ? "bg-indigo-100 text-indigo-700 dark:bg-sky-500/20 dark:text-sky-100" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-100"}`}>
                  {entry.speaker === "bot" ? "AI" : "C"}
                </div>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${entry.speaker === "bot" ? "rounded-tr-none bg-indigo-50 text-indigo-900 dark:bg-sky-500/15 dark:text-sky-50" : "rounded-tl-none bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-50"}`}>
                  <p>{entry.text}</p>
                  {entry.timestamp && <p className="mt-1 text-[10px] opacity-50">{fmtDate(entry.timestamp)}</p>}
                </div>
              </div>
            ))}
            <div className="sticky bottom-0 bg-white/95 pt-3 dark:bg-slate-800/95">
              <button
                type="button"
                onClick={() => setTranscriptCall(null)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                Close Transcript
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

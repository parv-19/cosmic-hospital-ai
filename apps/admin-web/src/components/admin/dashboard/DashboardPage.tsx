import React, { useEffect, useState, useCallback } from "react";
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
  if (!s) return "—";
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
function fmtDate(d: string) {
  if (!d) return "—";
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
  if (!raw) return "—";

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

const DEFAULT_COST_DISPLAY = {
  showSttCost: true,
  showTtsCost: true,
  showLlmCost: true,
  showTotalCost: true,
};

export function DashboardPage() {
  const { token, user } = useAuth();
  const [stats, setStats]   = useState<DashboardResponse | null>(null);
  const [calls, setCalls]   = useState<CallRecord[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [dateFilter, setDateFilter] = useState(() => toDateInputValue(new Date()));
  const [costDisplay, setCostDisplay] = useState(DEFAULT_COST_DISPLAY);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  // Transcript modal
  const [transcriptCall, setTranscriptCall] = useState<CallRecord | null>(null);
  const [transcript, setTranscript]         = useState<TranscriptEntry[]>([]);
  const [txLoading, setTxLoading]           = useState(false);

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
    } catch { setTranscript(call.transcriptHistory ?? []); }
    finally { setTxLoading(false); }
  }

  const isReadOnly = user?.role === "READ_ONLY";

  if (loading) return <PageLoader />;
  if (error)   return <div className="text-red-500 text-sm p-4">{error}</div>;

  const totals = stats?.totals;
  const filteredCalls = calls.filter((call) => recordMatchesDate(call, dateFilter));
  const slotDay = getDayNameFromDateInput(dateFilter);
  const slotSummaries = doctors
    .filter((doctor) => doctor.active)
    .map((doctor) => ({ doctor, summary: getSlotSummary(doctor, appointments, slotDay, dateFilter) }));

  return (
    <div className="space-y-6">
      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
          label="Active Calls"
          value={totals?.activeCalls ?? 0}
          iconBg="bg-rose-100"
          sub={totals?.activeCalls ? "Live right now" : undefined}
          icon={<svg width="20" height="20" className="text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
        />
        <StatCard
          label="Total Cost"
          value={fmtMoney(totals?.totalCost)}
          iconBg="bg-cyan-100"
          icon={<svg width="20" height="20" className="text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>}
        />
      </div>

      {/* Doctor Stats */}
      {stats?.doctorStats && stats.doctorStats.length > 0 && (
        <Card>
          <CardHeader title="Doctor Performance" subtitle="Today's call breakdown by doctor" />
          <Table
            columns={[
              { key: "doctorName", header: "Doctor" },
              { key: "calls",      header: "Calls",    render: (r) => <span className="font-semibold text-slate-700">{r.calls as number}</span> },
              { key: "booked",     header: "Booked",   render: (r) => <span className="text-emerald-700 font-medium">{r.booked as number}</span> },
              { key: "transferred",header: "Transfers", render: (r) => <span className="text-amber-700 font-medium">{r.transferred as number}</span> },
              { key: "failed",     header: "Failed",   render: (r) => <span className="text-red-600 font-medium">{r.failed as number}</span> },
            ]}
            data={stats.doctorStats as unknown as Record<string, unknown>[]}
          />
        </Card>
      )}

      {/* Slot visibility */}
      <Card>
        <CardHeader
          title="Slot Visibility"
          subtitle={`${slotDay} availability from doctor hours and booked appointments`}
        />
        {slotSummaries.length === 0 ? (
          <p className="text-sm text-slate-400">No active doctors found.</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {slotSummaries.map(({ doctor, summary }) => (
              <div key={doctor.doctorId} className="border border-slate-200 rounded-lg p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{doctor.name}</p>
                    <p className="text-xs text-slate-500">{doctor.specialization || doctor.specialty || "Doctor"}</p>
                  </div>
                  <Badge variant={summary.availableSlots.length > 0 ? "success" : "warning"}>
                    {summary.availableSlots.length > 0 ? "Slots open" : summary.unavailableReason ?? "Full"}
                  </Badge>
                </div>

                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-400 mb-1">Available</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.availableSlots.length > 0 ? (
                      summary.availableSlots.slice(0, 8).map((slot) => (
                        <span key={slot} className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700">
                          {slot}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                        No open slot
                      </span>
                    )}
                    {summary.availableSlots.length > 8 && (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                        +{summary.availableSlots.length - 8} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-400 mb-1">Booked</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.bookedSlots.length > 0 ? (
                      summary.bookedSlots.slice(0, 6).map((slot) => (
                        <span key={`${slot.time}-${slot.patientName}`} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                          {slot.time} · {slot.patientName}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                        No booking
                      </span>
                    )}
                    {summary.bookedSlots.length > 6 && (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                        +{summary.bookedSlots.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Calls */}
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
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {!isReadOnly && (
                <Button variant="secondary" size="sm" onClick={load}
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
              key: "callerNumber", header: "Caller",
              render: (r) => <span className="font-mono text-xs text-slate-700">{r.callerNumber as string}</span>,
            },
            {
              key: "outcome", header: "Outcome",
              render: (r) => <Badge variant={outcomeVariant(r.outcome as string)}>{r.outcome as string || "—"}</Badge>,
            },
            {
              key: "appointmentDate", header: "Appointment",
              render: (r) => <span className="text-slate-700 text-xs">{fmtAppointmentTarget(r as unknown as CallRecord)}</span>,
            },
            {
              key: "selectedDoctor", header: "Doctor",
              render: (r) => <span className="text-slate-600">{(r.selectedDoctor as string) || "—"}</span>,
            },
            {
              key: "durationSeconds", header: "Duration",
              render: (r) => fmtDuration(r.durationSeconds as number),
            },
            ...(costDisplay.showSttCost ? [{
              key: "sttCost", header: "STT Cost",
              render: (r: Record<string, unknown>) => fmtMoney((r as unknown as CallRecord).costSummary?.sttCost),
            }] : []),
            ...(costDisplay.showTtsCost ? [{
              key: "ttsCost", header: "TTS Cost",
              render: (r: Record<string, unknown>) => fmtMoney((r as unknown as CallRecord).costSummary?.ttsCost),
            }] : []),
            ...(costDisplay.showLlmCost ? [{
              key: "llmCost", header: "LLM Cost",
              render: (r: Record<string, unknown>) => fmtMoney((r as unknown as CallRecord).costSummary?.llmCost),
            }] : []),
            ...(costDisplay.showTotalCost ? [{
              key: "totalCost", header: "Total Cost",
              render: (r: Record<string, unknown>) => <span className="font-semibold">{fmtMoney((r as unknown as CallRecord).costSummary?.totalCost)}</span>,
            }] : []),
            {
              key: "startedAt", header: "Time",
              render: (r) => <span className="text-xs text-slate-500">{fmtDate(r.startedAt as string)}</span>,
            },
          ]}
          data={filteredCalls as unknown as Record<string, unknown>[]}
          emptyMessage="No calls recorded for this date."
          onRowClick={(r) => openTranscript(r as unknown as CallRecord)}
        />
        {filteredCalls.length > 0 && (
          <p className="text-xs text-slate-400 mt-3 text-right">Click a row to view transcript</p>
        )}
      </Card>

      {/* Transcript Modal */}
      <Modal
        open={!!transcriptCall}
        onClose={() => setTranscriptCall(null)}
        title={`Transcript — ${transcriptCall?.callerNumber ?? ""}`}
        size="lg"
      >
        {txLoading ? (
          <div className="flex justify-center py-8"><PageLoader /></div>
        ) : transcript.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No transcript available.</p>
        ) : (
          <div className="space-y-3">
            {transcript.map((entry, i) => (
              <div key={i} className={`flex gap-3 ${entry.speaker === "bot" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${entry.speaker === "bot" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                  {entry.speaker === "bot" ? "AI" : "C"}
                </div>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${entry.speaker === "bot" ? "bg-indigo-50 text-indigo-900 rounded-tr-none" : "bg-slate-100 text-slate-800 rounded-tl-none"}`}>
                  <p>{entry.text}</p>
                  {entry.timestamp && (
                    <p className="text-[10px] mt-1 opacity-50">{fmtDate(entry.timestamp)}</p>
                  )}
                </div>
              </div>
            ))}
            <div className="sticky bottom-0 bg-white/95 pt-3">
              <button
                type="button"
                onClick={() => setTranscriptCall(null)}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                X Close Transcript
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

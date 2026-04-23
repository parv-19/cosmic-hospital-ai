import React, { useEffect, useState, useCallback, useMemo } from "react";
// THEMED: call log filters/table/transcript use shared dark-ready UI.
import { fetchCalls, fetchSettings, fetchTranscript, type CallQualitySeverity, type CallRecord, type SettingsRecord, type TranscriptEntry } from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { Card, CardHeader } from "../../ui/Card";
import { Table } from "../../ui/Table";
import { Badge, outcomeVariant } from "../../ui/Badge";
import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";
import { PageLoader } from "../../ui/Spinner";

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}
function fmtDuration(s: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
function fmtMoney(value: number | null | undefined) {
  return `₹${Number(value ?? 0).toFixed(4)}`;
}

function qualityVariant(severity: CallQualitySeverity | undefined) {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  if (severity === "low") return "info";
  return "success";
}

function isQualityScored(summary: CallRecord["qualitySummary"] | undefined) {
  return Boolean(summary?.updatedAt);
}

function fmtConfidence(confidence: number | null | undefined) {
  if (confidence === null || typeof confidence === "undefined") return "—";
  return `${Math.round(confidence * 100)}%`;
}

function reviewBadgeVariant(needsReview: boolean, confidence: number | null | undefined) {
  if (needsReview || (confidence !== null && typeof confidence !== "undefined" && confidence < 0.72)) return "warning";
  return "success";
}

function buildCallSummary(record: CallRecord | null | undefined) {
  if (!record) return null;
  const explicit = record.analysisSummary?.trim();
  if (explicit) return explicit;

  const analysisHistory = record.analysisHistory ?? [];
  const latestTurn = analysisHistory[analysisHistory.length - 1];
  const summaryParts: string[] = [];

  if (latestTurn) {
    summaryParts.push(`Latest intent: ${latestTurn.detectedIntent.replace(/_/g, " ")}.`);
    if (latestTurn.confidence !== null) {
      summaryParts.push(`Confidence ${Math.round(latestTurn.confidence * 100)}%.`);
    }
  }

  if (record.outcome === "booked") {
    summaryParts.push(`Appointment booked with ${record.selectedDoctor ?? "the selected doctor"}${record.appointmentDate ? ` on ${record.appointmentDate}` : ""}.`);
  } else if (record.outcome === "rescheduled") {
    summaryParts.push(`Appointment rescheduled with ${record.selectedDoctor ?? "the selected doctor"}${record.appointmentDate ? ` on ${record.appointmentDate}` : ""}.`);
  } else if (record.outcome === "cancelled") {
    summaryParts.push(`Appointment cancelled${record.selectedDoctor ? ` for ${record.selectedDoctor}` : ""}.`);
  } else if (record.bookingResult) {
    summaryParts.push(record.bookingResult.trim().endsWith(".") ? record.bookingResult : `${record.bookingResult}.`);
  }

  if (record.patientName) {
    summaryParts.push(`Patient: ${record.patientName}.`);
  }

  return summaryParts.length > 0 ? summaryParts.join(" ") : null;
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

function exportCSV(calls: CallRecord[]) {
  const headers = ["Session ID", "Caller", "Outcome", "Appointment", "Doctor", "Duration (s)", "Started At"];
  const rows = calls.map((c) => [
    c.sessionId, c.callerNumber, c.outcome, fmtAppointmentTarget(c), c.selectedDoctor ?? "", c.durationSeconds, c.startedAt,
  ]);
  const csv = [headers, ...rows].map((r) => r.map(String).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "call-logs.csv"; a.click();
  URL.revokeObjectURL(url);
}

export function CallLogsPage() {
  const { token } = useAuth();
  const [calls, setCalls]       = useState<CallRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [costDisplay, setCostDisplay] = useState(DEFAULT_COST_DISPLAY);

  // Transcript modal
  const [selected, setSelected]     = useState<CallRecord | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [txLoading, setTxLoading]   = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [data, settings] = await Promise.all([fetchCalls(token), fetchSettings(token)]);
      const firstSettings = settings[0] as SettingsRecord | undefined;
      setCostDisplay({ ...DEFAULT_COST_DISPLAY, ...(firstSettings?.costDisplay ?? {}) });
      setCalls(data.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load calls.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      const matchSearch =
        !search ||
        c.callerNumber?.toLowerCase().includes(search.toLowerCase()) ||
        c.sessionId?.toLowerCase().includes(search.toLowerCase()) ||
        c.selectedDoctor?.toLowerCase().includes(search.toLowerCase()) ||
        c.outcome?.toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        statusFilter === "all" ||
        c.outcome?.toLowerCase().includes(statusFilter.toLowerCase());
      const matchDate = recordMatchesDate(c, dateFilter);
      return matchSearch && matchStatus && matchDate;
    });
  }, [calls, search, statusFilter, dateFilter]);

  async function openTranscript(call: CallRecord) {
    setSelected(call);
    setTxLoading(true);
    setTranscript([]);
    try {
      const full = await fetchTranscript(token!, call.sessionId);
      setSelected(full);
      setTranscript(full.transcriptHistory ?? []);
    } catch { setTranscript(call.transcriptHistory ?? []); }
    finally { setTxLoading(false); }
  }

  if (loading) return <PageLoader />;
  if (error)   return <div className="text-red-500 text-sm p-4">{error}</div>;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Call Logs"
          subtitle={`${filtered.length} of ${calls.length} records`}
          action={
            <div className="flex items-center gap-2">
              <Button
                id="export-csv"
                variant="secondary" size="sm"
                onClick={() => exportCSV(filtered)}
                icon={<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>}
              >
                Export CSV
              </Button>
              <Button
                variant="secondary" size="sm"
                onClick={load}
                icon={<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg>}
              >
                Refresh
              </Button>
            </div>
          }
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              id="call-search"
              type="text"
              placeholder="Search by caller, session, doctor, outcome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Outcomes</option>
            <option value="book">Booked</option>
            <option value="transfer">Transferred</option>
            <option value="fail">Failed</option>
          </select>
          <input
            id="date-filter"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {dateFilter && (
            <Button variant="secondary" size="sm" onClick={() => setDateFilter("")}>
              Clear Date
            </Button>
          )}
        </div>

        <Table
          columns={[
            {
              key: "sessionId", header: "Session",
              render: (r) => <span className="font-mono text-xs text-slate-400 max-w-[120px] block truncate">{r.sessionId as string}</span>,
            },
            {
              key: "callerNumber", header: "Caller",
              render: (r) => <span className="font-mono text-sm text-slate-700">{r.callerNumber as string}</span>,
            },
            {
              key: "outcome", header: "Outcome",
              render: (r) => <Badge variant={outcomeVariant(r.outcome as string)}>{r.outcome as string || "—"}</Badge>,
            },
            {
              key: "selectedDoctor", header: "Doctor",
              render: (r) => <span className="text-slate-600 text-sm">{(r.selectedDoctor as string) || "—"}</span>,
            },
            {
              key: "appointmentDate", header: "Appointment",
              render: (r) => <span className="text-slate-700 text-xs">{fmtAppointmentTarget(r as unknown as CallRecord)}</span>,
            },
            {
              key: "selectedSpecialization", header: "Specialty",
              render: (r) => <span className="text-slate-500 text-xs">{(r.selectedSpecialization as string) || "—"}</span>,
            },
            {
              key: "qualitySummary", header: "Quality",
              render: (r) => {
                const summary = (r as unknown as CallRecord).qualitySummary;
                const scored = isQualityScored(summary);
                return (
                  <Badge variant={scored ? qualityVariant(summary?.severity) : "neutral"}>
                    {scored ? `${summary?.score ?? 0}/100` : "Not scored"}
                  </Badge>
                );
              },
            },
            {
              key: "durationSeconds", header: "Duration",
              render: (r) => <span className="text-slate-600 text-sm">{fmtDuration(r.durationSeconds as number)}</span>,
            },
            ...(costDisplay.showSttCost ? [{
              key: "sttCost", header: "STT Cost",
              render: (r: Record<string, unknown>) => <span className="text-slate-600 text-xs">{fmtMoney((r as unknown as CallRecord).costSummary?.sttCost)}</span>,
            }] : []),
            ...(costDisplay.showTtsCost ? [{
              key: "ttsCost", header: "TTS Cost",
              render: (r: Record<string, unknown>) => <span className="text-slate-600 text-xs">{fmtMoney((r as unknown as CallRecord).costSummary?.ttsCost)}</span>,
            }] : []),
            ...(costDisplay.showLlmCost ? [{
              key: "llmCost", header: "LLM Cost",
              render: (r: Record<string, unknown>) => <span className="text-slate-600 text-xs">{fmtMoney((r as unknown as CallRecord).costSummary?.llmCost)}</span>,
            }] : []),
            ...(costDisplay.showTotalCost ? [{
              key: "totalCost", header: "Total Cost",
              render: (r: Record<string, unknown>) => <span className="text-slate-800 text-xs font-semibold">{fmtMoney((r as unknown as CallRecord).costSummary?.totalCost)}</span>,
            }] : []),
            {
              key: "startedAt", header: "Time",
              render: (r) => <span className="text-xs text-slate-400">{fmtDate(r.startedAt as string)}</span>,
            },
          ]}
          data={filtered as unknown as Record<string, unknown>[]}
          onRowClick={(r) => openTranscript(r as unknown as CallRecord)}
          emptyMessage="No calls match your filters."
        />
        {filtered.length > 0 && (
          <p className="text-xs text-slate-400 mt-3 text-right">Click any row to view transcript</p>
        )}
      </Card>

      {/* Transcript Modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Transcript — ${selected?.callerNumber ?? ""}`}
        size="lg"
      >
        {txLoading ? (
          <div className="flex justify-center py-8"><PageLoader /></div>
        ) : (
          <div className="space-y-3">
            {selected && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Turn Analysis</h3>
                  <Badge
                    variant={
                      isQualityScored(selected.qualitySummary)
                        ? ((selected.qualitySummary?.score ?? 100) < 85 || selected.analysisHistory?.some((item) => item.needsReview) ? "warning" : "success")
                        : "neutral"
                    }
                  >
                    {isQualityScored(selected.qualitySummary)
                      ? ((selected.qualitySummary?.score ?? 100) < 85 || selected.analysisHistory?.some((item) => item.needsReview) ? "Needs review" : "OK")
                      : "Not scored"}
                  </Badge>
                </div>
                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-950/30">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Call Summary</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                    {buildCallSummary(selected) ?? "No analysis summary available for this call."}
                  </p>
                </div>
                <div className="mt-3 space-y-3 max-h-80 overflow-y-auto pr-1">
                  {(selected.analysisHistory ?? []).length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No analysis summary available for this call.</p>
                  ) : (
                    (selected.analysisHistory ?? []).map((turn) => (
                      <div
                        key={turn.turn}
                        className={`rounded-xl border p-3 ${turn.needsReview ? "border-amber-300 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/40"}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Turn {turn.turn}</p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{turn.detectedIntent}</p>
                          </div>
                          <Badge variant={reviewBadgeVariant(turn.needsReview, turn.confidence)}>
                            {turn.needsReview ? "Needs review" : "Stable"}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Badge variant={reviewBadgeVariant(turn.needsReview, turn.confidence)}>
                            Confidence {fmtConfidence(turn.confidence)}
                          </Badge>
                          <Badge variant="info">Symptom {turn.symptom ?? "—"}</Badge>
                          <Badge variant="neutral">Doctor {turn.doctor ?? "—"}</Badge>
                          <Badge variant="neutral">Date {turn.date ?? "—"}</Badge>
                          <Badge variant="neutral">Time {turn.time ?? "—"}</Badge>
                          <Badge variant="neutral">Lang {turn.language}</Badge>
                          <Badge variant={qualityVariant(turn.severity)}>{turn.score}/100</Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            {transcript.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No transcript available for this call.</p>
            ) : (
              transcript.map((entry, i) => (
                <div key={i} className={`flex gap-3 ${entry.speaker === "bot" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${entry.speaker === "bot" ? "bg-indigo-100 text-indigo-700 dark:bg-sky-500/20 dark:text-sky-100" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-100"}`}>
                    {entry.speaker === "bot" ? "AI" : "C"}
                  </div>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${entry.speaker === "bot" ? "bg-indigo-50 text-indigo-900 rounded-tr-none dark:bg-sky-500/15 dark:text-sky-50" : "bg-slate-100 text-slate-800 rounded-tl-none dark:bg-slate-700 dark:text-slate-50"}`}>
                    <p>{entry.text}</p>
                    {entry.timestamp && (
                      <p className="text-[10px] mt-1 opacity-50">{fmtDate(entry.timestamp)}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            <div className="sticky bottom-0 bg-white/95 pt-3 dark:bg-slate-800/95">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
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

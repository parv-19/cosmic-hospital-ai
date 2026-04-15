import React, { useEffect, useState, useCallback, useMemo } from "react";
import { fetchCalls, fetchSettings, fetchTranscript, type CallRecord, type SettingsRecord, type TranscriptEntry } from "../../../api";
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
  const headers = ["Session ID", "Caller", "Outcome", "Doctor", "Duration (s)", "Started At"];
  const rows = calls.map((c) => [
    c.sessionId, c.callerNumber, c.outcome, c.selectedDoctor ?? "", c.durationSeconds, c.startedAt,
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
              key: "selectedSpecialization", header: "Specialty",
              render: (r) => <span className="text-slate-500 text-xs">{(r.selectedSpecialization as string) || "—"}</span>,
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
        size="xl"
      >
        {/* Call meta */}
        {selected && (
          <div className="flex flex-wrap gap-3 mb-5 pb-4 border-b border-slate-100">
            <span className="text-xs text-slate-500">
              <span className="font-medium text-slate-700">Session: </span>
              <span className="font-mono">{selected.sessionId}</span>
            </span>
            <span className="text-xs text-slate-500">
              <span className="font-medium text-slate-700">Doctor: </span>
              {selected.selectedDoctor || "—"}
            </span>
            <Badge variant={outcomeVariant(selected.outcome)}>{selected.outcome || "—"}</Badge>
            <span className="text-xs text-slate-500">
              <span className="font-medium text-slate-700">Duration: </span>
              {fmtDuration(selected.durationSeconds)}
            </span>
          </div>
        )}
        {txLoading ? (
          <div className="flex justify-center py-8"><PageLoader /></div>
        ) : transcript.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No transcript available for this call.</p>
        ) : (
          <div className="space-y-3">
            {transcript.map((entry, i) => (
              <div key={i} className={`flex gap-3 ${entry.speaker === "bot" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${entry.speaker === "bot" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                  {entry.speaker === "bot" ? "AI" : "C"}
                </div>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${entry.speaker === "bot" ? "bg-indigo-50 text-indigo-900 rounded-tr-none" : "bg-slate-100 text-slate-800 rounded-tl-none"}`}>
                  <p>{entry.text}</p>
                  {entry.timestamp && (
                    <p className="text-[10px] mt-1 opacity-50">{fmtDate(entry.timestamp)}</p>
                  )}
                </div>
              </div>
            ))}
            <div className="sticky bottom-0 bg-white/95 pt-3">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                X Close Transcript
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

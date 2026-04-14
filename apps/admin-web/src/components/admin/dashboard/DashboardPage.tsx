import React, { useEffect, useState, useCallback } from "react";
import { fetchDashboard, fetchCalls, fetchTranscript, type DashboardResponse, type CallRecord, type TranscriptEntry } from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { StatCard } from "../../ui/StatCard";
import { Card, CardHeader } from "../../ui/Card";
import { Table } from "../../ui/Table";
import { Badge, outcomeVariant } from "../../ui/Badge";
import { Modal } from "../../ui/Modal";
import { PageLoader } from "../../ui/Spinner";
import { Button } from "../../ui/Button";

function fmtDuration(s: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

export function DashboardPage() {
  const { token, user } = useAuth();
  const [stats, setStats]   = useState<DashboardResponse | null>(null);
  const [calls, setCalls]   = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  // Transcript modal
  const [transcriptCall, setTranscriptCall] = useState<CallRecord | null>(null);
  const [transcript, setTranscript]         = useState<TranscriptEntry[]>([]);
  const [txLoading, setTxLoading]           = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [d, c] = await Promise.all([fetchDashboard(token), fetchCalls(token)]);
      setStats(d);
      // today's calls
      const today = new Date().toDateString();
      const todaysCalls = c
        .filter((r) => new Date(r.startedAt).toDateString() === today)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      setCalls(todaysCalls);
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

  return (
    <div className="space-y-6">
      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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

      {/* Today's Calls */}
      <Card>
        <CardHeader
          title="Today's Calls"
          subtitle={`${calls.length} call${calls.length !== 1 ? "s" : ""} today`}
          action={
            !isReadOnly && (
              <Button variant="secondary" size="sm" onClick={load}
                icon={<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg>}
              >
                Refresh
              </Button>
            )
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
              key: "selectedDoctor", header: "Doctor",
              render: (r) => <span className="text-slate-600">{(r.selectedDoctor as string) || "—"}</span>,
            },
            {
              key: "durationSeconds", header: "Duration",
              render: (r) => fmtDuration(r.durationSeconds as number),
            },
            {
              key: "startedAt", header: "Time",
              render: (r) => <span className="text-xs text-slate-500">{fmtDate(r.startedAt as string)}</span>,
            },
          ]}
          data={calls as unknown as Record<string, unknown>[]}
          emptyMessage="No calls recorded today."
          onRowClick={(r) => openTranscript(r as unknown as CallRecord)}
        />
        {calls.length > 0 && (
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
          </div>
        )}
      </Modal>
    </div>
  );
}

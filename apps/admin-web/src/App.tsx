import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import {
  bookAppointment,
  cancelAppointment,
  createDoctor,
  fetchAnalytics,
  fetchAppointments,
  fetchBotFlows,
  fetchCalls,
  fetchDashboard,
  fetchDoctors,
  fetchFaq,
  fetchLiveCalls,
  fetchMe,
  fetchSettings,
  fetchTranscript,
  login,
  rescheduleAppointment,
  saveBotFlow,
  saveFaq,
  updateSettings,
  type AnalyticsResponse,
  type AppointmentRecord,
  type CallRecord,
  type DashboardResponse,
  type DoctorRecord,
  type FlowRecord,
  type FaqRecord,
  type Role,
  type SettingsRecord,
  type User
} from "./api";

type ViewKey = "dashboard" | "doctors" | "appointments" | "calls" | "transcripts" | "settings" | "analytics" | "schedule";

type Credentials = {
  email: string;
  password: string;
};

const TOKEN_KEY = "ai-hospital-platform-token";

const demoCredentials: Array<Credentials & { label: string }> = [
  { label: "Admin", email: "admin@sunrise.test", password: "Admin@123" },
  { label: "Doctor", email: "doctor@sunrise.test", password: "Doctor@123" },
  { label: "Read Only", email: "readonly@sunrise.test", password: "Viewer@123" }
];

const roleViews: Record<Role, ViewKey[]> = {
  ADMIN: ["dashboard", "doctors", "appointments", "calls", "transcripts", "settings", "analytics"],
  DOCTOR: ["dashboard", "appointments", "schedule", "calls", "transcripts", "settings"],
  READ_ONLY: ["dashboard", "calls", "transcripts", "analytics"]
};

const viewLabels: Record<ViewKey, string> = {
  dashboard: "Dashboard",
  doctors: "Doctors",
  appointments: "Appointments",
  calls: "Call Logs",
  transcripts: "Transcripts",
  settings: "Settings",
  analytics: "Analytics",
  schedule: "Schedule"
};

function fallbackError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Sign in to manage the telephony control plane.");
  const [credentials, setCredentials] = useState<Credentials>(demoCredentials[0]);

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [liveCalls, setLiveCalls] = useState<CallRecord[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [settings, setSettings] = useState<SettingsRecord[]>([]);
  const [faq, setFaq] = useState<FaqRecord[]>([]);
  const [flows, setFlows] = useState<FlowRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);

  const [doctorDraft, setDoctorDraft] = useState({ name: "", specialization: "", fee: "700", clinicName: "Sunrise Care Clinic", language: "en", contactNumber: "" });
  const [appointmentDraft, setAppointmentDraft] = useState({ patientName: "", phoneNumber: "", appointmentDate: "", reason: "", doctorId: "" });
  const [faqDraft, setFaqDraft] = useState({ question: "", answer: "", category: "clinic" });
  const [flowDraft, setFlowDraft] = useState({ name: "", definition: '{\n  "start": "greeting"\n}' });

  const allowedViews = useMemo(() => (user ? roleViews[user.role] : []), [user]);
  const primarySettings = settings[0] ?? null;

  async function loadPortalData(authToken: string, authUser?: User | null) {
    const resolvedUser = authUser ?? (await fetchMe(authToken));
    const [dashboardResponse, doctorsResponse, appointmentsResponse, callsResponse, liveCallsResponse, settingsResponse, faqResponse, flowsResponse, analyticsResponse] =
      await Promise.all([
        fetchDashboard(authToken),
        fetchDoctors(authToken),
        fetchAppointments(authToken),
        fetchCalls(authToken),
        fetchLiveCalls(authToken),
        fetchSettings(authToken),
        fetchFaq(authToken),
        fetchBotFlows(authToken),
        fetchAnalytics(authToken)
      ]);

    setUser(resolvedUser);
    setDashboard(dashboardResponse);
    setDoctors(doctorsResponse);
    setAppointments(appointmentsResponse);
    setCalls(callsResponse);
    setLiveCalls(liveCallsResponse);
    setSelectedCall((current) => current ?? callsResponse[0] ?? null);
    setSettings(settingsResponse);
    setFaq(faqResponse);
    setFlows(flowsResponse);
    setAnalytics(analyticsResponse);
    setView((current) => (roleViews[resolvedUser.role].includes(current) ? current : roleViews[resolvedUser.role][0]));
    setStatus(`${resolvedUser.role} panel connected. Runtime config is DB-driven and live call polling is active.`);
  }

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);
    void loadPortalData(token)
      .catch((error) => {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        setStatus(fallbackError(error));
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    const interval = window.setInterval(() => {
      void Promise.all([fetchLiveCalls(token), fetchCalls(token)])
        .then(async ([liveCallsResponse, callsResponse]) => {
          setLiveCalls(liveCallsResponse);
          setCalls(callsResponse);
          const activeTarget = selectedCall ? callsResponse.find((entry) => entry.sessionId === selectedCall.sessionId) : callsResponse[0] ?? null;
          if (activeTarget) {
            setSelectedCall(await fetchTranscript(token, activeTarget.sessionId));
          }
        })
        .catch(() => undefined);
    }, 4000);

    return () => {
      window.clearInterval(interval);
    };
  }, [token, user, selectedCall]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await login(credentials.email, credentials.password);
      window.localStorage.setItem(TOKEN_KEY, response.token);
      setToken(response.token);
      setUser(response.user);
      setStatus(`Welcome back, ${response.user.name}.`);
    } catch (error) {
      setStatus(fallbackError(error));
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      await loadPortalData(token, user);
    } catch (error) {
      setStatus(fallbackError(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDoctor() {
    if (!token) {
      return;
    }

    try {
      await createDoctor(token, {
        name: doctorDraft.name,
        specialization: doctorDraft.specialization,
        fee: Number(doctorDraft.fee),
        clinicName: doctorDraft.clinicName,
        language: doctorDraft.language,
        contactNumber: doctorDraft.contactNumber
      });
      setStatus("Doctor created and bot settings seeded.");
      setDoctorDraft({ name: "", specialization: "", fee: "700", clinicName: "Sunrise Care Clinic", language: "en", contactNumber: "" });
      await refresh();
    } catch (error) {
      setStatus(fallbackError(error));
    }
  }

  async function handleSaveSettings(target: SettingsRecord) {
    if (!token) {
      return;
    }

    try {
      await updateSettings(token, target);
      setStatus("Settings saved to the runtime config store.");
      await refresh();
    } catch (error) {
      setStatus(fallbackError(error));
    }
  }

  async function handleBookAppointment() {
    if (!token) {
      return;
    }

    try {
      await bookAppointment(token, {
        ...appointmentDraft,
        doctorId: appointmentDraft.doctorId || user?.doctorId || null
      });
      setStatus("Appointment saved.");
      setAppointmentDraft({ patientName: "", phoneNumber: "", appointmentDate: "", reason: "", doctorId: "" });
      await refresh();
    } catch (error) {
      setStatus(fallbackError(error));
    }
  }

  async function handleCancelAppointment(appointmentId: string) {
    if (!token) {
      return;
    }

    try {
      await cancelAppointment(token, appointmentId);
      setStatus("Appointment cancelled.");
      await refresh();
    } catch (error) {
      setStatus(fallbackError(error));
    }
  }

  async function handleRescheduleAppointment(appointmentId: string) {
    if (!token) {
      return;
    }

    const nextSlot = window.prompt("Enter the new appointment date/time", "Tomorrow 11 AM");

    if (!nextSlot) {
      return;
    }

    try {
      await rescheduleAppointment(token, appointmentId, nextSlot);
      setStatus("Appointment rescheduled.");
      await refresh();
    } catch (error) {
      setStatus(fallbackError(error));
    }
  }

  async function handleSaveFaq() {
    if (!token) {
      return;
    }

    try {
      await saveFaq(token, faqDraft);
      setStatus("FAQ updated.");
      setFaqDraft({ question: "", answer: "", category: "clinic" });
      await refresh();
    } catch (error) {
      setStatus(fallbackError(error));
    }
  }

  async function handleSaveFlow() {
    if (!token) {
      return;
    }

    try {
      await saveBotFlow(token, {
        name: flowDraft.name,
        definition: JSON.parse(flowDraft.definition)
      });
      setStatus("Bot flow saved.");
      setFlowDraft({ name: "", definition: '{\n  "start": "greeting"\n}' });
      await refresh();
    } catch (error) {
      setStatus(fallbackError(error));
    }
  }

  async function handleSelectCall(sessionId: string) {
    if (!token) {
      return;
    }

    try {
      setSelectedCall(await fetchTranscript(token, sessionId));
    } catch (error) {
      setStatus(fallbackError(error));
    }
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setStatus("Signed out.");
  }

  if (!token || !user) {
    return (
      <main className="min-h-screen px-6 py-10 text-slate-900">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[32px] border border-white/60 bg-white/80 p-10 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            <p className="text-sm uppercase tracking-[0.35em] text-teal-700">AI Telephony SaaS</p>
            <h1 className="mt-4 text-5xl font-semibold text-slate-900">Control the live voice stack without touching the call path.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              This console adds admin, doctor, and read-only layers around the running Asterisk to STT to LLM to TTS system. Runtime behavior stays config-driven, and the websocket call loop remains untouched.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <StatCard label="Protected live path" value="Asterisk + STT + TTS unchanged" accent="bg-teal-100 text-teal-800" />
              <StatCard label="Control plane" value="JWT + RBAC + DB-backed settings" accent="bg-amber-100 text-amber-800" />
              <StatCard label="Operations" value="Dashboards, calls, transcripts, schedules" accent="bg-rose-100 text-rose-800" />
            </div>
          </section>

          <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <h2 className="text-2xl font-semibold text-slate-900">Role Login</h2>
            <p className="mt-2 text-sm text-slate-500">Use the seeded demo accounts to open each panel instantly.</p>

            <div className="mt-5 grid gap-3">
              {demoCredentials.map((entry) => (
                <button
                  key={entry.email}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-teal-400 hover:bg-teal-50"
                  onClick={() => setCredentials({ email: entry.email, password: entry.password })}
                  type="button"
                >
                  <div className="text-sm font-semibold text-slate-800">{entry.label}</div>
                  <div className="text-xs text-slate-500">{entry.email}</div>
                </button>
              ))}
            </div>

            <form className="mt-6 grid gap-4" onSubmit={handleLogin}>
              <Field label="Email" value={credentials.email} onChange={(value) => setCredentials((current) => ({ ...current, email: value }))} />
              <Field label="Password" type="password" value={credentials.password} onChange={(value) => setCredentials((current) => ({ ...current, password: value }))} />
              <button className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700" disabled={loading} type="submit">
                {loading ? "Signing in..." : "Enter Platform"}
              </button>
            </form>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">{status}</div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-4 text-slate-900 md:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1500px] gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-white/60 bg-[#f9f7f1]/95 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.35em] text-teal-700">Live Platform</p>
          <h2 className="mt-3 text-2xl font-semibold">{user.role === "ADMIN" ? "Admin Panel" : user.role === "DOCTOR" ? "Doctor Panel" : "Read-Only Panel"}</h2>
          <p className="mt-2 text-sm text-slate-600">{user.name}</p>
          <p className="text-xs text-slate-500">{user.email}</p>

          <nav className="mt-8 grid gap-2">
            {allowedViews.map((entry) => (
              <button
                key={entry}
                className={`rounded-2xl px-4 py-3 text-left text-sm transition ${view === entry ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}
                onClick={() => setView(entry)}
                type="button"
              >
                {viewLabels[entry]}
              </button>
            ))}
          </nav>

          <div className="mt-8 rounded-3xl bg-slate-900 p-4 text-white">
            <p className="text-xs uppercase tracking-[0.25em] text-teal-300">Live Call Monitor</p>
            <p className="mt-3 text-3xl font-semibold">{liveCalls.length}</p>
            <p className="text-sm text-slate-300">Active calls</p>
            <p className="mt-4 text-xs leading-6 text-slate-300">Polling every 4 seconds for current node, intent, and transcript updates.</p>
          </div>

          <button className="mt-6 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:bg-slate-100" onClick={logout} type="button">
            Sign Out
          </button>
        </aside>

        <section className="rounded-[28px] border border-white/60 bg-white/85 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Runtime Control Layer</p>
              <h1 className="mt-2 text-3xl font-semibold">{viewLabels[view]}</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">{status}</div>
              <button className="rounded-2xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-600" disabled={loading} onClick={refresh} type="button">
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-6">
            {view === "dashboard" && dashboard && analytics && (
              <>
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <MetricCard label="Calls Today" value={dashboard.totals.callsToday} tone="teal" />
                  <MetricCard label="Booked" value={dashboard.totals.booked} tone="amber" />
                  <MetricCard label="Transferred" value={dashboard.totals.transferred} tone="rose" />
                  <MetricCard label="Failed" value={dashboard.totals.failed} tone="slate" />
                  <MetricCard label="Active Calls" value={dashboard.totals.activeCalls} tone="emerald" />
                </section>
                <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <Card title="Doctor-Wise Stats" subtitle="Operational load across the clinic roster.">
                    <SimpleTable headers={["Doctor", "Calls", "Booked", "Transferred", "Failed"]} rows={dashboard.doctorStats.map((entry) => [entry.doctorName, entry.calls, entry.booked, entry.transferred, entry.failed])} />
                  </Card>
                  <Card title="Platform Health" subtitle="Read-only analytics snapshot.">
                    <div className="grid gap-3 md:grid-cols-2">
                      <MiniMetric label="Booking Rate" value={`${analytics.bookingRate}%`} />
                      <MiniMetric label="Transfer Rate" value={`${analytics.transferRate}%`} />
                      <MiniMetric label="Total Calls" value={analytics.totalCalls} />
                      <MiniMetric label="Intent Types" value={analytics.intentDistribution.length} />
                    </div>
                  </Card>
                </section>
              </>
            )}

            {view === "doctors" && (
              <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <Card title="Doctor Directory" subtitle="CRUD-ready list for doctor management.">
                  <SimpleTable headers={["Doctor", "Specialization", "Fee", "Language", "Schedule"]} rows={doctors.map((doctor) => [doctor.name, doctor.specialization, `Rs. ${doctor.fee}`, doctor.language, doctor.scheduleLabel])} />
                </Card>
                <Card title="Add Doctor" subtitle="Creates the doctor record and seeds bot settings.">
                  <div className="grid gap-3">
                    <Field label="Name" value={doctorDraft.name} onChange={(value) => setDoctorDraft((current) => ({ ...current, name: value }))} />
                    <Field label="Specialization" value={doctorDraft.specialization} onChange={(value) => setDoctorDraft((current) => ({ ...current, specialization: value }))} />
                    <Field label="Fee" value={doctorDraft.fee} onChange={(value) => setDoctorDraft((current) => ({ ...current, fee: value }))} />
                    <Field label="Clinic Name" value={doctorDraft.clinicName} onChange={(value) => setDoctorDraft((current) => ({ ...current, clinicName: value }))} />
                    <Field label="Contact Number" value={doctorDraft.contactNumber} onChange={(value) => setDoctorDraft((current) => ({ ...current, contactNumber: value }))} />
                    <button className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white" onClick={handleCreateDoctor} type="button">Create Doctor</button>
                  </div>
                </Card>
              </section>
            )}

            {view === "appointments" && (
              <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <Card title="Appointment Management" subtitle="List, filter, cancel, and reschedule from one place.">
                  <div className="grid gap-3">
                    {appointments.map((appointment) => (
                      <div key={appointment.id} className="rounded-3xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-lg font-semibold text-slate-900">{appointment.patientName}</p>
                            <p className="text-sm text-slate-500">{appointment.reason}</p>
                            <p className="mt-2 text-sm text-slate-600">{appointment.doctorName ?? "Unassigned"} | {appointment.appointmentDate}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">{appointment.status}</span>
                            {user.role !== "READ_ONLY" && <button className="rounded-2xl border border-slate-300 px-3 py-2 text-sm" onClick={() => handleRescheduleAppointment(appointment.appointmentId)} type="button">Reschedule</button>}
                            {user.role !== "READ_ONLY" && <button className="rounded-2xl bg-rose-600 px-3 py-2 text-sm text-white" onClick={() => handleCancelAppointment(appointment.appointmentId)} type="button">Cancel</button>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
                {user.role !== "READ_ONLY" && (
                  <Card title="Book Appointment" subtitle="Manual booking adapter on top of the shared appointments store.">
                    <div className="grid gap-3">
                      <Field label="Patient Name" value={appointmentDraft.patientName} onChange={(value) => setAppointmentDraft((current) => ({ ...current, patientName: value }))} />
                      <Field label="Phone Number" value={appointmentDraft.phoneNumber} onChange={(value) => setAppointmentDraft((current) => ({ ...current, phoneNumber: value }))} />
                      <Field label="Appointment Date" value={appointmentDraft.appointmentDate} onChange={(value) => setAppointmentDraft((current) => ({ ...current, appointmentDate: value }))} placeholder="Tomorrow 10 AM" />
                      <Field label="Reason" value={appointmentDraft.reason} onChange={(value) => setAppointmentDraft((current) => ({ ...current, reason: value }))} />
                      <SelectField label="Doctor" value={appointmentDraft.doctorId} options={doctors.map((doctor) => ({ label: doctor.name, value: doctor.doctorId }))} onChange={(value) => setAppointmentDraft((current) => ({ ...current, doctorId: value }))} />
                      <button className="rounded-2xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white" onClick={handleBookAppointment} type="button">Save Appointment</button>
                    </div>
                  </Card>
                )}
              </section>
            )}

            {view === "calls" && (
              <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <Card title="Call Logs" subtitle="Outcome, duration, doctor routing, and booking stage.">
                  <SimpleTable
                    headers={["Caller", "Stage", "Intent", "Outcome", "Duration"]}
                    rows={calls.map((call) => [call.callerNumber, call.bookingStage, call.latestIntent ?? "-", call.outcome, `${call.durationSeconds}s`])}
                    rowActions={calls.map((call) => ({ label: "View Transcript", onClick: () => handleSelectCall(call.sessionId) }))}
                  />
                </Card>
                <Card title="Live Call Monitor" subtitle="Current node, intent, and transcript stream via polling.">
                  <div className="grid gap-3">
                    {liveCalls.length === 0 && <p className="text-sm text-slate-500">No active calls at the moment.</p>}
                    {liveCalls.map((call) => (
                      <div key={call.sessionId} className="rounded-3xl border border-teal-200 bg-teal-50/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm uppercase tracking-[0.2em] text-teal-700">{call.callerNumber}</p>
                            <h3 className="mt-2 text-lg font-semibold text-slate-900">{call.selectedDoctor ?? call.selectedSpecialization ?? "Routing in progress"}</h3>
                          </div>
                          <button className="rounded-2xl bg-slate-900 px-3 py-2 text-sm text-white" onClick={() => handleSelectCall(call.sessionId)} type="button">Open</button>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <MiniMetric label="Node" value={call.currentNode ?? call.bookingStage} />
                          <MiniMetric label="Intent" value={call.latestIntent ?? "pending"} />
                          <MiniMetric label="Updated" value={formatDate(call.updatedAt)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            )}

            {view === "transcripts" && (
              <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <Card title="Transcript Sessions" subtitle="Select any call log to inspect the full conversation history.">
                  <div className="grid gap-3">
                    {calls.map((call) => (
                      <button key={call.sessionId} className="rounded-3xl border border-slate-200 p-4 text-left hover:border-teal-400 hover:bg-teal-50/50" onClick={() => handleSelectCall(call.sessionId)} type="button">
                        <p className="text-sm font-semibold text-slate-900">{call.callerNumber}</p>
                        <p className="mt-2 text-sm text-slate-600">{call.selectedDoctor ?? call.selectedSpecialization ?? "Unassigned"}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(call.updatedAt)}</p>
                      </button>
                    ))}
                  </div>
                </Card>
                <Card title="Conversation History" subtitle="Read-only transcript viewer for support, doctor, and admin workflows.">
                  <div className="grid gap-3">
                    {selectedCall?.transcriptHistory?.map((entry) => (
                      <div key={`${entry.timestamp}-${entry.speaker}-${entry.text}`} className={`rounded-3xl p-4 ${entry.speaker === "bot" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"}`}>
                        <p className="text-xs uppercase tracking-[0.2em] opacity-70">{entry.speaker}</p>
                        <p className="mt-2 leading-7">{entry.text}</p>
                        <p className="mt-2 text-xs opacity-70">{formatDate(entry.timestamp)}</p>
                      </div>
                    ))}
                    {!selectedCall && <p className="text-sm text-slate-500">Select a call to view its transcript.</p>}
                  </div>
                </Card>
              </section>
            )}

            {view === "settings" && primarySettings && (
              <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <Card title="Bot Settings" subtitle="Greeting, after-hours, fallback, language, fee, and scheduling.">
                  <SettingsEditor key={primarySettings.doctorId} initial={primarySettings} onSave={handleSaveSettings} readOnly={user.role === "READ_ONLY"} />
                </Card>
                <div className="grid gap-6">
                  <Card title="FAQ / Knowledge Base" subtitle="Clinic fee, address, timings, and quick answers.">
                    <div className="grid gap-3">
                      {faq.map((entry) => (
                        <div key={entry.id} className="rounded-3xl border border-slate-200 p-4">
                          <p className="text-sm font-semibold text-slate-900">{entry.question}</p>
                          <p className="mt-2 text-sm text-slate-600">{entry.answer}</p>
                        </div>
                      ))}
                      {user.role !== "READ_ONLY" && (
                        <>
                          <Field label="Question" value={faqDraft.question} onChange={(value) => setFaqDraft((current) => ({ ...current, question: value }))} />
                          <TextAreaField label="Answer" value={faqDraft.answer} onChange={(value) => setFaqDraft((current) => ({ ...current, answer: value }))} />
                          <Field label="Category" value={faqDraft.category} onChange={(value) => setFaqDraft((current) => ({ ...current, category: value }))} />
                          <button className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white" onClick={handleSaveFaq} type="button">Save FAQ</button>
                        </>
                      )}
                    </div>
                  </Card>
                  {user.role === "ADMIN" && (
                    <Card title="Bot Flow Config" subtitle="Basic JSON editor for config-driven routing.">
                      <div className="grid gap-3">
                        {flows.map((flow) => (
                          <div key={flow.id} className="rounded-3xl border border-slate-200 p-4">
                            <p className="font-semibold text-slate-900">{flow.name}</p>
                            <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{stringifyJson(flow.definition)}</pre>
                          </div>
                        ))}
                        <Field label="Flow Name" value={flowDraft.name} onChange={(value) => setFlowDraft((current) => ({ ...current, name: value }))} />
                        <TextAreaField label="JSON Definition" rows={8} value={flowDraft.definition} onChange={(value) => setFlowDraft((current) => ({ ...current, definition: value }))} />
                        <button className="rounded-2xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white" onClick={handleSaveFlow} type="button">Save Flow</button>
                      </div>
                    </Card>
                  )}
                </div>
              </section>
            )}

            {view === "analytics" && analytics && (
              <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <Card title="KPI Snapshot" subtitle="Read-only analytics dashboard.">
                  <div className="grid gap-3 md:grid-cols-3">
                    <MetricCard label="Call Volume" value={analytics.totalCalls} tone="teal" />
                    <MetricCard label="Booking Rate" value={`${analytics.bookingRate}%`} tone="amber" />
                    <MetricCard label="Transfer Rate" value={`${analytics.transferRate}%`} tone="rose" />
                  </div>
                </Card>
                <Card title="Demand and Intent Distribution" subtitle="Useful for capacity planning and prompt tuning.">
                  <div className="grid gap-5 md:grid-cols-2">
                    <SimpleList title="Doctor Demand" items={analytics.doctorDemand.map((entry) => `${entry.label}: ${entry.value}`)} />
                    <SimpleList title="Intent Distribution" items={analytics.intentDistribution.map((entry) => `${entry.label}: ${entry.value}`)} />
                  </div>
                </Card>
              </section>
            )}

            {view === "schedule" && primarySettings && (
              <Card title="Doctor Schedule" subtitle="Manage leave, blocks, and working hours without touching telephony logic.">
                <SettingsEditor initial={primarySettings} onSave={handleSaveSettings} readOnly={false} scheduleOnly />
              </Card>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${accent}`}>{value}</p>
    </article>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string | number; tone: "teal" | "amber" | "rose" | "slate" | "emerald" }) {
  const palette: Record<typeof tone, string> = {
    teal: "from-teal-100 to-white text-teal-900",
    amber: "from-amber-100 to-white text-amber-900",
    rose: "from-rose-100 to-white text-rose-900",
    slate: "from-slate-100 to-white text-slate-900",
    emerald: "from-emerald-100 to-white text-emerald-900"
  };

  return (
    <article className={`rounded-[28px] border border-slate-200 bg-gradient-to-br p-5 ${palette[tone]}`}>
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-4 text-4xl font-semibold">{value}</p>
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{subtitle}</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="grid gap-2 text-sm text-slate-700">
      <span>{label}</span>
      <input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-teal-500 focus:bg-white" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ label: string; value: string }>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm text-slate-700">
      <span>{label}</span>
      <select className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-teal-500 focus:bg-white" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="grid gap-2 text-sm text-slate-700">
      <span>{label}</span>
      <textarea className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-teal-500 focus:bg-white" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SimpleTable({ headers, rows, rowActions }: { headers: string[]; rows: Array<Array<string | number>>; rowActions?: Array<{ label: string; onClick: () => void }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            {headers.map((header) => (
              <th key={header} className="px-3 py-3 font-medium">{header}</th>
            ))}
            {rowActions && <th className="px-3 py-3 font-medium">Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.join("-")}-${index}`} className="border-b border-slate-100 text-slate-700">
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="px-3 py-3">{cell}</td>
              ))}
              {rowActions && <td className="px-3 py-3"><button className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold" onClick={rowActions[index].onClick} type="button">{rowActions[index].label}</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimpleList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-3 grid gap-2 text-sm text-slate-600">
        {items.map((item) => (
          <div key={item} className="rounded-2xl bg-white px-3 py-2">{item}</div>
        ))}
      </div>
    </div>
  );
}

function SettingsEditor({ initial, onSave, readOnly, scheduleOnly = false }: { initial: SettingsRecord; onSave: (value: SettingsRecord) => void; readOnly: boolean; scheduleOnly?: boolean }) {
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  return (
    <div className="grid gap-3">
      {!scheduleOnly && (
        <>
          <TextAreaField label="Greeting Message" value={draft.greetingMessage} onChange={(value) => setDraft((current) => ({ ...current, greetingMessage: value }))} />
          <TextAreaField label="After Hours Message" value={draft.afterHoursMessage} onChange={(value) => setDraft((current) => ({ ...current, afterHoursMessage: value }))} />
          <TextAreaField label="Fallback Response" value={draft.fallbackResponse} onChange={(value) => setDraft((current) => ({ ...current, fallbackResponse: value }))} />
          <Field label="Language" value={draft.language} onChange={(value) => setDraft((current) => ({ ...current, language: value }))} />
          <Field label="Transfer Number" value={draft.transferNumber} onChange={(value) => setDraft((current) => ({ ...current, transferNumber: value }))} />
          <Field label="Fee" value={String(draft.fee ?? "")} onChange={(value) => setDraft((current) => ({ ...current, fee: Number(value) || 0 }))} />
        </>
      )}
      <Field label="Schedule Label" value={draft.scheduleLabel ?? ""} onChange={(value) => setDraft((current) => ({ ...current, scheduleLabel: value }))} />
      <TextAreaField label="Availability JSON" rows={scheduleOnly ? 10 : 6} value={stringifyJson(draft.availability)} onChange={(value) => {
        try {
          setDraft((current) => ({ ...current, availability: JSON.parse(value) as SettingsRecord["availability"] }));
        } catch {
          return;
        }
      }} />
      {!scheduleOnly && <Field label="Supported Intents" value={draft.supportedIntents.join(", ")} onChange={(value) => setDraft((current) => ({ ...current, supportedIntents: value.split(",").map((entry) => entry.trim()).filter(Boolean) }))} />}
      {!scheduleOnly && <TextAreaField label="Emergency Message" value={draft.emergencyMessage} onChange={(value) => setDraft((current) => ({ ...current, emergencyMessage: value }))} />}
      {!scheduleOnly && (
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input checked={draft.bookingEnabled} onChange={(event) => setDraft((current) => ({ ...current, bookingEnabled: event.target.checked }))} type="checkbox" />
          Booking enabled
        </label>
      )}
      {!readOnly && <button className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white" onClick={() => onSave(draft)} type="button">Save Settings</button>}
    </div>
  );
}


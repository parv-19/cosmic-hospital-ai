
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

type MetricTone = "blue" | "cyan" | "green" | "amber" | "red";

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

const viewDescriptions: Record<ViewKey, string> = {
  dashboard: "Operational overview for clinic performance, routing volume, and live activity.",
  doctors: "Manage provider records, specialties, and seeded runtime settings.",
  appointments: "Review bookings, handle reschedules, and create appointments manually.",
  calls: "Track outcomes, monitor live sessions, and inspect routing progress.",
  transcripts: "Audit complete conversations across admin, doctor, and support workflows.",
  settings: "Tune bot messaging, availability, knowledge content, and flow configuration.",
  analytics: "Review read-only KPIs for demand, booking efficiency, and intent mix.",
  schedule: "Control doctor working hours and availability without touching telephony logic."
};

const roleMeta: Record<Role, { label: string; eyebrow: string; description: string }> = {
  ADMIN: {
    label: "Admin Panel",
    eyebrow: "Control Plane",
    description: "Full access to clinic operations, runtime controls, and analytics."
  },
  DOCTOR: {
    label: "Doctor Panel",
    eyebrow: "Provider Workspace",
    description: "Daily appointments, schedule management, and patient conversation history."
  },
  READ_ONLY: {
    label: "Read-Only Analytics",
    eyebrow: "Observer View",
    description: "A safe analytics and transcript surface for support and leadership teams."
  }
};

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-[18px] bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:bg-sky-300";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-[18px] border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50";
const dangerButtonClass =
  "inline-flex items-center justify-center rounded-[18px] bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700";

const toneCardClass: Record<MetricTone, string> = {
  blue: "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.96),rgba(255,255,255,0.95))]",
  cyan: "border-cyan-200 bg-[linear-gradient(180deg,rgba(236,254,255,0.96),rgba(255,255,255,0.95))]",
  green: "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(255,255,255,0.95))]",
  amber: "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,255,255,0.95))]",
  red: "border-rose-200 bg-[linear-gradient(180deg,rgba(255,241,242,0.96),rgba(255,255,255,0.95))]"
};

const toneSoftClass: Record<MetricTone, string> = {
  blue: "border-sky-200 bg-sky-50/80",
  cyan: "border-cyan-200 bg-cyan-50/80",
  green: "border-emerald-200 bg-emerald-50/80",
  amber: "border-amber-200 bg-amber-50/80",
  red: "border-rose-200 bg-rose-50/80"
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

function formatPercent(value: number): string {
  return `${value}%`;
}

function formatCurrency(value: number): string {
  return `Rs. ${value}`;
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function iconForView(view: ViewKey): ReactNode {
  switch (view) {
    case "dashboard":
      return <DashboardIcon />;
    case "doctors":
      return <UsersIcon />;
    case "appointments":
      return <CalendarIcon />;
    case "calls":
      return <PhoneIcon />;
    case "transcripts":
      return <ChatIcon />;
    case "settings":
      return <SettingsIcon />;
    case "analytics":
      return <ChartIcon />;
    case "schedule":
      return <ClockIcon />;
    default:
      return <DashboardIcon />;
  }
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
  const currentRoleMeta = user ? roleMeta[user.role] : null;

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
      <main className="min-h-screen px-5 py-6 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.15fr_0.85fr]">
          <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/85 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-10 lg:p-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_28%),radial-gradient(circle_at_75%_25%,rgba(15,118,110,0.14),transparent_22%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
                <SignalIcon />
                AI Telephony Platform
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                Premium control for a live clinic voice stack.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                A polished operations console for admin, doctor, and observer roles. The realtime telephony path stays untouched while the frontend gets a modern SaaS-grade control layer.
              </p>

              <div className="mt-10 grid gap-4 md:grid-cols-3">
                <FeatureStat label="Protected runtime" value="Live voice path unchanged" detail="Asterisk, STT, LLM, and TTS remain isolated from UI work." tone="blue" />
                <FeatureStat label="Role-aware access" value="Admin, Doctor, Read-only" detail="JWT and RBAC-backed panels with clearer page hierarchy." tone="green" />
                <FeatureStat label="Operations surface" value="Calls, schedules, analytics" detail="Actionable dashboards, cleaner forms, and better transcript UX." tone="amber" />
              </div>

              <div className="mt-10 grid gap-4 rounded-[28px] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] sm:grid-cols-3">
                <HeroMiniMetric label="Views" value="8" />
                <HeroMiniMetric label="Refresh cadence" value="4s" />
                <HeroMiniMetric label="Design language" value="Linear-grade clarity" />
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Access</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">Role Login</h2>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                Demo users seeded
              </div>
            </div>

            <div className="mt-8 grid gap-3">
              {demoCredentials.map((entry) => (
                <button
                  key={entry.email}
                  className={cx(
                    "group rounded-[22px] border px-4 py-4 text-left transition duration-200",
                    credentials.email === entry.email
                      ? "border-sky-300 bg-sky-50 shadow-[0_14px_30px_rgba(14,165,233,0.10)]"
                      : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_30px_rgba(15,23,42,0.06)]"
                  )}
                  onClick={() => setCredentials({ email: entry.email, password: entry.password })}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{entry.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{entry.email}</div>
                    </div>
                    <div className="rounded-full bg-slate-100 p-2 text-slate-500 transition group-hover:bg-slate-900 group-hover:text-white">
                      <ArrowRightIcon />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <form className="mt-8 grid gap-4" onSubmit={handleLogin}>
              <Field label="Email" value={credentials.email} onChange={(value) => setCredentials((current) => ({ ...current, email: value }))} />
              <Field label="Password" type="password" value={credentials.password} onChange={(value) => setCredentials((current) => ({ ...current, password: value }))} />
              <button className={primaryButtonClass} disabled={loading} type="submit">
                {loading ? "Signing in..." : "Enter Platform"}
              </button>
            </form>

            <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600">
              {status}
            </div>
          </section>
        </div>
      </main>
    );
  }

  const headerSummary = [
    { label: "Role", value: currentRoleMeta?.label ?? user.role },
    { label: "Visible Views", value: String(allowedViews.length) },
    { label: "Live Calls", value: String(liveCalls.length) }
  ];

  return (
    <main className="min-h-screen px-4 py-4 text-slate-950 sm:px-5 lg:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1600px] gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="relative overflow-hidden rounded-[32px] border border-slate-800 bg-slate-950 p-5 text-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.18),transparent_22%),radial-gradient(circle_at_20%_20%,rgba(45,212,191,0.16),transparent_24%)]" />
          <div className="relative flex h-full flex-col">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-200">
                <SignalIcon />
                {currentRoleMeta?.eyebrow}
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-white">{currentRoleMeta?.label}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{currentRoleMeta?.description}</p>

              <div className="mt-6 rounded-[26px] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-sm font-semibold text-white">{user.name}</p>
                <p className="mt-1 text-xs text-slate-400">{user.email}</p>
              </div>
            </div>

            <nav className="mt-6 grid gap-2">
              {allowedViews.map((entry) => (
                <button
                  key={entry}
                  className={cx(
                    "group flex items-center gap-3 rounded-[22px] px-4 py-3.5 text-left text-sm font-medium transition",
                    view === entry
                      ? "bg-sky-500 text-white shadow-[0_18px_35px_rgba(14,165,233,0.32)]"
                      : "text-slate-300 hover:bg-white/8 hover:text-white"
                  )}
                  onClick={() => setView(entry)}
                  type="button"
                >
                  <span className={cx("rounded-2xl p-2", view === entry ? "bg-white/15" : "bg-white/5 text-slate-400 group-hover:text-white")}>{iconForView(entry)}</span>
                  <span className="flex-1">{viewLabels[entry]}</span>
                  <ArrowRightIcon className={cx("size-4", view === entry ? "text-white" : "text-slate-500")} />
                </button>
              ))}
            </nav>

            <div className="mt-6 rounded-[28px] border border-sky-400/20 bg-[linear-gradient(180deg,rgba(14,165,233,0.18),rgba(15,23,42,0.2))] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200">Live Call Monitor</p>
                  <p className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white">{liveCalls.length}</p>
                  <p className="mt-1 text-sm text-slate-300">Active sessions in the polling window</p>
                </div>
                <div className="live-pulse mt-1 rounded-full bg-emerald-400/90 p-2 text-emerald-950">
                  <PulseIcon />
                </div>
              </div>
              <div className="mt-5 grid gap-2">
                {liveCalls.slice(0, 2).map((call) => (
                  <div key={call.sessionId} className="rounded-2xl border border-white/10 bg-white/6 px-3 py-3 text-sm text-slate-200">
                    <div className="font-medium text-white">{call.callerNumber}</div>
                    <div className="mt-1 text-xs text-slate-400">{call.currentNode ?? call.bookingStage}</div>
                  </div>
                ))}
                {liveCalls.length === 0 && <p className="text-sm leading-6 text-slate-300">Polling every 4 seconds for node, intent, and transcript updates.</p>}
              </div>
            </div>

            <button className="mt-auto rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white" onClick={logout} type="button">
              Sign Out
            </button>
          </div>
        </aside>

        <section className="rounded-[32px] border border-white/70 bg-white/82 p-4 shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-5 lg:p-6">
          <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.85))] p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  {iconForView(view)}
                  {currentRoleMeta?.eyebrow}
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">{viewLabels[view]}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{viewDescriptions[view]}</p>
              </div>

              <div className="flex flex-col gap-3 xl:items-end">
                <div className="flex flex-wrap gap-2">
                  {headerSummary.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{item.label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="max-w-xl rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                    {status}
                  </div>
                  <button className={primaryButtonClass} disabled={loading} onClick={refresh} type="button">
                    {loading ? "Refreshing..." : "Refresh Data"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6">
            {view === "dashboard" && dashboard && analytics && (
              <>
                <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
                  <MetricCard label="Calls Today" value={dashboard.totals.callsToday} subtitle="Today" tone="blue" icon={<PhoneIcon />} />
                  <MetricCard label="Booked" value={dashboard.totals.booked} subtitle="Confirmed appointments" tone="green" icon={<CalendarIcon />} />
                  <MetricCard label="Transferred" value={dashboard.totals.transferred} subtitle="Escalated calls" tone="amber" icon={<ArrowSplitIcon />} />
                  <MetricCard label="Failed" value={dashboard.totals.failed} subtitle="Needs review" tone="red" icon={<AlertIcon />} />
                  <MetricCard label="Active Calls" value={dashboard.totals.activeCalls} subtitle="Live right now" tone="cyan" icon={<PulseIcon />} />
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <Card title="Doctor-Wise Stats" subtitle="Operational load across the clinic roster.">
                    <SimpleTable headers={["Doctor", "Calls", "Booked", "Transferred", "Failed"]} rows={dashboard.doctorStats.map((entry) => [entry.doctorName, entry.calls, entry.booked, entry.transferred, entry.failed])} />
                  </Card>

                  <div className="grid gap-6">
                    <Card title="Platform Health" subtitle="Read-only snapshot for quick performance scanning.">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <MiniMetric label="Booking Rate" value={formatPercent(analytics.bookingRate)} tone="blue" />
                        <MiniMetric label="Transfer Rate" value={formatPercent(analytics.transferRate)} tone="amber" />
                        <MiniMetric label="Total Calls" value={analytics.totalCalls} tone="cyan" />
                        <MiniMetric label="Intent Types" value={analytics.intentDistribution.length} tone="green" />
                      </div>
                    </Card>

                    <Card title="Command Center" subtitle="Design system guidance applied in the refreshed frontend.">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SummaryTile title="Color Palette" body="Slate and white base with sky-blue accent, green success, amber warning, and red error." />
                        <SummaryTile title="Spacing System" body="Primary panels use 24px to 32px spacing with tighter 12px to 16px gaps inside forms and tables." />
                      </div>
                    </Card>
                  </div>
                </section>
              </>
            )}

            {view === "doctors" && (
              <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <Card title="Doctor Directory" subtitle="Clean roster management with better scanability and fee visibility.">
                  <SimpleTable headers={["Doctor", "Specialization", "Fee", "Language", "Schedule"]} rows={doctors.map((doctor) => [doctor.name, doctor.specialization, formatCurrency(doctor.fee), doctor.language, doctor.scheduleLabel])} />
                </Card>

                <Card title="Add Doctor" subtitle="Create a doctor record and seed related bot settings.">
                  <div className="grid gap-4">
                    <Field label="Name" value={doctorDraft.name} onChange={(value) => setDoctorDraft((current) => ({ ...current, name: value }))} />
                    <Field label="Specialization" value={doctorDraft.specialization} onChange={(value) => setDoctorDraft((current) => ({ ...current, specialization: value }))} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Fee" value={doctorDraft.fee} onChange={(value) => setDoctorDraft((current) => ({ ...current, fee: value }))} />
                      <Field label="Language" value={doctorDraft.language} onChange={(value) => setDoctorDraft((current) => ({ ...current, language: value }))} />
                    </div>
                    <Field label="Clinic Name" value={doctorDraft.clinicName} onChange={(value) => setDoctorDraft((current) => ({ ...current, clinicName: value }))} />
                    <Field label="Contact Number" value={doctorDraft.contactNumber} onChange={(value) => setDoctorDraft((current) => ({ ...current, contactNumber: value }))} />
                    <button className={primaryButtonClass} onClick={handleCreateDoctor} type="button">
                      Create Doctor
                    </button>
                  </div>
                </Card>
              </section>
            )}

            {view === "appointments" && (
              <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <Card title="Appointment Management" subtitle="List, reschedule, and cancel with cleaner status emphasis.">
                  <div className="grid gap-4">
                    {appointments.map((appointment) => (
                      <div key={appointment.id} className="rounded-[26px] border border-slate-200 bg-slate-50/70 p-5 transition hover:border-slate-300 hover:bg-white hover:shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{appointment.patientName}</p>
                              <StatusBadge label={appointment.status} tone={statusTone(appointment.status)} />
                            </div>
                            <p className="mt-2 text-sm text-slate-500">{appointment.reason}</p>
                            <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                              <span>Doctor: {appointment.doctorName ?? "Unassigned"}</span>
                              <span>When: {appointment.appointmentDate}</span>
                            </div>
                          </div>

                          {user.role !== "READ_ONLY" && (
                            <div className="flex flex-wrap gap-2">
                              <button className={secondaryButtonClass} onClick={() => handleRescheduleAppointment(appointment.appointmentId)} type="button">
                                Reschedule
                              </button>
                              <button className={dangerButtonClass} onClick={() => handleCancelAppointment(appointment.appointmentId)} type="button">
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {user.role !== "READ_ONLY" && (
                  <Card title="Book Appointment" subtitle="Manual booking flow layered on top of the shared appointments store.">
                    <div className="grid gap-4">
                      <Field label="Patient Name" value={appointmentDraft.patientName} onChange={(value) => setAppointmentDraft((current) => ({ ...current, patientName: value }))} />
                      <Field label="Phone Number" value={appointmentDraft.phoneNumber} onChange={(value) => setAppointmentDraft((current) => ({ ...current, phoneNumber: value }))} />
                      <Field label="Appointment Date" value={appointmentDraft.appointmentDate} onChange={(value) => setAppointmentDraft((current) => ({ ...current, appointmentDate: value }))} placeholder="Tomorrow 10 AM" />
                      <Field label="Reason" value={appointmentDraft.reason} onChange={(value) => setAppointmentDraft((current) => ({ ...current, reason: value }))} />
                      <SelectField label="Doctor" value={appointmentDraft.doctorId} options={doctors.map((doctor) => ({ label: doctor.name, value: doctor.doctorId }))} onChange={(value) => setAppointmentDraft((current) => ({ ...current, doctorId: value }))} />
                      <button className={primaryButtonClass} onClick={handleBookAppointment} type="button">
                        Save Appointment
                      </button>
                    </div>
                  </Card>
                )}
              </section>
            )}

            {view === "calls" && (
              <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <Card title="Call Logs" subtitle="Better hierarchy for call stages, outcomes, and transcript access.">
                  <SimpleTable
                    headers={["Caller", "Stage", "Intent", "Outcome", "Duration"]}
                    rows={calls.map((call) => [call.callerNumber, call.bookingStage, call.latestIntent ?? "-", call.outcome, `${call.durationSeconds}s`])}
                    rowActions={calls.map((call) => ({ label: "View Transcript", onClick: () => handleSelectCall(call.sessionId) }))}
                  />
                </Card>

                <Card title="Live Call Monitor" subtitle="Visually distinct monitor with pulse state and current routing context.">
                  <div className="grid gap-4">
                    {liveCalls.length === 0 && <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">No active calls at the moment.</div>}

                    {liveCalls.map((call) => (
                      <div key={call.sessionId} className="relative overflow-hidden rounded-[28px] border border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.95),rgba(236,253,245,0.86))] p-5 shadow-[0_16px_34px_rgba(14,165,233,0.10)]">
                        <div className="absolute right-5 top-5 flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                          <span className="live-pulse inline-flex rounded-full bg-emerald-500 p-1" />
                          Live
                        </div>

                        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-700">{call.callerNumber}</p>
                        <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-slate-950">{call.selectedDoctor ?? call.selectedSpecialization ?? "Routing in progress"}</h3>

                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          <MiniMetric label="Node" value={call.currentNode ?? call.bookingStage} tone="blue" />
                          <MiniMetric label="Intent" value={call.latestIntent ?? "pending"} tone="cyan" />
                          <MiniMetric label="Updated" value={formatDate(call.updatedAt)} tone="green" />
                        </div>

                        <button className="mt-5 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800" onClick={() => handleSelectCall(call.sessionId)} type="button">
                          Open Transcript
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            )}

            {view === "transcripts" && (
              <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <Card title="Transcript Sessions" subtitle="Select any call to inspect the full conversation timeline.">
                  <div className="grid gap-3">
                    {calls.map((call) => {
                      const active = selectedCall?.sessionId === call.sessionId;
                      return (
                        <button
                          key={call.sessionId}
                          className={cx(
                            "rounded-[24px] border p-4 text-left transition",
                            active ? "border-sky-300 bg-sky-50 shadow-[0_14px_30px_rgba(14,165,233,0.10)]" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          )}
                          onClick={() => handleSelectCall(call.sessionId)}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-950">{call.callerNumber}</p>
                              <p className="mt-2 text-sm text-slate-600">{call.selectedDoctor ?? call.selectedSpecialization ?? "Unassigned"}</p>
                            </div>
                            <StatusBadge label={call.outcome} tone={statusTone(call.outcome)} />
                          </div>
                          <p className="mt-3 text-xs text-slate-500">{formatDate(call.updatedAt)}</p>
                        </button>
                      );
                    })}
                  </div>
                </Card>

                <Card title="Conversation History" subtitle="A cleaner transcript viewer for support, doctor, and admin workflows.">
                  <div className="grid gap-4">
                    {selectedCall?.transcriptHistory?.map((entry) => (
                      <TranscriptBubble key={`${entry.timestamp}-${entry.speaker}-${entry.text}`} speaker={entry.speaker} text={entry.text} timestamp={formatDate(entry.timestamp)} />
                    ))}
                    {!selectedCall && <EmptyState label="Select a call to view its transcript." />}
                  </div>
                </Card>
              </section>
            )}

            {view === "settings" && primarySettings && (
              <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <Card title="Bot Settings" subtitle="Greeting, after-hours, fallback, language, fee, and scheduling in one polished editor.">
                  <SettingsEditor key={primarySettings.doctorId} initial={primarySettings} onSave={handleSaveSettings} readOnly={user.role === "READ_ONLY"} />
                </Card>

                <div className="grid gap-6">
                  <Card title="FAQ / Knowledge Base" subtitle="Improved content layout for common clinic responses.">
                    <div className="grid gap-4">
                      {faq.map((entry) => (
                        <div key={entry.id} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-950">{entry.question}</p>
                            <StatusBadge label={entry.category} tone="neutral" />
                          </div>
                          <p className="mt-3 text-sm leading-7 text-slate-600">{entry.answer}</p>
                        </div>
                      ))}

                      {user.role !== "READ_ONLY" && (
                        <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-5">
                          <div className="grid gap-4">
                            <Field label="Question" value={faqDraft.question} onChange={(value) => setFaqDraft((current) => ({ ...current, question: value }))} />
                            <TextAreaField label="Answer" value={faqDraft.answer} onChange={(value) => setFaqDraft((current) => ({ ...current, answer: value }))} />
                            <Field label="Category" value={faqDraft.category} onChange={(value) => setFaqDraft((current) => ({ ...current, category: value }))} />
                            <button className={primaryButtonClass} onClick={handleSaveFaq} type="button">
                              Save FAQ
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>

                  {user.role === "ADMIN" && (
                    <Card title="Bot Flow Config" subtitle="Cleaner JSON editor presentation for config-driven routing.">
                      <div className="grid gap-4">
                        {flows.map((flow) => (
                          <div key={flow.id} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
                            <p className="text-sm font-semibold text-slate-950">{flow.name}</p>
                            <pre className="mt-4 overflow-x-auto rounded-[20px] bg-slate-950 p-4 text-xs leading-6 text-slate-100">{stringifyJson(flow.definition)}</pre>
                          </div>
                        ))}

                        <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-5">
                          <div className="grid gap-4">
                            <Field label="Flow Name" value={flowDraft.name} onChange={(value) => setFlowDraft((current) => ({ ...current, name: value }))} />
                            <TextAreaField label="JSON Definition" rows={8} value={flowDraft.definition} onChange={(value) => setFlowDraft((current) => ({ ...current, definition: value }))} />
                            <button className={primaryButtonClass} onClick={handleSaveFlow} type="button">
                              Save Flow
                            </button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              </section>
            )}

            {view === "analytics" && analytics && (
              <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <Card title="KPI Snapshot" subtitle="Read-only analytics cards with stronger visual hierarchy.">
                  <div className="grid gap-4 md:grid-cols-3">
                    <MetricCard label="Call Volume" value={analytics.totalCalls} subtitle="All tracked calls" tone="blue" icon={<PhoneIcon />} />
                    <MetricCard label="Booking Rate" value={formatPercent(analytics.bookingRate)} subtitle="Conversion efficiency" tone="green" icon={<CalendarIcon />} />
                    <MetricCard label="Transfer Rate" value={formatPercent(analytics.transferRate)} subtitle="Escalation share" tone="amber" icon={<ArrowSplitIcon />} />
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

function FeatureStat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: MetricTone }) {
  return (
    <article className={cx("rounded-[26px] border p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]", toneCardClass[tone])}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-4 text-lg font-semibold tracking-[-0.02em] text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </article>
  );
}

function HeroMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.02em] text-white">{value}</p>
    </div>
  );
}

function MetricCard({ label, value, subtitle, tone, icon }: { label: string; value: string | number; subtitle: string; tone: MetricTone; icon: ReactNode }) {
  return (
    <article className={cx("group rounded-[28px] border p-5 shadow-[0_16px_36px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5", toneCardClass[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{label}</p>
          <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">{value}</p>
          <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
        </div>
        <div className="rounded-[20px] border border-white/70 bg-white/80 p-3 text-slate-700 shadow-sm">{icon}</div>
      </div>
    </article>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string | number; tone: MetricTone }) {
  return (
    <div className={cx("rounded-[22px] border p-4", toneSoftClass[tone])}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-900">{value}</p>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)] sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{subtitle}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SummaryTile({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-7 text-slate-600">{body}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm text-slate-500">{label}</div>;
}

function TranscriptBubble({ speaker, text, timestamp }: { speaker: string; text: string; timestamp: string }) {
  const isBot = speaker === "bot";

  return (
    <div className={cx("rounded-[26px] p-5 shadow-sm", isBot ? "bg-slate-950 text-white" : "border border-slate-200 bg-slate-50 text-slate-950")}>
      <div className="flex items-center justify-between gap-3">
        <p className={cx("text-[11px] font-semibold uppercase tracking-[0.26em]", isBot ? "text-sky-200" : "text-slate-400")}>{speaker}</p>
        <p className={cx("text-xs", isBot ? "text-slate-400" : "text-slate-500")}>{timestamp}</p>
      </div>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{text}</p>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="grid gap-2.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ label: string; value: string }>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="grid gap-2.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SimpleTable({ headers, rows, rowActions }: { headers: string[]; rows: Array<Array<string | number>>; rowActions?: Array<{ label: string; onClick: () => void }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                {header}
              </th>
            ))}
            {rowActions && <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.join("-")}-${index}`} className="rounded-[22px] bg-slate-50 text-slate-700 shadow-[0_1px_0_rgba(148,163,184,0.14)] transition hover:bg-slate-100/80">
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="px-4 py-4 first:rounded-l-[22px] last:rounded-r-[22px]">
                  <span className={cellIndex === 0 ? "font-semibold text-slate-950" : undefined}>{cell}</span>
                </td>
              ))}
              {rowActions && (
                <td className="px-4 py-4 first:rounded-l-[22px] last:rounded-r-[22px]">
                  <button className={secondaryButtonClass} onClick={rowActions[index].onClick} type="button">
                    {rowActions[index].label}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimpleList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-5">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <div key={item} className="rounded-[18px] border border-white bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            {item}
          </div>
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
    <div className="grid gap-4">
      {!scheduleOnly && (
        <>
          <TextAreaField label="Greeting Message" value={draft.greetingMessage} onChange={(value) => setDraft((current) => ({ ...current, greetingMessage: value }))} />
          <TextAreaField label="After Hours Message" value={draft.afterHoursMessage} onChange={(value) => setDraft((current) => ({ ...current, afterHoursMessage: value }))} />
          <TextAreaField label="Fallback Response" value={draft.fallbackResponse} onChange={(value) => setDraft((current) => ({ ...current, fallbackResponse: value }))} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Language" value={draft.language} onChange={(value) => setDraft((current) => ({ ...current, language: value }))} />
            <Field label="Transfer Number" value={draft.transferNumber} onChange={(value) => setDraft((current) => ({ ...current, transferNumber: value }))} />
            <Field label="Fee" value={String(draft.fee ?? "")} onChange={(value) => setDraft((current) => ({ ...current, fee: Number(value) || 0 }))} />
          </div>
        </>
      )}

      <Field label="Schedule Label" value={draft.scheduleLabel ?? ""} onChange={(value) => setDraft((current) => ({ ...current, scheduleLabel: value }))} />

      <TextAreaField
        label="Availability JSON"
        rows={scheduleOnly ? 12 : 6}
        value={stringifyJson(draft.availability)}
        onChange={(value) => {
          try {
            setDraft((current) => ({ ...current, availability: JSON.parse(value) as SettingsRecord["availability"] }));
          } catch {
            return;
          }
        }}
      />

      {!scheduleOnly && (
        <>
          <Field
            label="Supported Intents"
            value={draft.supportedIntents.join(", ")}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                supportedIntents: value
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              }))
            }
          />
          <TextAreaField label="Emergency Message" value={draft.emergencyMessage} onChange={(value) => setDraft((current) => ({ ...current, emergencyMessage: value }))} />
          <label className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            <input checked={draft.bookingEnabled} onChange={(event) => setDraft((current) => ({ ...current, bookingEnabled: event.target.checked }))} type="checkbox" />
            Booking enabled
          </label>
        </>
      )}

      {!readOnly && <button className={primaryButtonClass} onClick={() => onSave(draft)} type="button">Save Settings</button>}
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "green" | "amber" | "red" | "blue" | "neutral" }) {
  const palette: Record<typeof tone, string> = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
    neutral: "border-slate-200 bg-slate-100 text-slate-600"
  };

  return <span className={cx("inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]", palette[tone])}>{label}</span>;
}

function statusTone(label: string): "green" | "amber" | "red" | "blue" | "neutral" {
  const value = label.toLowerCase();
  if (value.includes("book") || value.includes("done") || value.includes("complete") || value.includes("success")) {
    return "green";
  }
  if (value.includes("transfer") || value.includes("pending") || value.includes("progress")) {
    return "amber";
  }
  if (value.includes("cancel") || value.includes("fail") || value.includes("error")) {
    return "red";
  }
  if (value.includes("active") || value.includes("live") || value.includes("new")) {
    return "blue";
  }
  return "neutral";
}

function IconBase({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg className={cx("size-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function DashboardIcon() {
  return (
    <IconBase>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="4" rx="1.5" />
      <rect x="14" y="10" width="7" height="11" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </IconBase>
  );
}

function UsersIcon() {
  return (
    <IconBase>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 4.13a4 4 0 0 1 0 7.75" />
    </IconBase>
  );
}

function CalendarIcon() {
  return (
    <IconBase>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </IconBase>
  );
}

function PhoneIcon() {
  return (
    <IconBase>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 11.24 19a19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.36 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.59a16 16 0 0 0 6.41 6.41l1.14-1.23a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92Z" />
    </IconBase>
  );
}

function ChatIcon() {
  return (
    <IconBase>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </IconBase>
  );
}

function SettingsIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </IconBase>
  );
}

function ChartIcon() {
  return (
    <IconBase>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </IconBase>
  );
}

function ClockIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </IconBase>
  );
}

function SignalIcon() {
  return (
    <IconBase className="size-4">
      <path d="M2 20h.01" />
      <path d="M7 20v-4" />
      <path d="M12 20v-8" />
      <path d="M17 20V8" />
      <path d="M22 20V4" />
    </IconBase>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <IconBase className={cx("size-4", className)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </IconBase>
  );
}

function PulseIcon() {
  return (
    <IconBase className="size-4">
      <path d="M22 12h-4l-3 7-4-14-3 7H2" />
    </IconBase>
  );
}

function ArrowSplitIcon() {
  return (
    <IconBase>
      <path d="M21 3v6h-6" />
      <path d="M3 21V9a6 6 0 0 1 6-6h12" />
      <path d="M3 3l7 7" />
    </IconBase>
  );
}

function AlertIcon() {
  return (
    <IconBase>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

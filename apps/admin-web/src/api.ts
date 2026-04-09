export type Role = "ADMIN" | "DOCTOR" | "READ_ONLY";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  doctorId?: string | null;
};

export type DashboardResponse = {
  totals: {
    callsToday: number;
    booked: number;
    transferred: number;
    failed: number;
    activeCalls: number;
    appointments: number;
  };
  doctorStats: Array<{
    doctorId: string;
    doctorName: string;
    calls: number;
    booked: number;
    transferred: number;
    failed: number;
  }>;
};

export type DoctorRecord = {
  id: string;
  doctorId: string;
  name: string;
  specialty: string;
  specialization: string;
  fee: number;
  clinicName: string;
  active: boolean;
  language: string;
  scheduleLabel: string;
  availability: Array<{ day: string; start: string; end: string; blocked: boolean; leave: boolean }>;
  contactNumber: string;
};

export type AppointmentRecord = {
  id: string;
  appointmentId: string;
  patientName: string;
  phoneNumber: string;
  appointmentDate: string;
  reason: string;
  doctorId?: string | null;
  doctorName?: string | null;
  status: string;
  source?: string;
};

export type TranscriptEntry = {
  speaker: "caller" | "bot";
  text: string;
  timestamp: string;
};

export type CallRecord = {
  id: string;
  sessionId: string;
  callerNumber: string;
  callStatus: string;
  bookingStage: string;
  latestIntent: string | null;
  selectedSpecialization: string | null;
  selectedDoctor: string | null;
  doctorId?: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  patientName: string | null;
  patientType: string | null;
  contactNumber: string | null;
  bookingResult: string | null;
  currentNode: string | null;
  outcome: string;
  transcriptHistory: TranscriptEntry[];
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  durationSeconds: number;
};

export type SettingsRecord = {
  doctorId: string;
  doctorName: string;
  greetingMessage: string;
  afterHoursMessage: string;
  fallbackResponse: string;
  language: string;
  supportedIntents: string[];
  transferNumber: string;
  bookingEnabled: boolean;
  emergencyMessage: string;
  fee: number | null;
  scheduleLabel: string | null;
  availability: Array<{ day: string; start: string; end: string; blocked: boolean; leave: boolean }>;
};

export type FaqRecord = {
  id: string;
  faqId: string;
  doctorId?: string | null;
  question: string;
  answer: string;
  category: string;
};

export type FlowRecord = {
  id: string;
  flowId: string;
  doctorId?: string | null;
  name: string;
  definition: unknown;
};

export type AnalyticsResponse = {
  totalCalls: number;
  bookingRate: number;
  transferRate: number;
  doctorDemand: Array<{ label: string; value: number }>;
  intentDistribution: Array<{ label: string; value: number }>;
};

const apiBaseUrl = import.meta.env.VITE_PLATFORM_API_URL ?? import.meta.env.VITE_DOCTOR_SERVICE_URL ?? "http://localhost:4001";

async function request<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json()) as { success: boolean; data?: T; error?: string };

  if (!response.ok || !payload.success || typeof payload.data === "undefined") {
    throw new Error(payload.error ?? `Request failed for ${path}`);
  }

  return payload.data;
}

export async function login(email: string, password: string) {
  return request<{ token: string; user: User }>("/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function fetchMe(token: string) {
  return request<User>("/me", undefined, token);
}

export function fetchDashboard(token: string) {
  return request<DashboardResponse>("/dashboard", undefined, token);
}

export function fetchDoctors(token: string) {
  return request<DoctorRecord[]>("/doctors", undefined, token);
}

export function createDoctor(token: string, body: Record<string, unknown>) {
  return request<DoctorRecord>("/doctors", { method: "POST", body: JSON.stringify(body) }, token);
}

export function updateDoctor(token: string, doctorId: string, body: Record<string, unknown>) {
  return request<DoctorRecord>(`/doctors/${doctorId}`, { method: "PUT", body: JSON.stringify(body) }, token);
}

export function fetchAppointments(token: string) {
  return request<AppointmentRecord[]>("/appointments", undefined, token);
}

export function bookAppointment(token: string, body: Record<string, unknown>) {
  return request<AppointmentRecord>("/book", { method: "POST", body: JSON.stringify(body) }, token);
}

export function cancelAppointment(token: string, appointmentId: string) {
  return request<AppointmentRecord>("/cancel", { method: "POST", body: JSON.stringify({ appointmentId }) }, token);
}

export function rescheduleAppointment(token: string, appointmentId: string, appointmentDate: string) {
  return request<AppointmentRecord>("/reschedule", {
    method: "POST",
    body: JSON.stringify({ appointmentId, appointmentDate })
  }, token);
}

export function fetchCalls(token: string) {
  return request<CallRecord[]>("/calls", undefined, token);
}

export function fetchLiveCalls(token: string) {
  return request<CallRecord[]>("/calls/live", undefined, token);
}

export function fetchTranscript(token: string, sessionId: string) {
  return request<CallRecord>(`/calls/${sessionId}/transcript`, undefined, token);
}

export function fetchSettings(token: string) {
  return request<SettingsRecord[]>("/settings", undefined, token);
}

export function updateSettings(token: string, body: Record<string, unknown>) {
  return request<SettingsRecord>("/settings", { method: "PUT", body: JSON.stringify(body) }, token);
}

export function fetchFaq(token: string) {
  return request<FaqRecord[]>("/faq", undefined, token);
}

export function saveFaq(token: string, body: Record<string, unknown>) {
  return request<FaqRecord>("/faq", { method: "PUT", body: JSON.stringify(body) }, token);
}

export function fetchBotFlows(token: string) {
  return request<FlowRecord[]>("/bot-flows", undefined, token);
}

export function saveBotFlow(token: string, body: Record<string, unknown>) {
  return request<FlowRecord>("/bot-flows", { method: "PUT", body: JSON.stringify(body) }, token);
}

export function fetchAnalytics(token: string) {
  return request<AnalyticsResponse>("/analytics", undefined, token);
}

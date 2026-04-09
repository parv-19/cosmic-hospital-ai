export type BookingStage =
  | "greeting"
  | "waiting_for_intent"
  | "waiting_for_specialization"
  | "waiting_for_doctor_preference"
  | "waiting_for_date"
  | "waiting_for_time"
  | "waiting_for_patient_name"
  | "waiting_for_mobile"
  | "waiting_for_patient_type"
  | "confirming"
  | "booked"
  | "cancelled"
  | "fallback";

export type TranscriptEntry = {
  speaker: "caller" | "bot";
  text: string;
  timestamp: string;
};

export type DemoSessionRecord = {
  sessionId: string;
  callerNumber: string;
  callStatus: "active" | "completed" | "cancelled";
  bookingStage: BookingStage;
  selectedSpecialization: string | null;
  selectedDoctor: string | null;
  doctorPreference: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  patientName: string | null;
  patientType: string | null;
  contactNumber: string | null;
  bookingResult: string | null;
  latestIntent: string | null;
  transcriptHistory: TranscriptEntry[];
  botResponseHistory: TranscriptEntry[];
  createdAt: string;
  updatedAt: string;
};

const sessions = new Map<string, DemoSessionRecord>();

export class CallRepository {
  getSession(sessionId: string): DemoSessionRecord | undefined {
    return sessions.get(sessionId);
  }

  saveSession(session: DemoSessionRecord): DemoSessionRecord {
    sessions.set(session.sessionId, session);
    return session;
  }

  listSessions(): DemoSessionRecord[] {
    return Array.from(sessions.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
}

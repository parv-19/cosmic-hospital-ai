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
  | "reschedule_waiting_for_new_day"
  | "reschedule_waiting_for_new_slot"
  | "reschedule_confirming"
  | "rescheduled"
  | "cancel_confirming"
  | "booked"
  | "cancelled"
  | "fallback";

export type TranscriptEntry = {
  speaker: "caller" | "bot";
  text: string;
  timestamp: string;
};

export type UsageLedgerEntry = {
  service: "stt" | "tts" | "llm" | "transfer";
  provider: string;
  model: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  currency: "INR";
  estimatedCost: number;
  estimated: boolean;
  pricingSourceUrl: string;
  createdAt: string;
};

export type ConversationMemory = {
  lastDoctor?: string | null;
  lastDay?: string | null;
  lastSuggestedSlots?: string[];
  silenceRetries?: number;
  callerSeenBefore?: boolean;
};

export type SessionAppointmentSnapshot = {
  id?: string;
  appointmentId?: string;
  patientName?: string;
  phoneNumber?: string;
  appointmentDate?: string;
  reason?: string;
  status?: string;
  doctorId?: string | null;
  doctorName?: string | null;
};

export type RescheduleSlotSelection = {
  time: string;
};

export type DemoSessionRecord = {
  sessionId: string;
  callerNumber: string;
  callStatus: "active" | "completed" | "cancelled" | "failed" | "transferred";
  bookingStage: BookingStage;
  selectedSpecialization: string | null;
  selectedDoctor: string | null;
  doctorPreference: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  patientName: string | null;
  patientType: string | null;
  contactNumber: string | null;
  bookingContactConfirmed?: boolean;
  bookingContactConfirmationPending?: boolean;
  availabilityCheckKey?: string | null;
  availabilityOfferedDate?: string | null;
  availabilityOfferedTime?: string | null;
  availabilityOfferedSlots?: string[];
  conversationMemory?: ConversationMemory;
  reschedule_existing?: SessionAppointmentSnapshot | null;
  reschedule_new_day?: string | null;
  reschedule_available_slots?: string[];
  reschedule_confirmed_slot?: RescheduleSlotSelection | null;
  cancel_booking?: SessionAppointmentSnapshot | null;
  bookingResult: string | null;
  latestIntent: string | null;
  fallbackAttempts: number;
  transcriptHistory: TranscriptEntry[];
  botResponseHistory: TranscriptEntry[];
  usageLedger: UsageLedgerEntry[];
  createdAt: string;
  updatedAt: string;
  frozenConfig?: any;
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

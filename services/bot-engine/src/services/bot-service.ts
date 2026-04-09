import { CallLogModel, DoctorModel } from "@ai-hospital/shared-db";

import { CallRepository, type BookingStage, type DemoSessionRecord, type TranscriptEntry } from "../repositories/call-repository";

type DetectIntentResult = {
  intent: string;
  confidence: number;
};

type ClinicSettings = {
  clinicName: string;
  consultationFee: number;
  clinicTimings: string;
  transferNumber: string;
  emergencyMessage: string;
  bookingEnabled: boolean;
  greetingMessage?: string;
  supportedLanguage?: string;
};

type RuntimeDoctor = {
  doctorId: string;
  name: string;
  specialization: string;
  fee: number;
  scheduleLabel?: string;
  botSettings?: {
    greetingMessage?: string;
    afterHoursMessage?: string;
    fallbackResponse?: string;
    language?: string;
    supportedIntents?: string[];
    transferNumber?: string;
    bookingEnabled?: boolean;
    emergencyMessage?: string;
  } | null;
};

type RuntimeConfigResponse = {
  doctors: RuntimeDoctor[];
};

type ProcessCallInput = {
  transcript: string;
  sessionId: string;
  callerNumber?: string;
  aiServiceUrl: string;
  doctorServiceUrl: string;
  appointmentServiceUrl: string;
};

type ProcessCallOutput = {
  sessionId: string;
  transcript: string;
  intent: string;
  action: string;
  reply: string;
  stage: BookingStage;
  session: DemoSessionRecord;
};

const DEMO_MODE_ENABLED = (process.env.DEMO_MODE ?? "true").toLowerCase() !== "false";

const FALLBACK_DOCTORS: RuntimeDoctor[] = [
  { doctorId: "doctor-1", name: "Dr. Ananya Sharma", specialization: "General Medicine", fee: 700 },
  { doctorId: "doctor-2", name: "Dr. Rohan Patel", specialization: "Cardiology", fee: 1200 },
  { doctorId: "doctor-3", name: "Dr. Meera Shah", specialization: "Dermatology", fee: 900 }
];

const PHRASES = {
  greeting:
    "Namaste, hospital appointment desk mein aapka swagat hai. Main aapki appointment booking mein madad kar sakti hoon. Please tell me the doctor name or specialization.",
  askSpecialization:
    "Aap kis doctor ya kis specialization ke liye appointment lena chahte hain? Please tell me the doctor name or specialization.",
  askDoctorPreference:
    "Kya aap kisi specific doctor se milna chahte hain ya earliest available doctor chalega?",
  askDate: "Aapko kis din appointment chahiye? Please tell me your preferred date.",
  askTime: "Aapko morning, afternoon, ya evening mein slot chahiye? What time would you prefer?",
  askPatientName: "Kripya patient ka naam batayein. Please tell me the patient name.",
  askMobile: "Kripya contact number batayein. Please tell me the contact number.",
  askPatientType: "Kya yeh new patient hai ya follow-up consultation?",
  confirmPrefix: "Main aapki details confirm karti hoon.",
  fallback:
    "Maaf kijiye, demo mode mein main filhaal selected appointment booking inputs hi samajh pa rahi hoon. Please continue with the appointment booking details.",
  end: "Dhanyavaad. Aapki booking request dashboard par update kar di gayi hai.",
  cancelled: "The booking request has been cancelled in demo mode. If you want, we can start again with a new appointment request.",
  transfer: "I will transfer you to reception at the configured clinic number.",
  emergency: "If this is a medical emergency, please contact emergency support immediately."
} as const;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, init);

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function createHistoryEntry(speaker: "caller" | "bot", text: string): TranscriptEntry {
  return {
    speaker,
    text,
    timestamp: nowIso()
  };
}

function createNewSession(sessionId: string, callerNumber?: string): DemoSessionRecord {
  const createdAt = nowIso();

  return {
    sessionId,
    callerNumber: callerNumber ?? "unknown",
    callStatus: "active",
    bookingStage: "waiting_for_intent",
    selectedSpecialization: null,
    selectedDoctor: null,
    doctorPreference: null,
    preferredDate: null,
    preferredTime: null,
    patientName: null,
    patientType: null,
    contactNumber: callerNumber ?? null,
    bookingResult: null,
    latestIntent: null,
    transcriptHistory: [],
    botResponseHistory: [],
    createdAt,
    updatedAt: createdAt
  };
}

function normalizeTranscript(transcript: string): string {
  return transcript.trim().toLowerCase();
}

function matchIntentStart(normalizedTranscript: string): boolean {
  return [
    "hello",
    "hi",
    "namaste",
    "mujhe appointment book karni hai",
    "doctor appointment chahiye",
    "appointment book karna hai",
    "appointment"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function buildDoctorDirectory(runtimeDoctors: RuntimeDoctor[]) {
  const doctors = runtimeDoctors.length > 0 ? runtimeDoctors : FALLBACK_DOCTORS;
  const specializationMap = new Map<string, { specialization: string; doctors: string[]; doctorIds: string[] }>();

  for (const doctor of doctors) {
    const key = doctor.specialization.toLowerCase();
    const existing = specializationMap.get(key);

    if (existing) {
      existing.doctors.push(doctor.name);
      existing.doctorIds.push(doctor.doctorId);
    } else {
      specializationMap.set(key, {
        specialization: doctor.specialization,
        doctors: [doctor.name],
        doctorIds: [doctor.doctorId]
      });
    }
  }

  return {
    doctors,
    specializationMap
  };
}

function mapSpecialization(normalizedTranscript: string, runtimeDoctors: RuntimeDoctor[]): { specialization: string; doctors: string[] } | null {
  const directory = buildDoctorDirectory(runtimeDoctors);

  for (const [key, definition] of directory.specializationMap.entries()) {
    if (normalizedTranscript.includes(key)) {
      return {
        specialization: definition.specialization,
        doctors: definition.doctors
      };
    }
  }

  return null;
}

function mapDoctorPreference(normalizedTranscript: string, session: DemoSessionRecord, runtimeDoctors: RuntimeDoctor[]): { doctorPreference: string; selectedDoctor: string; doctorId: string | null } | null {
  const doctorList = runtimeDoctors.length > 0 ? runtimeDoctors : FALLBACK_DOCTORS;
  const exactDoctor = doctorList.find((doctor) => normalizedTranscript.includes(doctor.name.toLowerCase()));

  if (exactDoctor) {
    return {
      doctorPreference: "specific_doctor",
      selectedDoctor: exactDoctor.name,
      doctorId: exactDoctor.doctorId
    };
  }

  if (normalizedTranscript.includes("koi bhi doctor chalega") || normalizedTranscript.includes("earliest available doctor")) {
    const bySpecialization = doctorList.find((doctor) => doctor.specialization === session.selectedSpecialization) ?? doctorList[0];

    return {
      doctorPreference: "earliest_available",
      selectedDoctor: bySpecialization?.name ?? "Dr. Ananya Sharma",
      doctorId: bySpecialization?.doctorId ?? null
    };
  }

  return null;
}

function mapDate(normalizedTranscript: string): string | null {
  const phrases = ["aaj", "kal", "tomorrow", "monday", "next available", "earliest slot"];
  const matched = phrases.find((phrase) => normalizedTranscript.includes(phrase));
  return matched ?? null;
}

function mapTime(normalizedTranscript: string): string | null {
  const phrases = ["morning", "afternoon", "evening", "10 baje", "11 baje", "4 pm", "5 pm", "koi bhi time chalega"];
  const matched = phrases.find((phrase) => normalizedTranscript.includes(phrase));
  return matched ?? null;
}

function extractPatientName(transcript: string): string | null {
  const patterns = [/mera naam\s+([a-zA-Z ]+?)\s+hai/i, /patient name\s+([a-zA-Z ]+)/i];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractMobile(transcript: string): string | null {
  const digits = transcript.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function mapPatientType(normalizedTranscript: string): string | null {
  if (normalizedTranscript.includes("new patient")) {
    return "new patient";
  }

  if (normalizedTranscript.includes("follow-up")) {
    return "follow-up";
  }

  return null;
}

function mapConfirmation(normalizedTranscript: string): "confirm" | "change_doctor" | "change_time" | "cancel" | null {
  if (["yes", "confirm", "correct"].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "confirm";
  }

  if (normalizedTranscript.includes("change doctor")) {
    return "change_doctor";
  }

  if (normalizedTranscript.includes("change time")) {
    return "change_time";
  }

  if (normalizedTranscript.includes("cancel booking")) {
    return "cancel";
  }

  return null;
}

function buildConfirmationSummary(session: DemoSessionRecord): string {
  return `${PHRASES.confirmPrefix} ${session.selectedSpecialization ?? "General Medicine"} consultation with ${
    session.selectedDoctor ?? "the assigned doctor"
  } on ${session.preferredDate ?? "the selected date"} at ${session.preferredTime ?? "the selected time"} for ${
    session.patientName ?? "the patient"
  }, ${session.patientType ?? "consultation"}. Please say confirm, change doctor, change time, or cancel booking.`;
}

function buildFinalSummary(session: DemoSessionRecord, appointmentId: string | null): string {
  return `Aapki appointment ${session.selectedDoctor ?? "the assigned doctor"} ke saath ${session.preferredDate ?? "the selected date"} ko ${
    session.preferredTime ?? "the selected time"
  } par request kar di gayi hai. Reference id ${appointmentId ?? "pending"}. ${PHRASES.end}`;
}

function updateSession(session: DemoSessionRecord, changes: Partial<DemoSessionRecord>): DemoSessionRecord {
  return {
    ...session,
    ...changes,
    updatedAt: nowIso()
  };
}

async function syncSessionToDb(session: DemoSessionRecord): Promise<void> {
  try {
    const doctors = await DoctorModel.find().lean();
    const matchingDoctor = doctors.find((doctor) => doctor.name === session.selectedDoctor) ?? null;
    const outcome =
      session.bookingStage === "booked"
        ? "booked"
        : session.bookingStage === "cancelled"
          ? "failed"
          : session.latestIntent === "human_escalation"
            ? "transferred"
            : session.callStatus === "active"
              ? "active"
              : "failed";

    await CallLogModel.updateOne(
      { sessionId: session.sessionId },
      {
        $set: {
          sessionId: session.sessionId,
          callerNumber: session.callerNumber,
          callStatus: session.callStatus,
          bookingStage: session.bookingStage,
          latestIntent: session.latestIntent,
          selectedSpecialization: session.selectedSpecialization,
          selectedDoctor: session.selectedDoctor,
          doctorId: matchingDoctor?.doctorId ?? null,
          preferredDate: session.preferredDate,
          preferredTime: session.preferredTime,
          patientName: session.patientName,
          patientType: session.patientType,
          contactNumber: session.contactNumber,
          bookingResult: session.bookingResult,
          currentNode: session.bookingStage,
          outcome,
          transcriptHistory: session.transcriptHistory,
          startedAt: session.createdAt,
          updatedAt: session.updatedAt,
          endedAt: session.callStatus === "active" ? null : session.updatedAt
        }
      },
      { upsert: true }
    );
  } catch {
    return;
  }
}

export class BotService {
  constructor(private readonly repository: CallRepository) {}

  listSessions(): DemoSessionRecord[] {
    return this.repository.listSessions();
  }

  getSession(sessionId: string): DemoSessionRecord | undefined {
    return this.repository.getSession(sessionId);
  }

  async processCall(input: ProcessCallInput): Promise<ProcessCallOutput> {
    if (!DEMO_MODE_ENABLED) {
      return this.processLegacyCall(input);
    }

    return this.processDemoCall(input);
  }

  private async processDemoCall(input: ProcessCallInput): Promise<ProcessCallOutput> {
    const normalizedTranscript = normalizeTranscript(input.transcript);
    const clinicResponse = await fetchJson<{ data: ClinicSettings }>(`${input.doctorServiceUrl}/clinic-settings`);
    const runtimeConfigResponse = await fetchJson<{ data: RuntimeConfigResponse }>(`${input.doctorServiceUrl}/runtime-config`);
    const clinicSettings = clinicResponse?.data;
    const runtimeDoctors = runtimeConfigResponse?.data.doctors ?? FALLBACK_DOCTORS;

    let session = this.repository.getSession(input.sessionId) ?? createNewSession(input.sessionId, input.callerNumber);
    session = updateSession(session, {
      callerNumber: input.callerNumber ?? session.callerNumber,
      transcriptHistory: [...session.transcriptHistory, createHistoryEntry("caller", input.transcript)]
    });

    let reply = clinicSettings?.greetingMessage ?? PHRASES.fallback;
    let stage: BookingStage = session.bookingStage;
    let action = "demo_fallback";
    let latestIntent = session.latestIntent ?? "demo_booking";

    if (normalizedTranscript.includes("emergency")) {
      reply = clinicSettings?.emergencyMessage ?? PHRASES.emergency;
      action = "emergency_escalation";
      latestIntent = "emergency";
      stage = "fallback";
    } else if (normalizedTranscript.includes("human") || normalizedTranscript.includes("reception")) {
      reply = `I will transfer you to reception at ${clinicSettings?.transferNumber ?? "the configured clinic number"}.`;
      action = "transfer_call";
      latestIntent = "human_escalation";
      stage = "fallback";
      session = updateSession(session, { callStatus: "completed" });
    } else {
      switch (session.bookingStage) {
        case "waiting_for_intent":
        case "greeting":
          if (matchIntentStart(normalizedTranscript)) {
            reply = PHRASES.askSpecialization;
            stage = "waiting_for_specialization";
            action = "capture_booking_intent";
            latestIntent = "book_appointment";
          } else {
            reply = clinicSettings?.greetingMessage ?? PHRASES.greeting;
            stage = "waiting_for_intent";
            action = "greet_and_prompt";
          }
          break;

        case "waiting_for_specialization": {
          const specialization = mapSpecialization(normalizedTranscript, runtimeDoctors);

          if (specialization) {
            session = updateSession(session, {
              selectedSpecialization: specialization.specialization,
              selectedDoctor: specialization.doctors[0]
            });
            reply = PHRASES.askDoctorPreference;
            stage = "waiting_for_doctor_preference";
            action = "capture_specialization";
          } else {
            reply = runtimeDoctors.length > 0
              ? `Available specializations include ${runtimeDoctors.map((doctor) => doctor.specialization).filter((value, index, array) => array.indexOf(value) === index).join(", ")}. Please choose one.`
              : PHRASES.askSpecialization;
          }
          break;
        }

        case "waiting_for_doctor_preference": {
          const preference = mapDoctorPreference(normalizedTranscript, session, runtimeDoctors);

          if (preference) {
            session = updateSession(session, {
              doctorPreference: preference.doctorPreference,
              selectedDoctor: preference.selectedDoctor
            });
            reply = PHRASES.askDate;
            stage = "waiting_for_date";
            action = "capture_doctor_preference";
          }
          break;
        }

        case "waiting_for_date": {
          const date = mapDate(normalizedTranscript);

          if (date) {
            session = updateSession(session, { preferredDate: date });
            reply = PHRASES.askTime;
            stage = "waiting_for_time";
            action = "capture_date";
          }
          break;
        }

        case "waiting_for_time": {
          const time = mapTime(normalizedTranscript);

          if (time) {
            session = updateSession(session, { preferredTime: time });
            reply = PHRASES.askPatientName;
            stage = "waiting_for_patient_name";
            action = "capture_time";
          }
          break;
        }

        case "waiting_for_patient_name": {
          const patientName = extractPatientName(input.transcript);

          if (patientName) {
            session = updateSession(session, { patientName });
            reply = PHRASES.askMobile;
            stage = "waiting_for_mobile";
            action = "capture_patient_name";
          }
          break;
        }

        case "waiting_for_mobile": {
          const mobile = extractMobile(input.transcript);

          if (mobile) {
            session = updateSession(session, { contactNumber: mobile });
            reply = PHRASES.askPatientType;
            stage = "waiting_for_patient_type";
            action = "capture_mobile";
          }
          break;
        }

        case "waiting_for_patient_type": {
          const patientType = mapPatientType(normalizedTranscript);

          if (patientType) {
            session = updateSession(session, { patientType });
            reply = buildConfirmationSummary(session);
            stage = "confirming";
            action = "capture_patient_type";
          }
          break;
        }

        case "confirming": {
          const confirmation = mapConfirmation(normalizedTranscript);

          if (confirmation === "change_doctor") {
            reply = PHRASES.askDoctorPreference;
            stage = "waiting_for_doctor_preference";
            action = "change_doctor";
          } else if (confirmation === "change_time") {
            reply = PHRASES.askTime;
            stage = "waiting_for_time";
            action = "change_time";
          } else if (confirmation === "cancel") {
            reply = PHRASES.cancelled;
            stage = "cancelled";
            action = "cancel_booking";
            session = updateSession(session, {
              callStatus: "cancelled",
              bookingResult: "Booking cancelled in demo mode"
            });
          } else if (confirmation === "confirm") {
            const selectedDoctor = runtimeDoctors.find((doctor) => doctor.name === session.selectedDoctor) ?? null;
            const appointmentResponse = await fetchJson<{ data: { id?: string; appointmentId?: string } }>(`${input.appointmentServiceUrl}/appointments`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                patientName: session.patientName ?? "Demo Patient",
                phoneNumber: session.contactNumber ?? "0000000000",
                appointmentDate: `${session.preferredDate ?? "next available"} ${session.preferredTime ?? "morning"}`,
                reason: `${session.selectedSpecialization ?? "General Medicine"} consultation with ${session.selectedDoctor ?? "assigned doctor"}`,
                doctorId: selectedDoctor?.doctorId ?? null
              })
            });

            const appointmentId = appointmentResponse?.data.id ?? appointmentResponse?.data.appointmentId ?? null;
            reply = buildFinalSummary(session, appointmentId);
            stage = "booked";
            action = "confirm_booking";
            session = updateSession(session, {
              callStatus: "completed",
              bookingResult: appointmentId ? `Booked successfully with reference ${appointmentId}` : "Booking requested in demo mode"
            });
          }
          break;
        }

        case "booked":
          reply = "Your appointment request is already confirmed in demo mode. Thank you for calling.";
          action = "booking_already_complete";
          break;

        case "cancelled":
          reply = "This demo booking was cancelled. You can start again by saying appointment book karna hai.";
          action = "booking_cancelled";
          break;

        default:
          reply = clinicSettings?.greetingMessage ?? PHRASES.greeting;
          stage = "waiting_for_intent";
          action = "reset_to_greeting";
      }
    }

    session = updateSession(session, {
      bookingStage: stage,
      latestIntent,
      botResponseHistory: [...session.botResponseHistory, createHistoryEntry("bot", reply)],
      transcriptHistory: [...session.transcriptHistory, createHistoryEntry("bot", reply)]
    });

    this.repository.saveSession(session);
    void syncSessionToDb(session);

    return {
      sessionId: session.sessionId,
      transcript: input.transcript,
      intent: latestIntent,
      action,
      reply,
      stage,
      session
    };
  }

  private async processLegacyCall(input: ProcessCallInput): Promise<ProcessCallOutput> {
    const intentResponse = await fetchJson<{ data: DetectIntentResult }>(`${input.aiServiceUrl}/detect-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        transcript: input.transcript
      })
    });

    const intent = intentResponse?.data.intent ?? "unknown";
    const clinicResponse = await fetchJson<{ data: ClinicSettings }>(`${input.doctorServiceUrl}/clinic-settings`);
    const clinicSettings = clinicResponse?.data;

    const session = this.repository.getSession(input.sessionId) ?? createNewSession(input.sessionId, input.callerNumber);

    let reply = "I am sorry, I could not understand that yet.";
    let action = "clarify";

    if (intent === "emergency") {
      reply = clinicSettings?.emergencyMessage ?? PHRASES.emergency;
      action = "emergency_escalation";
    } else if (intent === "human_escalation") {
      reply = `I will transfer you to reception at ${clinicSettings?.transferNumber ?? "the configured clinic number"}.`;
      action = "transfer_call";
    } else if (intent === "clinic_info") {
      reply = `The consultation fee is ${clinicSettings?.consultationFee ?? "configured in admin"} and clinic timings are ${clinicSettings?.clinicTimings ?? "available at the clinic desk"}.`;
      action = "share_clinic_info";
    } else if (intent === "book_appointment") {
      reply = PHRASES.askSpecialization;
      action = "create_appointment_request";
    }

    const updatedSession = updateSession(session, {
      latestIntent: intent,
      bookingStage: "waiting_for_specialization",
      transcriptHistory: [...session.transcriptHistory, createHistoryEntry("caller", input.transcript), createHistoryEntry("bot", reply)],
      botResponseHistory: [...session.botResponseHistory, createHistoryEntry("bot", reply)]
    });
    this.repository.saveSession(updatedSession);
    void syncSessionToDb(updatedSession);

    return {
      sessionId: updatedSession.sessionId,
      transcript: input.transcript,
      intent,
      action,
      reply,
      stage: updatedSession.bookingStage,
      session: updatedSession
    };
  }
}



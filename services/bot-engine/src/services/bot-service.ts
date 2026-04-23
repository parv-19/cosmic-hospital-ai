import { CallLogModel, DoctorModel } from "@ai-hospital/shared-db";
import { llmFactory, type LLMConfig } from "./provider-factory";
import { createUsageLedgerEntry, summarizeUsageLedger, type UsageEventInput, type UsageLedgerEntry } from "./costing";
import { resolveAvailability, type AppointmentSnapshot, type AvailabilityPromptTemplates, type AvailabilityRuntimeDoctor } from "./availability-resolver";

import { CallRepository, type BookingStage, type DemoSessionRecord, type SessionAppointmentSnapshot, type TranscriptEntry } from "../repositories/call-repository";

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
  fallbackPolicy?: "ask_again" | "transfer" | "end_call" | "create_callback";
  intelligenceSettings?: IntelligenceSettings | null;
  greetingMessage?: string;
  supportedLanguage?: string;
  conversationPrompts?: Partial<ConversationPrompts> | null;
  llmProviders?: LLMConfig | null;
  sttProviders?: unknown;
  ttsProviders?: unknown;
};

type IntelligenceSettings = {
  enabled?: boolean;
  askOnlyMissingFields?: boolean;
  callerNumberConfirmation?: boolean;
  languageNormalization?: boolean;
  smartClarification?: boolean;
  availabilityFirst?: boolean;
  confidenceThreshold?: number;
};

type ConversationPrompts = {
  askSpecialization: string;
  askDoctorPreference: string;
  askDate: string;
  askTime: string;
  askPatientName: string;
  askMobile: string;
  askPatientType: string;
  confirmPrefix: string;
  bookingConfirmed: string;
  bookingCancelled: string;
  bookingAlreadyComplete: string;
  bookingAlreadyCancelled: string;
  transferMessage: string;
  goodbyeMessage: string;
  confirmRememberedDoctor: string;
  confirmRememberedDay: string;
  callerNumberConfirmation: string;
  callerReuseConfirmation: string;
  silenceRetryWithSlots: string;
  silenceRetryDate: string;
  silenceRetryDoctor: string;
  silenceRetryGeneric: string;
  recoverySpecialization: string;
  recoveryTimeWithSlots: string;
  recoveryTimeGeneric: string;
  recoveryDateWithMemory: string;
  recoveryDateGeneric: string;
  recoveryDoctorWithMemory: string;
  recoveryPatientName: string;
  recoveryMobile: string;
  recoveryConfirmation: string;
  availabilityExactSlotAvailable: string;
  availabilitySlotAvailable: string;
  availabilityTimeFull: string;
  availabilityAlternativeSameBucket: string;
  availabilityAlternativeDifferentBucket: string;
  availabilityDayUnavailableWithNext: string;
  availabilityDayUnavailableNoNext: string;
  availabilitySlotsFullWithNext: string;
  availabilitySlotsFullNoNext: string;
  availabilityBookingDisabled: string;
  rescheduleNoActiveBooking: string;
  rescheduleFoundBooking: string;
  rescheduleAskNewDay: string;
  rescheduleMissingBooking: string;
  rescheduleBookingDisabled: string;
  rescheduleSlotsAvailable: string;
  rescheduleAskSlot: string;
  rescheduleConfirm: string;
  rescheduleFinal: string;
  rescheduleDeclined: string;
  rescheduleAlreadyComplete: string;
  cancelNoActiveBooking: string;
  cancelConfirm: string;
  cancelDeclined: string;
  cancelMissingBooking: string;
  cancelFinal: string;
  extraInstructions: string;
};

type RuntimeDoctor = {
  doctorId: string;
  name: string;
  specialization: string;
  fee: number;
  scheduleLabel?: string;
  availability?: AvailabilityRuntimeDoctor["availability"];
  botSettings?: {
    greetingMessage?: string;
    afterHoursMessage?: string;
    fallbackResponse?: string;
    language?: string;
    supportedIntents?: string[];
    transferNumber?: string;
    bookingEnabled?: boolean;
    fallbackPolicy?: "ask_again" | "transfer" | "end_call" | "create_callback";
    emergencyMessage?: string;
    conversationPrompts?: Partial<ConversationPrompts> | null;
    llmProviders?: LLMConfig | null;
    sttProviders?: unknown;
    ttsProviders?: unknown;
    intelligenceSettings?: IntelligenceSettings | null;
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
  usageEvents?: UsageEventInput[];
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

const DEFAULT_PROMPTS: ConversationPrompts = {
  askSpecialization:
    "Kis doctor ya kis problem ke liye appointment chahiye?",
  askDoctorPreference:
    "Kisi specific doctor se milna hai, ya earliest available doctor chalega?",
  askDate: "Kis din ka appointment chahiye?",
  askTime: "Morning, afternoon, ya evening mein kaunsa time chalega?",
  askPatientName: "Theek hai, kis naam se booking karoon?",
  askMobile: "Mobile number bata dijiye.",
  askPatientType: "Pehli baar aa rahe hain ya follow-up?",
  confirmPrefix: "Theek hai, main ek baar confirm kar doon.",
  bookingConfirmed: "Ho gaya. Booking dashboard par update kar di gayi hai.",
  bookingCancelled:
    "Theek hai, booking cancel kar di gayi hai. Nayi appointment chahiye ho to bata dijiye.",
  bookingAlreadyComplete: "Aapki appointment already confirm hai. Thank you.",
  bookingAlreadyCancelled: "Yeh booking cancel ho chuki hai. Nayi appointment ke liye bata dijiye.",
  transferMessage: "Main aapko reception se connect kar rahi hoon.",
  goodbyeMessage: "Dhanyavaad. Namaste.",
  confirmRememberedDoctor: "{{doctor}} ke liye hi booking karni hai na?",
  confirmRememberedDay: "{{day}} ke liye hi dekhna hai?",
  callerNumberConfirmation: "Booking ke liye yahi current number use kar loon? {{maskedNumber}}.",
  callerReuseConfirmation: "Pichli baar wali contact details use kar loon? {{maskedNumber}}.",
  silenceRetryWithSlots: "Aap {{slotChoices}} mein se choose kar sakte hain. Main wait kar rahi hoon.",
  silenceRetryDate: "{{day}} hi rakhna hai ya koi aur din? Main wait kar rahi hoon.",
  silenceRetryDoctor: "{{doctor}} ke liye hi booking karni hai na?",
  silenceRetryGeneric: "{{stagePrompt}} Main wait kar rahi hoon.",
  recoverySpecialization: "Doctor ya department clear nahi aaya. {{specializations}} mein se bata dijiye.",
  recoveryTimeWithSlots: "Time confirm karna tha. {{slotChoices}} mein se kaunsa rakh doon?",
  recoveryTimeGeneric: "Time confirm karna tha. Morning chahte hain ya afternoon?",
  recoveryDateWithMemory: "{{day}} hi rakhna hai, ya koi aur din?",
  recoveryDateGeneric: "Din confirm karna tha. Kis din ka appointment chahiye?",
  recoveryDoctorWithMemory: "{{doctor}} ke liye hi booking karni hai na?",
  recoveryPatientName: "Naam clear nahi aaya. Kis naam se booking karoon?",
  recoveryMobile: "Mobile number clear nahi aaya. Ek baar number bata dijiye.",
  recoveryConfirmation: "Confirm karna tha. Details sahi hain?",
  availabilityExactSlotAvailable: "{{time}} ka slot available hai.",
  availabilitySlotAvailable: "{{day}} {{timeContext}}{{slot}} ka slot available hai.",
  availabilityTimeFull: "{{requestedTime}} available nahi hai. {{alternativeFrame}}. Kaunsa rakh doon?",
  availabilityAlternativeSameBucket: "{{slot1}} aur {{slot2}} available hain",
  availabilityAlternativeDifferentBucket: "{{slot1}} {{bucket1}} mein hai aur {{slot2}} thoda baad mein hoga",
  availabilityDayUnavailableWithNext: "{{day}} ko doctor available nahi hain. {{nextDay}} mein {{slotPreview}} mil sakta hai. {{nextDay}} dekh loon?",
  availabilityDayUnavailableNoNext: "{{day}} ko doctor available nahi hain. Kisi aur doctor ka slot dekh loon?",
  availabilitySlotsFullWithNext: "{{day}} ke slots full hain. {{nextDay}} mein {{slotPreview}} mil sakta hai. Wahi dekh loon?",
  availabilitySlotsFullNoNext: "{{day}} ke slots full hain. Kisi aur doctor ka slot dekh loon?",
  availabilityBookingDisabled: "{{doctor}} ke liye booking abhi reception se confirm hogi. Main connect kar sakti hoon.",
  rescheduleNoActiveBooking: "Is number par koi active appointment nahi mili. Nayi appointment book karni ho to bata dijiye.",
  rescheduleFoundBooking: "Aapki booking {{appointment}} ke liye hai. Kis din reschedule karna hai?",
  rescheduleAskNewDay: "Kis din reschedule karna hai? Monday se Sunday mein se din bata dijiye.",
  rescheduleMissingBooking: "Active booking ki doctor details clear nahi mili. Reception se confirm karna padega.",
  rescheduleBookingDisabled: "{{doctor}} ke liye reschedule abhi reception se confirm hoga. Main reception se connect kar sakti hoon.",
  rescheduleSlotsAvailable: "{{availabilityReply}} {{slotChoices}} mein se kaunsa slot rakh doon?",
  rescheduleAskSlot: "{{slotChoices}} mein se kaunsa slot rakh doon?",
  rescheduleConfirm: "{{day}} {{slot}} par Dr. {{doctor}} ke saath reschedule kar doon?",
  rescheduleFinal: "Ho gaya. Aapki appointment {{day}} {{slot}} par Dr. {{doctor}} ke saath reschedule kar di gayi hai. Reference last 4: {{reference}}.",
  rescheduleDeclined: "Theek hai, reschedule abhi cancel kar diya. Nayi appointment ya koi aur madad chahiye ho to bata dijiye.",
  rescheduleAlreadyComplete: "Aapki appointment already reschedule ho chuki hai. Thank you.",
  cancelNoActiveBooking: "Is number par koi active appointment nahi mili. Nayi appointment book karni ho to bata dijiye.",
  cancelConfirm: "Aapki booking {{appointment}} ke liye hai. Kya main ise cancel kar doon?",
  cancelDeclined: "Theek hai, appointment cancel nahi ki gayi. Koi aur madad chahiye ho to bata dijiye.",
  cancelMissingBooking: "Active booking nahi mili. Koi aur madad chahiye ho to bata dijiye.",
  cancelFinal: "Theek hai, {{appointment}} wali appointment cancel kar di gayi hai. Reference last 4: {{reference}}.",
  extraInstructions: ""
} as const;

const FALLBACK_MESSAGES = {
  greeting:
    "Namaste, hospital appointment desk mein aapka swagat hai. Main aapki appointment booking mein madad kar sakti hoon. Please tell me the doctor name or specialization.",
  fallback:
    "Maaf kijiye, demo mode mein main filhaal selected appointment booking inputs hi samajh pa rahi hoon. Please continue with the appointment booking details.",
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
    contactNumber: null,
    bookingContactConfirmed: false,
    bookingContactConfirmationPending: false,
    availabilityCheckKey: null,
    availabilityOfferedDate: null,
    availabilityOfferedTime: null,
    availabilityOfferedSlots: [],
    conversationMemory: {
      lastDoctor: null,
      lastDay: null,
      lastSuggestedSlots: [],
      silenceRetries: 0,
      callerSeenBefore: false
    },
    bookingResult: null,
    latestIntent: null,
    fallbackAttempts: 0,
    transcriptHistory: [],
    analysisHistory: [],
    analysisSummary: null,
    botResponseHistory: [],
    usageLedger: [],
    createdAt,
    updatedAt: createdAt
  };
}

function normalizeTranscript(transcript: string): string {
  return transcript
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/।/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveIntelligenceSettings(clinicSettings: ClinicSettings | null | undefined): Required<IntelligenceSettings> {
  return {
    enabled: clinicSettings?.intelligenceSettings?.enabled ?? true,
    askOnlyMissingFields: clinicSettings?.intelligenceSettings?.askOnlyMissingFields ?? true,
    callerNumberConfirmation: clinicSettings?.intelligenceSettings?.callerNumberConfirmation ?? true,
    languageNormalization: clinicSettings?.intelligenceSettings?.languageNormalization ?? true,
    smartClarification: clinicSettings?.intelligenceSettings?.smartClarification ?? true,
    availabilityFirst: clinicSettings?.intelligenceSettings?.availabilityFirst ?? true,
    confidenceThreshold: clinicSettings?.intelligenceSettings?.confidenceThreshold ?? 0.7
  };
}

function resolveConversationPrompts(
  clinicSettings: ClinicSettings | null | undefined,
  runtimeDoctors: RuntimeDoctor[],
  session: DemoSessionRecord
): ConversationPrompts {
  const selectedDoctor = runtimeDoctors.find((doctor) => doctor.name === session.selectedDoctor || doctor.doctorId === session.selectedDoctor);
  const selectedBySpecialization =
    selectedDoctor
    ?? runtimeDoctors.find((doctor) => doctor.specialization === session.selectedSpecialization)
    ?? runtimeDoctors[0]
    ?? null;

  const prompts = {
    ...DEFAULT_PROMPTS,
    ...(clinicSettings?.conversationPrompts ?? {}),
    ...(selectedBySpecialization?.botSettings?.conversationPrompts ?? {})
  };

  if (prompts.availabilityTimeFull === "{{requestedTime}} slot booked hai. {{alternativeFrame}}. Kaunsa rakh doon?") {
    prompts.availabilityTimeFull = DEFAULT_PROMPTS.availabilityTimeFull;
  }

  return prompts;
}

function renderPrompt(template: string, values: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => String(values[key] ?? "")).replace(/\s+/g, " ").trim();
}

function withExtraInstructions(message: string, prompts: ConversationPrompts): string {
  const extraInstructions = prompts.extraInstructions.trim();
  return extraInstructions ? `${message} ${extraInstructions}` : message;
}

function canUseConfiguredLlmReply(action: string): boolean {
  return new Set([
    "demo_fallback",
    "greet_and_prompt",
    "reset_to_greeting",
    "emergency_escalation",
    "transfer_call",
    "booking_already_complete",
    "booking_cancelled"
  ]).has(action);
}

function isFallbackAction(action: string): boolean {
  return action === "greet_and_prompt" || action === "reset_to_greeting" || action.startsWith("reprompt_");
}

function buildConfiguredSystemPrompt(
  session: DemoSessionRecord,
  prompts: ConversationPrompts,
  runtimeDoctors: RuntimeDoctor[],
  baseReply: string
): string {
  const doctorList = runtimeDoctors.map((doctor) => `${doctor.name} (${doctor.specialization})`).join(", ");

  return [
    "You are the configured hospital appointment assistant.",
    "Reply with one concise spoken response only. Do not include JSON, labels, or analysis.",
    "Do not invent booking details. Keep the existing booking stage and facts unchanged.",
    `Current booking stage: ${session.bookingStage}.`,
    `Selected doctor: ${session.selectedDoctor ?? "not selected"}.`,
    `Selected specialization: ${session.selectedSpecialization ?? "not selected"}.`,
    `Preferred date: ${session.preferredDate ?? "not selected"}.`,
    `Preferred time: ${session.preferredTime ?? "not selected"}.`,
    `Patient name: ${session.patientName ?? "not collected"}.`,
    `Contact number: ${session.contactNumber ?? "not collected"}.`,
    `Available doctors: ${doctorList || "none configured"}.`,
    `Configured prompt instructions: ${prompts.extraInstructions || "none"}.`,
    `Use this configured pipeline response as the source of truth: ${baseReply}`
  ].join("\n");
}

async function applyConfiguredLlmReply(
  transcript: string,
  session: DemoSessionRecord,
  clinicSettings: ClinicSettings | null | undefined,
  prompts: ConversationPrompts,
  runtimeDoctors: RuntimeDoctor[],
  reply: string
): Promise<string> {
  const llmConfig = clinicSettings?.llmProviders;

  if (!llmConfig || !llmConfig.primaryProvider || llmConfig.primaryProvider === "mock") {
    return reply;
  }

  return llmFactory.generateReply(
    transcript,
    session,
    llmConfig,
    buildConfiguredSystemPrompt(session, prompts, runtimeDoctors, reply),
    async () => reply
  );
}

function matchIntentStart(normalizedTranscript: string): boolean {
  return [
    "hello",
    "hi",
    "namaste",
    "mujhe appointment chahiye",
    "mujhe appointment book karni hai",
    "mujhe appointment book karni hai",
    "doctor appointment chahiye",
    "appointment book karna hai",
    "appointment",
    "मुझे अपॉइंटमेंट चाहिए",
    "मुझे अपॉइंटमेंट बुक करनी है",
    "अपॉइंटमेंट बुक करना है",
    "अपॉइंटमेंट"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function matchRescheduleIntent(normalizedTranscript: string): boolean {
  return [
    "reschedule",
    "re schedule",
    "change appointment",
    "appointment change",
    "slot change",
    "change slot",
    "doosra slot",
    "dusra slot",
    "appointment shift",
    "shift appointment",
    "postpone appointment",
    "move appointment",
    "रीशेड्यूल",
    "री शेड्यूल",
    "अपॉइंटमेंट बदल",
    "अपॉइंटमेंट चेंज",
    "स्लॉट बदल",
    "दूसरा स्लॉट"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function matchCancelAppointmentIntent(normalizedTranscript: string): boolean {
  return [
    "cancel appointment",
    "cancel booking",
    "appointment cancel",
    "booking cancel",
    "cancellation",
    "cancel my appointment",
    "कैंसल",
    "कैंसिल",
    "रद्द",
    "अपॉइंटमेंट कैंसल",
    "बुकिंग कैंसल"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

const SPECIALIZATION_ALIASES: Record<string, string[]> = {
  "General Medicine": [
    "general",
    "general medicine",
    "general physician",
    "physician",
    "general doctor",
    "family doctor",
    "medicine",
    "मेडिसिन",
    "जनरल",
    "जनरल मेडिसिन",
    "जनरल फिजिशियन",
    "फिजिशियन"
  ],
  Cardiology: [
    "cardiology",
    "cardiologist",
    "heart specialist",
    "cardio",
    "कार्डियोलॉजी",
    "कार्डियोलॉजिस्ट",
    "हार्ट स्पेशलिस्ट"
  ],
  Dermatology: [
    "dermatology",
    "dermatologist",
    "skin specialist",
    "skin",
    "डर्मेटोलॉजी",
    "डर्मेटोलॉजिस्ट",
    "स्किन स्पेशलिस्ट",
    "स्किन",
    "त्वचा",
    "मुड्ड पीब्रोलॉजी"
  ]
};

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

  for (const [specialization, aliases] of Object.entries(SPECIALIZATION_ALIASES)) {
    if (aliases.some((alias) => normalizedTranscript.includes(alias.toLowerCase()))) {
      const matchedDoctors = directory.doctors.filter((doctor) => doctor.specialization === specialization).map((doctor) => doctor.name);
      return {
        specialization,
        doctors: matchedDoctors.length > 0 ? matchedDoctors : [directory.doctors[0]?.name ?? "Dr. Ananya Sharma"]
      };
    }
  }

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
  const exactDoctor = doctorList.find((doctor) => buildDoctorAliases(doctor).some((alias) => normalizedTranscript.includes(alias)));

  if (exactDoctor) {
    return {
      doctorPreference: "specific_doctor",
      selectedDoctor: exactDoctor.name,
      doctorId: exactDoctor.doctorId
    };
  }

  if (isEarliestAvailableDoctorRequest(normalizedTranscript)) {
    const bySpecialization = doctorList.find((doctor) => doctor.specialization === session.selectedSpecialization) ?? doctorList[0];

    return {
      doctorPreference: "earliest_available",
      selectedDoctor: bySpecialization?.name ?? "Dr. Ananya Sharma",
      doctorId: bySpecialization?.doctorId ?? null
    };
  }

  return null;
}

function isEarliestAvailableDoctorRequest(normalizedTranscript: string): boolean {
  return [
    "koi bhi doctor chalega",
    "koi bhi chalega",
    "earliest available doctor",
    "earliest available",
    "earliest",
    "available doctor",
    "अर्लिएस्ट अवेलेबल",
    "अर्लिएस्ट अवेलेबल डॉक्टर",
    "अवेलेबल डॉक्टर",
    "कोई भी डॉक्टर",
    "कोई भी चलेगा",
    "जल्दी वाला डॉक्टर",
    "पहला available",
    "पहला अवेलेबल"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function buildDoctorAliases(doctor: RuntimeDoctor): string[] {
  const rawName = doctor.name.toLowerCase();
  const noTitle = rawName.replace(/^dr\.?\s+/, "").trim();
  const nameParts = noTitle.split(/\s+/).filter(Boolean);
  const aliases = new Set<string>([rawName, noTitle, `dr ${noTitle}`, ...nameParts]);

  if (doctor.doctorId === "doctor-1") {
    aliases.add("ananya sharma");
    aliases.add("ananya");
    aliases.add("doctor ananya");
    aliases.add("अनन्या शर्मा");
    aliases.add("अनन्या");
    aliases.add("अनन्या सर");
    aliases.add("अनया शर्मा");
    aliases.add("अनया");
    aliases.add("डॉक्टर अनन्या");
    aliases.add("डॉक्टर अनया");
  }

  if (doctor.doctorId === "doctor-2") {
    aliases.add("rohan patel");
    aliases.add("rohan");
    aliases.add("doctor rohan");
    aliases.add("रोहन पटेल");
    aliases.add("रोहन");
    aliases.add("डॉक्टर रोहन");
  }

  if (doctor.doctorId === "doctor-3") {
    aliases.add("meera shah");
    aliases.add("meera");
    aliases.add("doctor meera");
    aliases.add("मीरा शाह");
    aliases.add("मीरा");
    aliases.add("डॉक्टर मीरा");
  }

  return Array.from(aliases);
}

function mapDate(normalizedTranscript: string): string | null {
  const phrases = ["aaj", "kal", "tomorrow", "monday", "next available", "earliest slot", "आज", "कल"];
  const matched = phrases.find((phrase) => normalizedTranscript.includes(phrase));
  return matched ?? null;
}

function mapTime(normalizedTranscript: string): string | null {
  const phrases = ["morning", "afternoon", "evening", "10 baje", "11 baje", "4 pm", "5 pm", "koi bhi time chalega", "सुबह", "शाम", "दोपहर"];
  const matched = phrases.find((phrase) => normalizedTranscript.includes(phrase));
  return matched ?? null;
}

function extractPatientName(transcript: string): string | null {
  const cleanedCandidate = cleanPatientName(transcript);

  if (cleanedCandidate) {
    return cleanedCandidate;
  }

  const patterns = [
    /mera naam\s+([\p{L}\p{M} ]+?)\s+hai/iu,
    /mera naam\s+([\p{L}\p{M} ]+)/iu,
    /my name is\s+([\p{L}\p{M} ]+)/iu,
    /patient name\s+([\p{L}\p{M} ]+)/iu,
    /मेरा नाम\s+([\p{L}\p{M} ]+?)\s+है/iu,
    /मेरा नाम\s+([\p{L}\p{M} ]+)/iu
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const cleaned = transcript
    .replace(/[.,!?;:।]/g, " ")
    .replace(/\b(mera|naam|hai|my|name|is|patient)\b/giu, " ")
    .replace(/\b(मेरा|नाम|है)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || /\d/.test(cleaned)) {
    return null;
  }

  const words = cleaned.split(" ").filter(Boolean);

  if (words.length >= 1 && words.length <= 3) {
    return cleaned;
  }

  return null;
}

function cleanPatientName(transcript: string): string | null {
  const normalized = String(transcript || "")
    .replace(/[.,!?;:।]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || /\d/.test(normalized)) {
    return null;
  }

  const hasNameCue = /\b(mera|name|naam|patient)\b/i.test(normalized) || /(मेरा|नाम)/u.test(normalized);
  const candidate = normalized
    .replace(/\b(ji|jee|haan|ha|mera|naam|name|my|is|hai|patient)\b/giu, " ")
    .replace(/\b(बताइए|बताये|बताएं)\b/gu, " ")
    .replace(/\b(जी|हाँ|हां|मेरा|नाम|है|मैं|मे|में)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!candidate) {
    return null;
  }

  const words = candidate.split(" ").filter(Boolean);
  const looksLikeNameOnly = words.length <= 3 && !/(appointment|doctor|mobile|number|slot|बुक|डॉक्टर|अपॉइंटमेंट|मोबाइल|नंबर|स्लॉट)/iu.test(candidate);

  if ((hasNameCue || words.length === 1) && looksLikeNameOnly) {
    return candidate;
  }

  return null;
}

function extractMobile(transcript: string): string | null {
  const digits = normalizeSpokenDigits(transcript)
    .replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)))
    .replace(/\D/g, "");

  if (digits.length === 10) {
    return digits;
  }

  if (digits.length === 11 && /^[6-9]/.test(digits)) {
    return digits.slice(0, 10);
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }

  return digits.length > 12 ? digits.slice(-10) : null;
}

function scorePrefixMatch(candidate: string, reference: string): number {
  if (!candidate || !reference) {
    return 0;
  }

  const length = Math.min(candidate.length, reference.length);

  if (!length) {
    return 0;
  }

  let matches = 0;

  for (let index = 0; index < length; index += 1) {
    if (candidate[index] === reference[index]) {
      matches += 1;
    }
  }

  return matches / length;
}

function resolveMobile(transcript: string, callerNumber?: string | null, existingContactNumber?: string | null): string | null {
  const fallbackCandidates = [callerNumber, existingContactNumber]
    .map((value) => (value ?? "").replace(/\D/g, ""))
    .filter((value, index, values) => value.length >= 10 && values.indexOf(value) === index);

  const exactMobile = extractMobile(transcript);

  if (exactMobile) {
    return exactMobile;
  }

  const spokenDigits = normalizeSpokenDigits(transcript)
    .replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)))
    .replace(/\D/g, "");

  if (spokenDigits.length < 8) {
    return null;
  }

  for (const fallback of fallbackCandidates) {
    const prefix = fallback.slice(0, spokenDigits.length);

    if (prefix === spokenDigits) {
      return fallback.slice(-10);
    }

    if (spokenDigits.length >= 8 && scorePrefixMatch(spokenDigits, prefix) >= 0.875) {
      return fallback.slice(-10);
    }
  }

  return spokenDigits.length === 10 ? spokenDigits : null;
}

function normalizeSpokenDigits(transcript: string): string {
  const digitWords: Record<string, string> = {
    zero: "0",
    oh: "0",
    o: "0",
    shunya: "0",
    शून्य: "0",
    जीरो: "0",
    ज़ीरो: "0",
    one: "1",
    won: "1",
    van: "1",
    ek: "1",
    एक: "1",
    वन: "1",
    two: "2",
    to: "2",
    too: "2",
    do: "2",
    दो: "2",
    टू: "2",
    three: "3",
    tree: "3",
    teen: "3",
    तीन: "3",
    थ्री: "3",
    four: "4",
    for: "4",
    char: "4",
    chaar: "4",
    चार: "4",
    फोर: "4",
    five: "5",
    faiv: "5",
    panch: "5",
    paanch: "5",
    पांच: "5",
    पाँच: "5",
    फाइव: "5",
    six: "6",
    chhe: "6",
    che: "6",
    छह: "6",
    छे: "6",
    सिक्स: "6",
    seven: "7",
    saat: "7",
    sat: "7",
    सात: "7",
    सेवन: "7",
    eight: "8",
    aath: "8",
    ath: "8",
    आठ: "8",
    एट: "8",
    nine: "9",
    nain: "9",
    nau: "9",
    no: "9",
    नौ: "9",
    नाइन: "9"
  };

  return String(transcript || "")
    .toLowerCase()
    .replace(/[.,!?;:।]/g, " ")
    .split(/\s+/)
    .map((part) => digitWords[part] ?? part)
    .join(" ");
}

function mapPatientType(normalizedTranscript: string): string | null {
  if (
    normalizedTranscript.includes("नया मरीज")
    || normalizedTranscript.includes("न्यू पेशेंट")
    || normalizedTranscript.includes("न्यू पेशेंट है")
    || normalizedTranscript.includes("gnu patient")
    || normalizedTranscript.includes("gnu")
    || normalizedTranscript.includes("nyu patient")
    || normalizedTranscript.includes("new base")
    || normalizedTranscript.includes("new pes")
    || normalizedTranscript.includes("न्यू पेशेंट")
    || normalizedTranscript.includes("न्यू पेश")
    || normalizedTranscript.includes("new पेश")
    || normalizedTranscript.includes("न्यू पेश")
  ) {
    return "new patient";
  }
  if (normalizedTranscript.includes("new patient") || normalizedTranscript.includes("नया मरीज")) {
    return "new patient";
  }

  if (normalizedTranscript.includes("follow-up") || normalizedTranscript.includes("फॉलो अप")) {
    return "follow-up";
  }

  return null;
}

function mapConfirmation(normalizedTranscript: string): "confirm" | "change_doctor" | "change_time" | "cancel" | null {
  if (["yes", "confirm", "correct", "haan", "ha", "हाँ", "सही है"].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "confirm";
  }

  if (normalizedTranscript.includes("change doctor") || normalizedTranscript.includes("doctor change")) {
    return "change_doctor";
  }

  if (normalizedTranscript.includes("change time") || normalizedTranscript.includes("time change")) {
    return "change_time";
  }

  if (normalizedTranscript.includes("cancel booking") || normalizedTranscript.includes("बुकिंग कैंसल")) {
    return "cancel";
  }

  if (["kar do", "kar dijiye", "confirm kar", "कर दो", "कर दीजिए", "कर दीजिये"].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "confirm";
  }

  return null;
}

function mapTimeFlexible(normalizedTranscript: string): string | null {
  const normalized = normalizedTranscript.toLowerCase();
  const exactTime = extractExactTimeLabel(normalized);

  if (exactTime) {
    return exactTime;
  }

  const mapped = mapTime(normalized);

  if (mapped) {
    if (mapped.includes("morning") || mapped.includes("सुबह") || mapped.includes("subah")) {
      return "morning";
    }

    if (mapped.includes("afternoon") || mapped.includes("दोपहर")) {
      return "afternoon";
    }

    if (mapped.includes("evening") || mapped.includes("शाम")) {
      return "evening";
    }

    return mapped;
  }

  if ([
    "morning",
    "early morning",
    "subah",
    "सुबह",
    "morning slot",
    "मॉर्निंग"
  ].some((phrase) => normalized.includes(phrase))) {
    return "morning";
  }

  if ([
    "afternoon",
    "after noon",
    "dopahar",
    "दोपहर",
    "afternoon slot",
    "आफ्टरनून",
    "12 baje",
    "1 baje",
    "2 baje",
    "3 baje"
  ].some((phrase) => normalized.includes(phrase))) {
    return "afternoon";
  }

  if ([
    "evening",
    "shaam",
    "शाम",
    "शाम को",
    "evening slot",
    "ईवनिंग",
    "4 pm",
    "5 pm",
    "6 pm"
  ].some((phrase) => normalized.includes(phrase))) {
    return "evening";
  }

  if (normalized.includes("koi bhi time chalega") || normalized.includes("कोई भी टाइम चलेगा")) {
    return "morning";
  }

  return null;
}

const CALENDAR_MONTHS: Array<{ month: number; names: string[] }> = [
  { month: 0, names: ["january", "jan"] },
  { month: 1, names: ["february", "feb"] },
  { month: 2, names: ["march", "mar"] },
  { month: 3, names: ["april", "apr"] },
  { month: 4, names: ["may"] },
  { month: 5, names: ["june", "jun"] },
  { month: 6, names: ["july", "jul"] },
  { month: 7, names: ["august", "aug"] },
  { month: 8, names: ["september", "sept", "sep"] },
  { month: 9, names: ["october", "oct"] },
  { month: 10, names: ["november", "nov"] },
  { month: 11, names: ["december", "dec"] }
];

function normalizeCalendarText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)))
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/['’]/g, " ")
    .replace(/[,\u0964]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCalendarDate(date: Date): string {
  const weekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][date.getDay()];
  const month = CALENDAR_MONTHS[date.getMonth()].names[0];
  return `${weekday} ${date.getDate()} ${month} ${date.getFullYear()}`;
}

function validCalendarDate(day: number, month: number, year: number): Date | null {
  const parsed = new Date(year, month, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month || parsed.getDate() !== day) {
    return null;
  }
  return parsed;
}

function inferYearForMonthDay(day: number, month: number, now = new Date()): number {
  const currentYear = now.getFullYear();
  const currentYearDate = validCalendarDate(day, month, currentYear);
  if (currentYearDate && currentYearDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    return currentYear;
  }
  return currentYear + 1;
}

function parseCalendarDateExpression(transcript: string): string | null {
  const normalized = normalizeCalendarText(transcript);
  const monthMatch = CALENDAR_MONTHS
    .flatMap((entry) => entry.names.map((name) => ({ month: entry.month, name })))
    .find((entry) => new RegExp(`\\b${entry.name}\\b`, "i").test(normalized));

  if (monthMatch) {
    const afterDay = normalized.match(new RegExp(`\\b${monthMatch.name}\\s+(\\d{1,2})(?:\\s+(\\d{4}))?\\b`, "i"));
    const beforeDay = normalized.match(new RegExp(`\\b(\\d{1,2})\\s+${monthMatch.name}(?:\\s+(\\d{4}))?\\b`, "i"));
    const match = beforeDay ?? afterDay;

    if (match?.[1]) {
      const day = Number(match[1]);
      const year = match[2] ? Number(match[2]) : inferYearForMonthDay(day, monthMatch.month);
      const parsed = validCalendarDate(day, monthMatch.month, year);
      if (parsed) return formatCalendarDate(parsed);
    }
  }

  const numericDate = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numericDate) {
    const day = Number(numericDate[1]);
    const month = Number(numericDate[2]) - 1;
    const yearValue = numericDate[3] ? Number(numericDate[3]) : inferYearForMonthDay(day, month);
    const year = yearValue < 100 ? 2000 + yearValue : yearValue;
    const parsed = validCalendarDate(day, month, year);
    if (parsed) return formatCalendarDate(parsed);
  }

  const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekday = weekdayNames.find((day) => new RegExp(`\\b${day}\\b`, "i").test(normalized));
  if (!weekday) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let daysAhead = (weekdayNames.indexOf(weekday) - today.getDay() + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;
  if (/\bnext\s+(week|weeks|hafte|hapte)\b/.test(normalized)) {
    daysAhead += 7;
  }

  const parsed = new Date(today);
  parsed.setDate(today.getDate() + daysAhead);
  return formatCalendarDate(parsed);
}

function isNextDateRequest(normalizedTranscript: string): boolean {
  return /\bnext\b/.test(normalizedTranscript)
    || normalizedTranscript.includes("नेक्स्ट")
    || normalizedTranscript.includes("अगले")
    || normalizedTranscript.includes("agle")
    || normalizedTranscript.includes("agla");
}

function calendarDateForWeekday(weekday: string, normalizedTranscript: string): string {
  const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let daysAhead = (weekdayNames.indexOf(weekday) - today.getDay() + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;
  if (/\bnext\s+(week|weeks|hafte|hapte)\b/.test(normalizedTranscript)) {
    daysAhead += 7;
  }

  const parsed = new Date(today);
  parsed.setDate(today.getDate() + daysAhead);
  return formatCalendarDate(parsed);
}

function mapDateFlexible(normalizedTranscript: string): string | null {
  const normalized = normalizedTranscript.toLowerCase();
  const calendarDate = parseCalendarDateExpression(normalized);

  if (calendarDate) {
    return calendarDate;
  }

  const dayAliases: Array<{ day: string; aliases: string[] }> = [
    {
      day: "monday",
      aliases: ["monday", "mon day", "manday", "munde", "monday ko", "mand ko", "mand", "somvar", "somwaar", "सोमवार", "मंडे", "मन्डे", "मांडे", "मंड को", "मंड"]
    },
    {
      day: "tuesday",
      aliases: ["tuesday", "tues day", "tusday", "tyusday", "mangalvar", "mangalwaar", "मंगलवार", "ट्यूजडे", "ट्यूसडे"]
    },
    {
      day: "wednesday",
      aliases: [
        "wednesday",
        "wednes day",
        "wednessday",
        "wedensday",
        "wednsday",
        "wensday",
        "wenzday",
        "venusday",
        "vensday",
        "venasday",
        "wed",
        "budhvar",
        "budhwar",
        "बुधवार",
        "बुधवार को",
        "वेडनेसडे",
        "वेडन्सडे",
        "वेडनसडे",
        "वेनसडे",
        "वेंसडे",
        "वेन्सडे",
        "भूतवाद"
      ]
    },
    {
      day: "thursday",
      aliases: ["thursday", "thurs day", "thusday", "guruwar", "guruvar", "गुरुवार", "बृहस्पतिवार", "थर्सडे"]
    },
    {
      day: "friday",
      aliases: ["friday", "fri day", "fraiday", "shukrawar", "shukrvar", "शुक्रवार", "फ्राइडे", "फ्रायडे"]
    },
    {
      day: "saturday",
      aliases: ["saturday", "satur day", "satday", "shanivar", "shaniwar", "शनिवार", "सैटरडे", "सैटर्डे"]
    },
    {
      day: "sunday",
      aliases: ["sunday", "sun day", "ravivar", "raviwar", "रविवार", "संडे", "सन्डे"]
    }
  ];

  for (const entry of dayAliases) {
    if (entry.aliases.some((phrase) => normalized.includes(phrase))) {
      return isNextDateRequest(normalized) ? calendarDateForWeekday(entry.day, normalized) : entry.day;
    }
  }

  const mapped = mapDate(normalized);

  if (mapped) {
    return mapped;
  }

  return null;
}

function mapConfirmationFlexible(normalizedTranscript: string): "confirm" | "change_doctor" | "change_time" | "cancel" | null {
  const mapped = mapConfirmation(normalizedTranscript);

  if (mapped) {
    return mapped;
  }

  if (["haan", "ha", "han", "yes", "ok", "okay", "हाँ", "हां", "सही है"].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "confirm";
  }

  return null;
}

function wantsEarliestSlot(normalizedTranscript: string): boolean {
  return [
    "earliest",
    "earlyest",
    "early ist",
    "first slot",
    "pehla slot",
    "sabse pehle",
    "available jo hai",
    "jo earliest",
    "jo early",
    "jo available"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function mapYesNo(normalizedTranscript: string): "yes" | "no" | null {
  if (["no", "nahi", "nahin", "नहीं", "नही", "ना", "मत", "alternate", "different", "दूसरा", "अलग"].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "no";
  }

  if ([
    "yes",
    "haan",
    "han",
    "ha",
    "ok",
    "okay",
    "correct",
    "use",
    "use kar",
    "use karte",
    "kar sakti",
    "kar sakte",
    "current number",
    "हाँ",
    "हां",
    "जी हाँ",
    "जी हां",
    "सही",
    "यूज़",
    "यूस",
    "इस्तेमाल",
    "करते हैं",
    "कर सकती",
    "कर सकते"
  ].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "yes";
  }

  return null;
}

function buildConfirmationSummary(session: DemoSessionRecord, prompts: ConversationPrompts): string {
  const doctorName = stripDoctorTitle(session.selectedDoctor ?? "assigned doctor");
  return `${prompts.confirmPrefix} ${session.preferredDate ?? "selected date"} ${session.preferredTime ?? "selected time"} par Dr. ${doctorName} ke saath booking hai, naam ${session.patientName ?? "patient"}, aur contact number ${session.contactNumber ?? "not provided"} rahega. Sahi hai?`;
}

function buildFinalSummary(session: DemoSessionRecord, appointmentId: string | null, prompts: ConversationPrompts): string {
  const doctorName = stripDoctorTitle(session.selectedDoctor ?? "assigned doctor");
  const shortReference = appointmentId ? appointmentId.slice(-4).toUpperCase() : "pending";
  return `${prompts.bookingConfirmed} ${session.preferredDate ?? "selected date"} ${session.preferredTime ?? "selected time"} par Dr. ${doctorName} ke saath appointment booked hai. Reference last 4: ${shortReference}.`;
}

function stripDoctorTitle(name: string): string {
  return String(name || "assigned doctor").replace(/^dr\.?\s+/i, "").trim();
}

function validAniNumber(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return null;
}

function appointmentIdOf(appointment: SessionAppointmentSnapshot | null | undefined): string | null {
  return appointment?.id ?? appointment?.appointmentId ?? null;
}

function parseSlotMinutes(value: string | null | undefined): number | null {
  const text = String(value ?? "").trim().toLowerCase();
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3];

  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function slotBucket(slot: string): "morning" | "afternoon" | "evening" | null {
  const minutes = parseSlotMinutes(slot);
  if (minutes === null) return null;
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
}

function formatTimeLabel(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function extractExactTimeLabel(normalizedTranscript: string): string | null {
  const text = normalizedTranscript
    .replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)))
    .replace(/\b(a\s*m|ए\s*एम|एएम)\b/giu, "am")
    .replace(/\b(p\s*m|पी\s*एम|पीएम)\b/giu, "pm")
    .replace(/\b(बजे|baje|o clock)\b/giu, " baje ")
    .toLowerCase();
  const speechTimeText = text
    .replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)))
    .replace(/\b(ए\s*एम|एएम|एम)\b/giu, "am")
    .replace(/\b(पी\s*एम|पीएम)\b/giu, "pm");

  const match = speechTimeText.match(/\b(\d{1,2})(?:\s*[:.]\s*(\d{2})|\s+(\d{2})(?=\s*(?:am|pm|baje)))?\s*(am|pm|baje)?\b/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? match[3] ?? "0");
  const marker = match[4];

  if (hours < 1 || hours > 12 || minutes > 59) return null;

  if (marker === "pm" || (!marker && hours >= 12) || (marker === "baje" && hours >= 12) || (marker === "baje" && hours >= 1 && hours <= 5)) {
    if (hours < 12) hours += 12;
  } else if (marker === "am" && hours === 12) {
    hours = 0;
  }

  return formatTimeLabel(hours * 60 + minutes);
}

function normalizePhoneLast10(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

function isActiveAppointment(appointment: SessionAppointmentSnapshot): boolean {
  const status = String(appointment.status ?? "booked").toLowerCase();
  return status === "booked" || status === "rescheduled";
}

function findLatestActiveAppointmentForCaller(
  appointments: AppointmentSnapshot[],
  callerNumber: string | null | undefined
): SessionAppointmentSnapshot | null {
  const caller = normalizePhoneLast10(callerNumber);
  if (!caller) return null;

  return (
    appointments.find((appointment) => normalizePhoneLast10(appointment.phoneNumber) === caller && isActiveAppointment(appointment))
    ?? null
  );
}

function resolveDoctorForAppointment(
  appointment: SessionAppointmentSnapshot | null | undefined,
  runtimeDoctors: RuntimeDoctor[]
): RuntimeDoctor | null {
  if (!appointment) return null;

  return (
    runtimeDoctors.find((doctor) => appointment.doctorId && doctor.doctorId === appointment.doctorId)
    ?? runtimeDoctors.find((doctor) => appointment.doctorName && doctor.name.toLowerCase() === appointment.doctorName.toLowerCase())
    ?? null
  );
}

function appointmentDoctorName(appointment: SessionAppointmentSnapshot | null | undefined, runtimeDoctors: RuntimeDoctor[]): string {
  return resolveDoctorForAppointment(appointment, runtimeDoctors)?.name ?? appointment?.doctorName ?? "assigned doctor";
}

function appointmentSessionFields(
  appointment: SessionAppointmentSnapshot | null | undefined,
  runtimeDoctors: RuntimeDoctor[],
  session: DemoSessionRecord
): Partial<DemoSessionRecord> {
  const doctor = resolveDoctorForAppointment(appointment, runtimeDoctors);
  return {
    selectedDoctor: doctor?.name ?? appointment?.doctorName ?? session.selectedDoctor,
    selectedSpecialization: doctor?.specialization ?? session.selectedSpecialization,
    contactNumber: normalizePhoneLast10(appointment?.phoneNumber) ?? session.contactNumber,
    patientName: appointment?.patientName ?? session.patientName
  };
}

function buildAppointmentSpeech(appointment: SessionAppointmentSnapshot, runtimeDoctors: RuntimeDoctor[]): string {
  const doctorName = stripDoctorTitle(appointmentDoctorName(appointment, runtimeDoctors));
  return `${appointment.appointmentDate ?? "selected slot"} par Dr. ${doctorName}`;
}

function matchOfferedSlot(normalizedTranscript: string, offeredSlots: string[] | undefined): string | null {
  const slots = offeredSlots ?? [];
  if (!slots.length) return null;

  const requested = mapTimeFlexible(normalizedTranscript);
  if (!requested) return null;

  if (["morning", "afternoon", "evening"].includes(requested)) {
    return slots.find((slot) => slotBucket(slot) === requested) ?? slots[0] ?? null;
  }

  const requestedMinutes = parseSlotMinutes(requested);
  if (requestedMinutes === null) return null;

  return slots.find((slot) => parseSlotMinutes(slot) === requestedMinutes) ?? null;
}

function buildRescheduleConfirmation(
  appointment: SessionAppointmentSnapshot | null | undefined,
  session: DemoSessionRecord,
  runtimeDoctors: RuntimeDoctor[],
  prompts: ConversationPrompts
): string {
  const doctorName = stripDoctorTitle(appointmentDoctorName(appointment, runtimeDoctors));
  return renderPrompt(prompts.rescheduleConfirm, {
    day: session.reschedule_new_day ?? "selected day",
    slot: session.reschedule_confirmed_slot?.time ?? "selected slot",
    doctor: doctorName
  });
}

function buildRescheduleFinal(
  appointment: SessionAppointmentSnapshot | null | undefined,
  session: DemoSessionRecord,
  runtimeDoctors: RuntimeDoctor[],
  prompts: ConversationPrompts
): string {
  const doctorName = stripDoctorTitle(appointmentDoctorName(appointment, runtimeDoctors));
  const shortReference = appointmentIdOf(appointment) ? appointmentIdOf(appointment)!.slice(-4).toUpperCase() : "pending";
  return renderPrompt(prompts.rescheduleFinal, {
    day: session.reschedule_new_day ?? "selected day",
    slot: session.reschedule_confirmed_slot?.time ?? "selected slot",
    doctor: doctorName,
    reference: shortReference
  });
}

function buildCancelConfirmation(appointment: SessionAppointmentSnapshot, runtimeDoctors: RuntimeDoctor[], prompts: ConversationPrompts): string {
  return renderPrompt(prompts.cancelConfirm, { appointment: buildAppointmentSpeech(appointment, runtimeDoctors) });
}

function maskMobile(value: string): string {
  return value.length >= 4 ? `Last 4 digits ${value.slice(-4)}` : value;
}

function buildCallerNumberConfirmation(ani: string, prompts: ConversationPrompts): string {
  return renderPrompt(prompts.callerNumberConfirmation, { maskedNumber: maskMobile(ani), number: ani });
}

function buildCallerReuseConfirmation(ani: string, prompts: ConversationPrompts): string {
  return renderPrompt(prompts.callerReuseConfirmation, { maskedNumber: maskMobile(ani), number: ani });
}

function getConversationMemory(session: DemoSessionRecord) {
  return session.conversationMemory ?? {};
}

function rememberConversation(session: DemoSessionRecord, changes: Partial<NonNullable<DemoSessionRecord["conversationMemory"]>> = {}): DemoSessionRecord {
  const current = getConversationMemory(session);
  return updateSession(session, {
    conversationMemory: {
      ...current,
      lastDoctor: changes.lastDoctor ?? session.selectedDoctor ?? current.lastDoctor ?? null,
      lastDay: changes.lastDay ?? session.preferredDate ?? current.lastDay ?? null,
      lastSuggestedSlots: changes.lastSuggestedSlots ?? session.availabilityOfferedSlots ?? current.lastSuggestedSlots ?? [],
      silenceRetries: changes.silenceRetries ?? current.silenceRetries ?? 0,
      callerSeenBefore: changes.callerSeenBefore ?? current.callerSeenBefore ?? false
    }
  });
}

function resetSilenceMemory(session: DemoSessionRecord): DemoSessionRecord {
  if (!session.conversationMemory?.silenceRetries) {
    return session;
  }
  return rememberConversation(session, { silenceRetries: 0 });
}

function slotChoiceText(slots: string[] | undefined): string {
  const usable = (slots ?? []).slice(0, 2);
  return usable.length > 0 ? usable.join(" ya ") : "morning ya afternoon";
}

function buildSilenceRetry(session: DemoSessionRecord, prompts: ConversationPrompts): { reply: string; session: DemoSessionRecord } {
  const memory = getConversationMemory(session);
  const retries = memory.silenceRetries ?? 0;
  const nextSession = rememberConversation(session, { silenceRetries: Math.min(retries + 1, 2) });

  if (retries >= 2) {
    return { reply: withExtraInstructions(promptForStage(session.bookingStage, prompts), prompts), session: nextSession };
  }

  if (session.bookingStage === "waiting_for_time" && (session.availabilityOfferedSlots?.length || memory.lastSuggestedSlots?.length)) {
    return {
      reply: renderPrompt(prompts.silenceRetryWithSlots, {
        slotChoices: slotChoiceText(session.availabilityOfferedSlots ?? memory.lastSuggestedSlots)
      }),
      session: nextSession
    };
  }

  if (session.bookingStage === "waiting_for_date" && memory.lastDay) {
    return { reply: renderPrompt(prompts.silenceRetryDate, { day: memory.lastDay }), session: nextSession };
  }

  if (session.bookingStage === "waiting_for_doctor_preference" && memory.lastDoctor) {
    return { reply: renderPrompt(prompts.silenceRetryDoctor, { doctor: memory.lastDoctor }), session: nextSession };
  }

  return { reply: renderPrompt(prompts.silenceRetryGeneric, { stagePrompt: promptForStage(session.bookingStage, prompts) }), session: nextSession };
}

function promptForStage(stage: BookingStage, prompts: ConversationPrompts): string {
  switch (stage) {
    case "waiting_for_specialization":
    case "waiting_for_intent":
    case "greeting":
      return prompts.askSpecialization;
    case "waiting_for_doctor_preference":
      return prompts.askDoctorPreference;
    case "waiting_for_date":
      return prompts.askDate;
    case "waiting_for_time":
      return prompts.askTime;
    case "waiting_for_patient_name":
      return prompts.askPatientName;
    case "waiting_for_mobile":
      return prompts.askMobile;
    case "waiting_for_patient_type":
      return prompts.askPatientType;
    case "confirming":
      return "Details sahi hain?";
    case "reschedule_waiting_for_new_day":
      return prompts.rescheduleAskNewDay;
    case "reschedule_waiting_for_new_slot":
      return renderPrompt(prompts.rescheduleAskSlot, { slotChoices: "available slots" });
    case "reschedule_confirming":
      return prompts.rescheduleConfirm;
    case "cancel_confirming":
      return prompts.cancelConfirm;
    default:
      return FALLBACK_MESSAGES.fallback;
  }
}

function buildRecoveryPrompt(stage: BookingStage, session: DemoSessionRecord, prompts: ConversationPrompts): string {
  const memory = getConversationMemory(session);

  if (stage === "waiting_for_time") {
    const slots = session.availabilityOfferedSlots?.length ? session.availabilityOfferedSlots : memory.lastSuggestedSlots;
    return slots?.length
      ? renderPrompt(prompts.recoveryTimeWithSlots, { slotChoices: slotChoiceText(slots) })
      : prompts.recoveryTimeGeneric;
  }

  if (stage === "waiting_for_date") {
    return memory.lastDay
      ? renderPrompt(prompts.recoveryDateWithMemory, { day: memory.lastDay })
      : prompts.recoveryDateGeneric;
  }

  if (stage === "waiting_for_doctor_preference" && memory.lastDoctor) {
    return renderPrompt(prompts.recoveryDoctorWithMemory, { doctor: memory.lastDoctor });
  }

  if (stage === "waiting_for_patient_name") {
    return prompts.recoveryPatientName;
  }

  if (stage === "waiting_for_mobile") {
    return prompts.recoveryMobile;
  }

  if (stage === "waiting_for_patient_type") {
    return prompts.askPatientType;
  }

  if (stage === "confirming") {
    return prompts.recoveryConfirmation;
  }

  return promptForStage(stage, prompts);
}

function askNextMissingField(
  session: DemoSessionRecord,
  prompts: ConversationPrompts,
  intelligence: Required<IntelligenceSettings>
): { reply: string; stage: BookingStage; action: string; session: DemoSessionRecord } {
  if (!session.selectedDoctor && !session.selectedSpecialization) {
    return { reply: withExtraInstructions(prompts.askSpecialization, prompts), stage: "waiting_for_specialization", action: "ask_missing_specialization", session };
  }

  if (session.selectedSpecialization && !session.selectedDoctor) {
    const lastDoctor = getConversationMemory(session).lastDoctor;
    if (lastDoctor) {
      return { reply: renderPrompt(prompts.confirmRememberedDoctor, { doctor: lastDoctor }), stage: "waiting_for_doctor_preference", action: "ask_confirm_last_doctor", session };
    }
    return { reply: withExtraInstructions(prompts.askDoctorPreference, prompts), stage: "waiting_for_doctor_preference", action: "ask_missing_doctor_preference", session };
  }

  if (!session.preferredDate) {
    const lastDay = getConversationMemory(session).lastDay;
    if (lastDay && session.selectedDoctor) {
      return { reply: renderPrompt(prompts.confirmRememberedDay, { day: lastDay }), stage: "waiting_for_date", action: "ask_confirm_last_day", session };
    }
    return { reply: withExtraInstructions(prompts.askDate, prompts), stage: "waiting_for_date", action: "ask_missing_date", session };
  }

  if (!session.preferredTime) {
    return { reply: withExtraInstructions(prompts.askTime, prompts), stage: "waiting_for_time", action: "ask_missing_time", session };
  }

  if (!session.patientName) {
    return { reply: withExtraInstructions(prompts.askPatientName, prompts), stage: "waiting_for_patient_name", action: "ask_missing_patient_name", session };
  }

  const ani = validAniNumber(session.callerNumber);
  if (!session.contactNumber && intelligence.callerNumberConfirmation && ani && !session.bookingContactConfirmationPending) {
    const updated = updateSession(session, { bookingContactConfirmationPending: true });
    return {
      reply: getConversationMemory(session).callerSeenBefore ? buildCallerReuseConfirmation(ani, prompts) : buildCallerNumberConfirmation(ani, prompts),
      stage: "waiting_for_mobile",
      action: "ask_confirm_caller_number",
      session: updated
    };
  }

  if (!session.contactNumber) {
    return { reply: withExtraInstructions(prompts.askMobile, prompts), stage: "waiting_for_mobile", action: "ask_missing_mobile", session };
  }

  if (!session.patientType) {
    return { reply: withExtraInstructions(prompts.askPatientType, prompts), stage: "waiting_for_patient_type", action: "ask_missing_patient_type", session };
  }

  return { reply: buildConfirmationSummary(session, prompts), stage: "confirming", action: "ready_for_confirmation", session };
}

function applySmartEntities(
  transcript: string,
  normalizedTranscript: string,
  session: DemoSessionRecord,
  runtimeDoctors: RuntimeDoctor[],
  intelligence: Required<IntelligenceSettings>
): DemoSessionRecord {
  if (!intelligence.enabled) {
    return session;
  }

  let next = session;
  const doctor = mapDoctorPreference(normalizedTranscript, next, runtimeDoctors);
  if (doctor && !next.selectedDoctor) {
    const selectedDoctor = runtimeDoctors.find((runtimeDoctor) => runtimeDoctor.name === doctor.selectedDoctor) ?? null;
    next = updateSession(next, {
      doctorPreference: doctor.doctorPreference,
      selectedDoctor: doctor.selectedDoctor,
      selectedSpecialization: selectedDoctor?.specialization ?? next.selectedSpecialization
    });
  }

  const specialization = mapSpecialization(normalizedTranscript, runtimeDoctors);
  if (specialization && !next.selectedSpecialization) {
    next = updateSession(next, {
      selectedSpecialization: specialization.specialization
    });
  }

  const date = mapDateFlexible(normalizedTranscript);
  if (date && !next.preferredDate) {
    next = updateSession(next, { preferredDate: date });
  }

  const time = mapTimeFlexible(normalizedTranscript);
  if (time && !next.preferredTime) {
    next = updateSession(next, { preferredTime: time });
  }

  const patientType = mapPatientType(normalizedTranscript);
  if (patientType && !next.patientType) {
    next = updateSession(next, { patientType });
  }

  const mobile = resolveMobile(transcript, next.callerNumber, next.contactNumber);
  if (mobile && !next.contactNumber) {
    next = updateSession(next, {
      contactNumber: mobile,
      bookingContactConfirmed: true,
      bookingContactConfirmationPending: false
    });
  }

  const hasNameCue = /\b(mera|name|naam|patient)\b/i.test(transcript) || /(मेरा|नाम)/u.test(transcript);
  if (hasNameCue && !next.patientName) {
    const patientName = extractPatientName(transcript);
    if (patientName) {
      next = updateSession(next, { patientName });
    }
  }

  return next;
}

function resolveAvailabilityFirstStep(
  session: DemoSessionRecord,
  runtimeDoctors: RuntimeDoctor[],
  appointments: AppointmentSnapshot[],
  prompts: ConversationPrompts,
  intelligence: Required<IntelligenceSettings>
): { session: DemoSessionRecord; reply: string; stage: BookingStage; action: string } | null {
  if (!intelligence.enabled || !intelligence.availabilityFirst || !session.selectedDoctor || !session.preferredDate) {
    return null;
  }

  if (
    [
      "waiting_for_patient_name",
      "waiting_for_mobile",
      "waiting_for_patient_type",
      "confirming",
      "reschedule_waiting_for_new_day",
      "reschedule_waiting_for_new_slot",
      "reschedule_confirming",
      "rescheduled",
      "cancel_confirming",
      "booked",
      "cancelled",
      "fallback"
    ].includes(session.bookingStage)
  ) {
    return null;
  }

  const selectedDoctor = runtimeDoctors.find((doctor) => doctor.name === session.selectedDoctor) ?? null;
  const resolution = resolveAvailability({
    doctor: selectedDoctor as AvailabilityRuntimeDoctor | null,
    requestedDay: session.preferredDate,
    requestedTime: session.preferredTime,
    appointments,
    prompts: prompts as AvailabilityPromptTemplates
  });

  if (!resolution || session.availabilityCheckKey === resolution.checkKey) {
    return null;
  }

  if (resolution.status === "available") {
    const updated = updateSession(session, {
      preferredDate: resolution.selectedDate ?? session.preferredDate,
      preferredTime: resolution.selectedTime ?? session.preferredTime,
      availabilityCheckKey: resolution.checkKey,
      availabilityOfferedDate: null,
      availabilityOfferedTime: null,
      availabilityOfferedSlots: resolution.offeredSlots
    });
    const next = askNextMissingField(updated, prompts, intelligence);
    return {
      session: next.session,
      reply: `${resolution.reply} ${next.reply}`,
      stage: next.stage,
      action: "availability_available"
    };
  }

  if (resolution.status === "time_full") {
    const updated = updateSession(session, {
      preferredTime: null,
      availabilityCheckKey: resolution.checkKey,
      availabilityOfferedDate: resolution.offeredDate ?? session.preferredDate,
      availabilityOfferedTime: resolution.offeredTime ?? null,
      availabilityOfferedSlots: resolution.offeredSlots
    });
    return {
      session: updated,
      reply: resolution.reply,
      stage: "waiting_for_time",
      action: "availability_time_full"
    };
  }

  if (resolution.status === "day_unavailable") {
    const updated = updateSession(session, {
      preferredDate: null,
      preferredTime: null,
      availabilityCheckKey: resolution.checkKey,
      availabilityOfferedDate: resolution.offeredDate ?? null,
      availabilityOfferedTime: resolution.offeredTime ?? null,
      availabilityOfferedSlots: resolution.offeredSlots
    });
    return {
      session: updated,
      reply: resolution.reply,
      stage: "waiting_for_date",
      action: "availability_day_unavailable"
    };
  }

  if (resolution.status === "booking_disabled") {
    return {
      session: updateSession(session, { availabilityCheckKey: resolution.checkKey }),
      reply: resolution.reply,
      stage: "fallback",
      action: "availability_booking_disabled"
    };
  }

  return null;
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
    const sessionAppointment = session.reschedule_existing ?? session.cancel_booking ?? null;
    const appointmentDate = sessionAppointment?.appointmentDate ?? (
      session.preferredDate || session.preferredTime
        ? [session.preferredDate, session.preferredTime].filter(Boolean).join(" ")
        : null
    );
    const sessionDoctorId = sessionAppointment?.doctorId ?? null;
    const sessionDoctorName = session.selectedDoctor ?? sessionAppointment?.doctorName ?? null;
    const matchingDoctor =
      doctors.find((doctor) => sessionDoctorId && doctor.doctorId === sessionDoctorId)
      ?? doctors.find((doctor) => sessionDoctorName && doctor.name === sessionDoctorName)
      ?? null;
    const selectedDoctor = matchingDoctor?.name ?? sessionDoctorName;
    const selectedSpecialization = session.selectedSpecialization ?? matchingDoctor?.specialization ?? null;
    const usageLedger = session.usageLedger ?? [];
    const costSummary = summarizeUsageLedger(usageLedger as UsageLedgerEntry[]);
    const outcome =
      session.bookingStage === "rescheduled"
        ? "rescheduled"
        : session.bookingStage === "booked"
          ? "booked"
          : session.bookingStage === "cancelled"
          ? "cancelled"
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
          selectedSpecialization,
          selectedDoctor,
          doctorId: matchingDoctor?.doctorId ?? sessionDoctorId,
          appointmentDate,
          preferredDate: session.preferredDate,
          preferredTime: session.preferredTime,
          patientName: session.patientName,
          patientType: session.patientType,
          contactNumber: session.contactNumber,
          bookingResult: session.bookingResult,
          currentNode: session.bookingStage,
          outcome,
          costSummary,
          usageLedger,
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

async function hasUsedCallerNumberBefore(callerNumber: string | null | undefined, currentSessionId: string): Promise<boolean> {
  const ani = validAniNumber(callerNumber);
  if (!ani) {
    return false;
  }

  try {
    const existing = await CallLogModel.exists({
      sessionId: { $ne: currentSessionId },
      $or: [
        { callerNumber: { $regex: `${ani}$` } },
        { contactNumber: ani }
      ],
      bookingStage: "booked"
    });
    return Boolean(existing);
  } catch {
    return false;
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

  async recordUsage(sessionId: string, usageEvents: UsageEventInput[]): Promise<DemoSessionRecord | null> {
    const session = this.repository.getSession(sessionId);

    if (!session) {
      return null;
    }

    const usageLedger = [
      ...(session.usageLedger ?? []),
      ...usageEvents.map((event) => createUsageLedgerEntry(event))
    ];

    const updated = updateSession(session, { usageLedger });
    this.repository.saveSession(updated);
    await syncSessionToDb(updated);

    return updated;
  }

  async endSession(sessionId: string, reason = "hangup"): Promise<DemoSessionRecord | null> {
    const session = this.repository.getSession(sessionId);

    if (!session) {
      return null;
    }

    if (session.callStatus !== "active") {
      return session;
    }

    const updated = updateSession(session, {
      callStatus: "completed",
      bookingResult: session.bookingResult ?? `Call ended: ${reason}`
    });
    this.repository.saveSession(updated);
    await syncSessionToDb(updated);

    return updated;
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
    const intelligence = resolveIntelligenceSettings(clinicSettings);
    const appointmentResponse = await fetchJson<{ data: AppointmentSnapshot[] }>(`${input.appointmentServiceUrl}/appointments`);
    const appointmentSnapshots = Array.isArray(appointmentResponse?.data) ? appointmentResponse.data : [];

    let session = this.repository.getSession(input.sessionId) ?? createNewSession(input.sessionId, input.callerNumber);
    session = updateSession(session, {
      callerNumber: input.callerNumber ?? session.callerNumber,
      transcriptHistory: [...session.transcriptHistory, createHistoryEntry("caller", input.transcript)],
      usageLedger: [
        ...(session.usageLedger ?? []),
        ...(input.usageEvents ?? []).map((event) => createUsageLedgerEntry(event))
      ]
    });
    session = applySmartEntities(input.transcript, normalizedTranscript, session, runtimeDoctors, intelligence);
    if (normalizedTranscript) {
      session = resetSilenceMemory(session);
    }
    if (!getConversationMemory(session).callerSeenBefore && validAniNumber(session.callerNumber)) {
      const callerSeenBefore = await hasUsedCallerNumberBefore(session.callerNumber, session.sessionId);
      session = rememberConversation(session, { callerSeenBefore });
    } else {
      session = rememberConversation(session);
    }

    const prompts = resolveConversationPrompts(clinicSettings, runtimeDoctors, session);
    let reply = clinicSettings?.greetingMessage ?? FALLBACK_MESSAGES.fallback;
    let stage: BookingStage = session.bookingStage;
    let action = "demo_fallback";
    let latestIntent = session.latestIntent ?? "demo_booking";

    if (!normalizedTranscript) {
      const silence = buildSilenceRetry(session, prompts);
      session = silence.session;
      reply = silence.reply;
      stage = session.bookingStage;
      action = "silence_retry";
      latestIntent = session.latestIntent ?? latestIntent;
    } else if (normalizedTranscript.includes("emergency")) {
      reply = clinicSettings?.emergencyMessage ?? FALLBACK_MESSAGES.emergency;
      action = "emergency_escalation";
      latestIntent = "emergency";
      stage = "fallback";
    } else if (normalizedTranscript.includes("human") || normalizedTranscript.includes("reception")) {
      const transferPrefix = prompts.transferMessage.replace("the configured clinic number", "").trim();
      reply = `${transferPrefix} ${clinicSettings?.transferNumber ?? "the configured clinic number"}.`.trim();
      action = "transfer_call";
      latestIntent = "human_escalation";
      stage = "fallback";
      session = updateSession(session, { callStatus: "completed" });
    } else {
      const availabilityStep = resolveAvailabilityFirstStep(session, runtimeDoctors, appointmentSnapshots, prompts, intelligence);
      if (availabilityStep) {
        session = availabilityStep.session;
        reply = availabilityStep.reply;
        stage = availabilityStep.stage;
        action = availabilityStep.action;
        latestIntent = "book_appointment";
      } else {
      switch (session.bookingStage) {
        case "waiting_for_intent":
        case "greeting":
          {
            if (matchCancelAppointmentIntent(normalizedTranscript)) {
              const existingBooking = findLatestActiveAppointmentForCaller(appointmentSnapshots, session.callerNumber);

              if (existingBooking) {
                session = updateSession(session, {
                  ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
                  cancel_booking: existingBooking
                });
                reply = buildCancelConfirmation(existingBooking, runtimeDoctors, prompts);
                stage = "cancel_confirming";
                action = "cancel_existing_booking_found";
              } else {
                reply = prompts.cancelNoActiveBooking;
                stage = "waiting_for_intent";
                action = "cancel_no_active_booking";
              }

              latestIntent = "cancel_appointment";
              break;
            }

            if (matchRescheduleIntent(normalizedTranscript)) {
              const existingBooking = findLatestActiveAppointmentForCaller(appointmentSnapshots, session.callerNumber);

              if (existingBooking) {
                session = updateSession(session, {
                  ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
                  reschedule_existing: existingBooking,
                  reschedule_new_day: null,
                  reschedule_available_slots: [],
                  reschedule_confirmed_slot: null
                });
                reply = renderPrompt(prompts.rescheduleFoundBooking, {
                  appointment: buildAppointmentSpeech(existingBooking, runtimeDoctors)
                });
                stage = "reschedule_waiting_for_new_day";
                action = "reschedule_existing_booking_found";
              } else {
                reply = prompts.rescheduleNoActiveBooking;
                stage = "waiting_for_intent";
                action = "reschedule_no_active_booking";
              }

              latestIntent = "reschedule_appointment";
              break;
            }

            const directDoctor = mapDoctorPreference(normalizedTranscript, session, runtimeDoctors);
            const specialization = mapSpecialization(normalizedTranscript, runtimeDoctors);

            if (directDoctor) {
              const selectedDoctor = runtimeDoctors.find((doctor) => doctor.name === directDoctor.selectedDoctor) ?? null;
              session = updateSession(session, {
                selectedSpecialization: selectedDoctor?.specialization ?? session.selectedSpecialization,
                selectedDoctor: directDoctor.selectedDoctor,
                doctorPreference: directDoctor.doctorPreference
              });
              const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
              if (next) {
                session = next.session;
                reply = next.reply;
                stage = next.stage;
                action = next.action === "ready_for_confirmation" ? "capture_doctor_preference_ready" : "capture_doctor_preference";
              } else {
                reply = withExtraInstructions(prompts.askDate, prompts);
                stage = "waiting_for_date";
                action = "capture_doctor_preference";
              }
              latestIntent = "book_appointment";
            } else if (specialization) {
              session = updateSession(session, {
                selectedSpecialization: specialization.specialization
              });
              const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
              if (next) {
                session = next.session;
                reply = next.reply;
                stage = next.stage;
                action = next.action === "ready_for_confirmation" ? "capture_specialization_ready" : "capture_specialization";
              } else {
                reply = withExtraInstructions(prompts.askDoctorPreference, prompts);
                stage = "waiting_for_doctor_preference";
                action = "capture_specialization";
              }
              latestIntent = "book_appointment";
            } else if (matchIntentStart(normalizedTranscript)) {
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
            if (next) {
              session = next.session;
              reply = next.reply;
              stage = next.stage;
              action = next.action === "ready_for_confirmation" ? "capture_booking_intent_ready" : "capture_booking_intent";
            } else {
              reply = withExtraInstructions(prompts.askSpecialization, prompts);
              stage = "waiting_for_specialization";
              action = "capture_booking_intent";
            }
            latestIntent = "book_appointment";
          } else if (intelligence.enabled && (session.selectedDoctor || session.selectedSpecialization || session.preferredDate || session.preferredTime)) {
            const next = askNextMissingField(session, prompts, intelligence);
            session = next.session;
            reply = next.reply;
            stage = next.stage;
            action = "smart_capture_partial_booking";
            latestIntent = "book_appointment";
          } else {
            reply = clinicSettings?.greetingMessage ?? FALLBACK_MESSAGES.greeting;
            stage = "waiting_for_intent";
            action = "greet_and_prompt";
          }
          break;
          }

        case "waiting_for_specialization": {
          const directDoctor = mapDoctorPreference(normalizedTranscript, session, runtimeDoctors);
          const specialization = mapSpecialization(normalizedTranscript, runtimeDoctors);

          if (directDoctor) {
            const selectedDoctor = runtimeDoctors.find((doctor) => doctor.name === directDoctor.selectedDoctor) ?? null;
            session = updateSession(session, {
              selectedSpecialization: selectedDoctor?.specialization ?? session.selectedSpecialization,
              selectedDoctor: directDoctor.selectedDoctor,
              doctorPreference: directDoctor.doctorPreference
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? withExtraInstructions(prompts.askDate, prompts);
            stage = next?.stage ?? "waiting_for_date";
            action = "capture_doctor_preference";
          } else if (specialization) {
            session = updateSession(session, {
              selectedSpecialization: specialization.specialization
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? withExtraInstructions(prompts.askDoctorPreference, prompts);
            stage = next?.stage ?? "waiting_for_doctor_preference";
            action = "capture_specialization";
          } else {
            reply = runtimeDoctors.length > 0
              ? `Available specializations include ${runtimeDoctors.map((doctor) => doctor.specialization).filter((value, index, array) => array.indexOf(value) === index).join(", ")}. Please choose one.`
              : buildRecoveryPrompt("waiting_for_specialization", session, prompts);
            if (runtimeDoctors.length > 0) {
              reply = renderPrompt(prompts.recoverySpecialization, {
                specializations: runtimeDoctors.map((doctor) => doctor.specialization).filter((value, index, array) => array.indexOf(value) === index).join(", ")
              });
            }
          }
          break;
        }

        case "waiting_for_doctor_preference": {
          const rememberedDoctor = getConversationMemory(session).lastDoctor ?? null;
          const acceptedRememberedDoctor = rememberedDoctor && mapYesNo(normalizedTranscript) === "yes";
          const preference = acceptedRememberedDoctor
            ? {
                doctorPreference: "specific_doctor",
                selectedDoctor: rememberedDoctor,
                doctorId: runtimeDoctors.find((doctor) => doctor.name === rememberedDoctor)?.doctorId ?? null
              }
            : mapDoctorPreference(normalizedTranscript, session, runtimeDoctors);

          if (preference) {
            session = updateSession(session, {
              doctorPreference: preference.doctorPreference,
              selectedDoctor: preference.selectedDoctor
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? withExtraInstructions(prompts.askDate, prompts);
            stage = next?.stage ?? "waiting_for_date";
            action = "capture_doctor_preference";
          } else {
            reply = buildRecoveryPrompt("waiting_for_doctor_preference", session, prompts);
            action = "reprompt_doctor_preference";
          }
          break;
        }

        case "waiting_for_date": {
          const acceptedOffer = session.availabilityOfferedDate && mapYesNo(normalizedTranscript) === "yes";
          const acceptedRememberedDay = !acceptedOffer && getConversationMemory(session).lastDay && mapYesNo(normalizedTranscript) === "yes";
          const date = acceptedOffer
            ? session.availabilityOfferedDate
            : acceptedRememberedDay
              ? getConversationMemory(session).lastDay
              : mapDateFlexible(normalizedTranscript);

          if (date) {
            session = updateSession(session, {
              preferredDate: date,
              preferredTime: acceptedOffer ? session.availabilityOfferedTime ?? session.preferredTime : session.preferredTime,
              availabilityOfferedDate: acceptedOffer ? null : session.availabilityOfferedDate,
              availabilityOfferedTime: acceptedOffer ? null : session.availabilityOfferedTime,
              availabilityOfferedSlots: acceptedOffer ? [] : session.availabilityOfferedSlots
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? withExtraInstructions(prompts.askTime, prompts);
            stage = next?.stage ?? "waiting_for_time";
            action = "capture_date";
          } else {
            reply = buildRecoveryPrompt("waiting_for_date", session, prompts);
            action = "reprompt_date";
          }
          break;
        }

        case "waiting_for_time": {
          const acceptedOffer = session.availabilityOfferedTime && mapYesNo(normalizedTranscript) === "yes";
          const time = acceptedOffer ? session.availabilityOfferedTime : mapTimeFlexible(normalizedTranscript);

          if (time) {
            session = updateSession(session, {
              preferredTime: time,
              availabilityOfferedDate: acceptedOffer ? null : session.availabilityOfferedDate,
              availabilityOfferedTime: acceptedOffer ? null : session.availabilityOfferedTime,
              availabilityOfferedSlots: acceptedOffer ? [] : session.availabilityOfferedSlots
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? withExtraInstructions(prompts.askPatientName, prompts);
            stage = next?.stage ?? "waiting_for_patient_name";
            action = "capture_time";
          } else {
            reply = buildRecoveryPrompt("waiting_for_time", session, prompts);
            action = "reprompt_time";
          }
          break;
        }

        case "waiting_for_patient_name": {
          const patientName = extractPatientName(input.transcript);

          if (patientName) {
            session = updateSession(session, { patientName });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? withExtraInstructions(prompts.askMobile, prompts);
            stage = next?.stage ?? "waiting_for_mobile";
            action = "capture_patient_name";
          } else {
            reply = buildRecoveryPrompt("waiting_for_patient_name", session, prompts);
            action = "reprompt_patient_name";
          }
          break;
        }

        case "waiting_for_mobile": {
          const yesNo = session.bookingContactConfirmationPending ? mapYesNo(normalizedTranscript) : null;
          const ani = validAniNumber(session.callerNumber);

          if (yesNo === "yes" && ani) {
            session = updateSession(session, {
              contactNumber: ani,
              bookingContactConfirmed: true,
              bookingContactConfirmationPending: false
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? withExtraInstructions(prompts.askPatientType, prompts);
            stage = next?.stage ?? "waiting_for_patient_type";
            action = "confirm_caller_number";
            break;
          }

          if (yesNo === "no") {
            session = updateSession(session, {
              contactNumber: null,
              bookingContactConfirmed: false,
              bookingContactConfirmationPending: false
            });
            reply = withExtraInstructions(prompts.askMobile, prompts);
            stage = "waiting_for_mobile";
            action = "ask_alternate_mobile";
            break;
          }

          const mobile = resolveMobile(input.transcript, session.callerNumber, session.contactNumber);

          if (mobile) {
            session = updateSession(session, {
              contactNumber: mobile,
              bookingContactConfirmed: true,
              bookingContactConfirmationPending: false
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? withExtraInstructions(prompts.askPatientType, prompts);
            stage = next?.stage ?? "waiting_for_patient_type";
            action = "capture_mobile";
          } else {
            reply = buildRecoveryPrompt("waiting_for_mobile", session, prompts);
            action = "reprompt_mobile";
          }
          break;
        }

        case "waiting_for_patient_type": {
          const patientType = mapPatientType(normalizedTranscript);

          if (patientType) {
            session = updateSession(session, { patientType });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? buildConfirmationSummary(session, prompts);
            stage = next?.stage ?? "confirming";
            action = "capture_patient_type";
          } else {
            reply = buildRecoveryPrompt("waiting_for_patient_type", session, prompts);
            action = "reprompt_patient_type";
          }
          break;
        }

        case "confirming": {
          const confirmation = mapConfirmationFlexible(normalizedTranscript);

          if (confirmation === "change_doctor") {
            reply = withExtraInstructions(prompts.askDoctorPreference, prompts);
            stage = "waiting_for_doctor_preference";
            action = "change_doctor";
          } else if (confirmation === "change_time") {
            reply = withExtraInstructions(prompts.askTime, prompts);
            stage = "waiting_for_time";
            action = "change_time";
          } else if (confirmation === "cancel") {
            reply = prompts.bookingCancelled;
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
            reply = buildFinalSummary(session, appointmentId, prompts);
            stage = "booked";
            action = "confirm_booking";
            session = updateSession(session, {
              callStatus: "completed",
              bookingResult: appointmentId ? `Booked successfully with reference ${appointmentId}` : "Booking requested in demo mode"
            });
          } else {
            reply = buildRecoveryPrompt("confirming", session, prompts);
            action = "reprompt_confirmation";
          }
          break;
        }

        case "reschedule_waiting_for_new_day": {
          const existingBooking = session.reschedule_existing ?? findLatestActiveAppointmentForCaller(appointmentSnapshots, session.callerNumber);
          const selectedDoctor = resolveDoctorForAppointment(existingBooking, runtimeDoctors);
          const acceptedOffer = session.reschedule_new_day && mapYesNo(normalizedTranscript) === "yes";
          const requestedDay = acceptedOffer ? session.reschedule_new_day : mapDateFlexible(normalizedTranscript);

          latestIntent = "reschedule_appointment";

          if (!existingBooking || !selectedDoctor) {
            reply = prompts.rescheduleMissingBooking;
            stage = "waiting_for_intent";
            action = "reschedule_missing_booking";
            break;
          }

          if (!requestedDay) {
            reply = prompts.rescheduleAskNewDay;
            stage = "reschedule_waiting_for_new_day";
            action = "reprompt_reschedule_day";
            break;
          }

          const resolution = resolveAvailability({
            doctor: selectedDoctor as AvailabilityRuntimeDoctor,
            requestedDay,
            requestedTime: null,
            appointments: appointmentSnapshots,
            prompts: prompts as AvailabilityPromptTemplates
          });

          if (!resolution || resolution.status === "booking_disabled") {
            reply = renderPrompt(prompts.rescheduleBookingDisabled, { doctor: selectedDoctor.name });
            stage = "fallback";
            action = "reschedule_booking_disabled";
            break;
          }

          if (resolution.status !== "available" || resolution.offeredSlots.length === 0) {
            session = updateSession(session, {
              ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
              reschedule_existing: existingBooking,
              reschedule_new_day: resolution.offeredDate ?? requestedDay,
              reschedule_available_slots: resolution.offeredSlots,
              reschedule_confirmed_slot: null
            });
            reply = resolution.reply;
            stage = "reschedule_waiting_for_new_day";
            action = "reschedule_day_unavailable";
            break;
          }

          session = updateSession(session, {
            ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
            reschedule_existing: existingBooking,
            reschedule_new_day: resolution.selectedDate ?? requestedDay,
            reschedule_available_slots: resolution.offeredSlots,
            reschedule_confirmed_slot: null
          });
          reply = renderPrompt(prompts.rescheduleSlotsAvailable, {
            availabilityReply: resolution.reply,
            slotChoices: slotChoiceText(resolution.offeredSlots)
          });
          stage = "reschedule_waiting_for_new_slot";
          action = "reschedule_slots_available";
          break;
        }

        case "reschedule_waiting_for_new_slot": {
          const existingBooking = session.reschedule_existing ?? findLatestActiveAppointmentForCaller(appointmentSnapshots, session.callerNumber);
          const requestedTime = mapTimeFlexible(normalizedTranscript);
          const acceptedFirstSlot = !requestedTime && (mapYesNo(normalizedTranscript) === "yes" || wantsEarliestSlot(normalizedTranscript)) ? session.reschedule_available_slots?.[0] : null;
          const selectedSlot = acceptedFirstSlot ?? matchOfferedSlot(normalizedTranscript, session.reschedule_available_slots);

          latestIntent = "reschedule_appointment";

          if (!existingBooking || !session.reschedule_new_day || !session.reschedule_available_slots?.length) {
            reply = prompts.rescheduleAskNewDay;
            stage = "reschedule_waiting_for_new_day";
            action = "reschedule_missing_slot_context";
            break;
          }

          if (!selectedSlot) {
            const selectedDoctor = resolveDoctorForAppointment(existingBooking, runtimeDoctors);
            const resolution = requestedTime && selectedDoctor
              ? resolveAvailability({
                  doctor: selectedDoctor as AvailabilityRuntimeDoctor,
                  requestedDay: session.reschedule_new_day,
                  requestedTime,
                  appointments: appointmentSnapshots,
                  prompts: prompts as AvailabilityPromptTemplates
                })
              : null;

            if (resolution?.status === "available") {
              const resolvedSlot = resolution.selectedTime ?? resolution.offeredSlots[0] ?? requestedTime;
              session = updateSession(session, {
                ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
                reschedule_existing: existingBooking,
                reschedule_new_day: resolution.selectedDate ?? session.reschedule_new_day,
                reschedule_available_slots: resolution.offeredSlots.length ? resolution.offeredSlots : [resolvedSlot],
                preferredDate: resolution.selectedDate ?? session.reschedule_new_day,
                preferredTime: resolvedSlot,
                reschedule_confirmed_slot: { time: resolvedSlot }
              });
              reply = buildRescheduleConfirmation(existingBooking, session, runtimeDoctors, prompts);
              stage = "reschedule_confirming";
              action = "reschedule_slot_selected";
              break;
            }

            if (resolution?.status === "time_full" || resolution?.status === "day_unavailable") {
              session = updateSession(session, {
                ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
                reschedule_existing: existingBooking,
                reschedule_new_day: resolution.offeredDate ?? session.reschedule_new_day,
                reschedule_available_slots: resolution.offeredSlots,
                reschedule_confirmed_slot: null,
                preferredDate: null,
                preferredTime: null
              });
              reply = resolution.reply;
              stage = resolution.offeredSlots.length ? "reschedule_waiting_for_new_slot" : "reschedule_waiting_for_new_day";
              action = resolution.status === "time_full" ? "reschedule_requested_time_unavailable" : "reschedule_requested_day_unavailable";
              break;
            }

            reply = renderPrompt(prompts.rescheduleAskSlot, {
              slotChoices: slotChoiceText(session.reschedule_available_slots)
            });
            stage = "reschedule_waiting_for_new_slot";
            action = "reprompt_reschedule_slot";
            break;
          }

          session = updateSession(session, {
            ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
            reschedule_existing: existingBooking,
            preferredDate: session.reschedule_new_day,
            preferredTime: selectedSlot,
            reschedule_confirmed_slot: { time: selectedSlot }
          });
          reply = buildRescheduleConfirmation(existingBooking, session, runtimeDoctors, prompts);
          stage = "reschedule_confirming";
          action = "reschedule_slot_selected";
          break;
        }

        case "reschedule_confirming": {
          const confirmation = mapConfirmationFlexible(normalizedTranscript);
          const existingBooking = session.reschedule_existing ?? findLatestActiveAppointmentForCaller(appointmentSnapshots, session.callerNumber);
          const appointmentId = appointmentIdOf(existingBooking);

          latestIntent = "reschedule_appointment";

          if (confirmation === "change_time") {
            reply = renderPrompt(prompts.rescheduleAskSlot, {
              slotChoices: slotChoiceText(session.reschedule_available_slots)
            });
            stage = "reschedule_waiting_for_new_slot";
            action = "reschedule_change_slot";
            break;
          }

          if (confirmation === "change_doctor" || confirmation === "cancel") {
            reply = prompts.rescheduleDeclined;
            stage = "waiting_for_intent";
            action = "reschedule_declined";
            break;
          }

          if (confirmation !== "confirm") {
            reply = buildRescheduleConfirmation(existingBooking, session, runtimeDoctors, prompts);
            stage = "reschedule_confirming";
            action = "reprompt_reschedule_confirmation";
            break;
          }

          if (!appointmentId || !session.reschedule_new_day || !session.reschedule_confirmed_slot?.time) {
            reply = prompts.rescheduleAskNewDay;
            stage = "reschedule_waiting_for_new_day";
            action = "reschedule_missing_confirmation_context";
            break;
          }

          const rescheduleResponse = await fetchJson<{ data: SessionAppointmentSnapshot }>(`${input.appointmentServiceUrl}/reschedule`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              appointmentId,
              appointmentDate: `${session.reschedule_new_day} ${session.reschedule_confirmed_slot.time}`
            })
          });

          const updatedAppointment = rescheduleResponse?.data ?? existingBooking;
          reply = buildRescheduleFinal(updatedAppointment, session, runtimeDoctors, prompts);
          stage = "rescheduled";
          action = "confirm_reschedule";
          session = updateSession(session, {
            ...appointmentSessionFields(updatedAppointment, runtimeDoctors, session),
            reschedule_existing: updatedAppointment,
            preferredDate: session.reschedule_new_day,
            preferredTime: session.reschedule_confirmed_slot.time,
            callStatus: "completed",
            bookingResult: appointmentId ? `Rescheduled successfully with reference ${appointmentId}` : "Reschedule requested"
          });
          break;
        }

        case "cancel_confirming": {
          const confirmation = mapConfirmationFlexible(normalizedTranscript);
          const existingBooking = session.cancel_booking ?? findLatestActiveAppointmentForCaller(appointmentSnapshots, session.callerNumber);
          const appointmentId = appointmentIdOf(existingBooking);

          latestIntent = "cancel_appointment";

          if (confirmation === "cancel" || mapYesNo(normalizedTranscript) === "no") {
            reply = prompts.cancelDeclined;
            stage = "waiting_for_intent";
            action = "cancel_declined";
            break;
          }

          if (confirmation !== "confirm") {
            reply = existingBooking
              ? buildCancelConfirmation(existingBooking, runtimeDoctors, prompts)
              : prompts.cancelMissingBooking;
            stage = existingBooking ? "cancel_confirming" : "waiting_for_intent";
            action = existingBooking ? "reprompt_cancel_confirmation" : "cancel_missing_booking";
            break;
          }

          if (!appointmentId) {
            reply = prompts.cancelMissingBooking;
            stage = "waiting_for_intent";
            action = "cancel_missing_booking";
            break;
          }

          await fetchJson<{ data: SessionAppointmentSnapshot }>(`${input.appointmentServiceUrl}/cancel`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ appointmentId })
          });

          reply = renderPrompt(prompts.cancelFinal, {
            appointment: buildAppointmentSpeech(existingBooking!, runtimeDoctors),
            reference: appointmentId.slice(-4).toUpperCase()
          });
          stage = "cancelled";
          action = "cancel_existing_booking";
          session = updateSession(session, {
            ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
            cancel_booking: existingBooking,
            callStatus: "cancelled",
            bookingResult: `Cancelled appointment ${appointmentId}`
          });
          break;
        }

        case "booked":
          reply = prompts.bookingAlreadyComplete;
          action = "booking_already_complete";
          break;

        case "rescheduled":
          reply = prompts.rescheduleAlreadyComplete;
          action = "reschedule_already_complete";
          latestIntent = "reschedule_appointment";
          break;

        case "cancelled":
          reply = prompts.bookingAlreadyCancelled;
          action = "booking_cancelled";
          break;

        default:
          reply = clinicSettings?.greetingMessage ?? FALLBACK_MESSAGES.greeting;
          stage = "waiting_for_intent";
          action = "reset_to_greeting";
      }
      }
    }

    session = rememberConversation(session);
    const fallbackAttempts = isFallbackAction(action) ? (session.fallbackAttempts ?? 0) + 1 : 0;
    session = updateSession(session, { fallbackAttempts });

    if (fallbackAttempts >= 2 && isFallbackAction(action)) {
      const policy = clinicSettings?.fallbackPolicy ?? "ask_again";

      if (policy === "transfer") {
        const transferPrefix = prompts.transferMessage.replace("the configured clinic number", "").trim();
        reply = `${transferPrefix} ${clinicSettings?.transferNumber ?? "the configured clinic number"}.`.trim();
        action = "fallback_transfer";
        latestIntent = "human_escalation";
        stage = "fallback";
        session = updateSession(session, { callStatus: "completed" });
      } else if (policy === "end_call") {
        reply = prompts.goodbyeMessage;
        action = "fallback_end_call";
        stage = "fallback";
        session = updateSession(session, { callStatus: "completed" });
      } else if (policy === "create_callback") {
        reply = "I will ask reception to call you back shortly. Thank you.";
        action = "fallback_create_callback";
        stage = "fallback";
        session = updateSession(session, {
          callStatus: "completed",
          bookingResult: "Callback requested after fallback"
        });
      }
    }

    if (canUseConfiguredLlmReply(action)) {
      const llmConfig = clinicSettings?.llmProviders;
      reply = await applyConfiguredLlmReply(
        normalizedTranscript,
        { ...session, bookingStage: stage, latestIntent },
        clinicSettings,
        prompts,
        runtimeDoctors,
        reply
      );

      if (llmConfig && llmConfig.primaryProvider && llmConfig.primaryProvider !== "mock") {
        session = updateSession(session, {
          usageLedger: [
            ...(session.usageLedger ?? []),
            createUsageLedgerEntry({
              service: "llm",
              provider: llmConfig.primaryProvider,
              model: llmConfig.model,
              text: `${normalizedTranscript}\n${reply}`,
              quantity: reply.length
            })
          ]
        });
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
      reply = clinicSettings?.emergencyMessage ?? FALLBACK_MESSAGES.emergency;
      action = "emergency_escalation";
    } else if (intent === "human_escalation") {
      reply = `I will transfer you to reception at ${clinicSettings?.transferNumber ?? "the configured clinic number"}.`;
      action = "transfer_call";
    } else if (intent === "clinic_info") {
      reply = `The consultation fee is ${clinicSettings?.consultationFee ?? "configured in admin"} and clinic timings are ${clinicSettings?.clinicTimings ?? "available at the clinic desk"}.`;
      action = "share_clinic_info";
    } else if (intent === "book_appointment") {
      reply = DEFAULT_PROMPTS.askSpecialization;
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



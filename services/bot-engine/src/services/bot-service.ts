import { CallLogModel, DoctorModel } from "@ai-hospital/shared-db";
import { llmFactory, type LLMConfig } from "./provider-factory";
import { createUsageLedgerEntry, summarizeUsageLedger, type UsageEventInput, type UsageLedgerEntry } from "./costing";

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
  fallbackPolicy?: "ask_again" | "transfer" | "end_call" | "create_callback";
  greetingMessage?: string;
  supportedLanguage?: string;
  conversationPrompts?: Partial<ConversationPrompts> | null;
  llmProviders?: LLMConfig | null;
  sttProviders?: unknown;
  ttsProviders?: unknown;
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
  extraInstructions: string;
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
    fallbackPolicy?: "ask_again" | "transfer" | "end_call" | "create_callback";
    emergencyMessage?: string;
    conversationPrompts?: Partial<ConversationPrompts> | null;
    llmProviders?: LLMConfig | null;
    sttProviders?: unknown;
    ttsProviders?: unknown;
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
    "Aap kis doctor ya specialization ke liye appointment lena chahte hain?",
  askDoctorPreference:
    "Kya aap kisi specific doctor se milna chahte hain ya earliest available doctor chalega?",
  askDate: "Aapko kis din appointment chahiye?",
  askTime: "Aapko morning, afternoon, ya evening mein slot chahiye?",
  askPatientName: "Kripya apna naam batayein.",
  askMobile: "Kripya apna mobile number batayein.",
  askPatientType: "Kya yeh new patient hai ya follow-up?",
  confirmPrefix: "Main aapki details confirm karti hoon.",
  bookingConfirmed: "Dhanyavaad. Aapki booking request dashboard par update kar di gayi hai.",
  bookingCancelled:
    "The booking request has been cancelled in demo mode. If you want, we can start again with a new appointment request.",
  bookingAlreadyComplete: "Your appointment request is already confirmed in demo mode. Thank you for calling.",
  bookingAlreadyCancelled: "This demo booking was cancelled. You can start again by saying appointment book karna hai.",
  transferMessage: "I will transfer you to reception at the configured clinic number.",
  goodbyeMessage: "Thank you for calling. Goodbye.",
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
    contactNumber: callerNumber ?? null,
    bookingResult: null,
    latestIntent: null,
    fallbackAttempts: 0,
    transcriptHistory: [],
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

  return {
    ...DEFAULT_PROMPTS,
    ...(clinicSettings?.conversationPrompts ?? {}),
    ...(selectedBySpecialization?.botSettings?.conversationPrompts ?? {})
  };
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
  const patterns = [
    /mera naam\s+([\p{L} ]+?)\s+hai/iu,
    /my name is\s+([\p{L} ]+)/iu,
    /patient name\s+([\p{L} ]+)/iu,
    /मेरा नाम\s+([\p{L} ]+?)\s+है/iu
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

function extractMobile(transcript: string): string | null {
  const digits = transcript
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

  const spokenDigits = transcript
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

  return spokenDigits.length >= 8 && spokenDigits.length <= 10 ? spokenDigits : null;
}

function mapPatientType(normalizedTranscript: string): string | null {
  if (
    normalizedTranscript.includes("नया मरीज")
    || normalizedTranscript.includes("न्यू पेशेंट")
    || normalizedTranscript.includes("न्यू पेशेंट है")
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

  return null;
}

function mapTimeFlexible(normalizedTranscript: string): string | null {
  const normalized = normalizedTranscript.toLowerCase();
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

function mapDateFlexible(normalizedTranscript: string): string | null {
  const normalized = normalizedTranscript.toLowerCase();
  const mapped = mapDate(normalized);

  if (mapped) {
    return mapped;
  }

  const dayAliases: Array<{ day: string; aliases: string[] }> = [
    {
      day: "monday",
      aliases: ["monday", "mon day", "manday", "munde", "monday ko", "somvar", "somwaar", "सोमवार", "मंडे", "मन्डे", "मांडे"]
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
      return entry.day;
    }
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

function buildConfirmationSummary(session: DemoSessionRecord, prompts: ConversationPrompts): string {
  const doctorName = stripDoctorTitle(session.selectedDoctor ?? "assigned doctor");
  return `${prompts.confirmPrefix} Dr. ${doctorName} ke saath ${session.preferredDate ?? "selected date"} ${
    session.preferredTime ?? "selected time"
  } slot. Name ${session.patientName ?? "patient"}, mobile ${session.contactNumber ?? "not provided"}, ${
    session.patientType ?? "consultation"
  }. Sahi ho to haan boliye.`;
}

function buildFinalSummary(session: DemoSessionRecord, appointmentId: string | null, prompts: ConversationPrompts): string {
  const doctorName = stripDoctorTitle(session.selectedDoctor ?? "assigned doctor");
  const shortReference = appointmentId ? appointmentId.slice(-4).toUpperCase() : "pending";
  return `${prompts.bookingConfirmed} Dr. ${doctorName} ke saath ${session.preferredDate ?? "selected date"} ${
    session.preferredTime ?? "selected time"
  } appointment booked. Reference last 4: ${shortReference}.`;
}

function stripDoctorTitle(name: string): string {
  return String(name || "assigned doctor").replace(/^dr\.?\s+/i, "").trim();
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
    const usageLedger = session.usageLedger ?? [];
    const costSummary = summarizeUsageLedger(usageLedger as UsageLedgerEntry[]);
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

    let session = this.repository.getSession(input.sessionId) ?? createNewSession(input.sessionId, input.callerNumber);
    session = updateSession(session, {
      callerNumber: input.callerNumber ?? session.callerNumber,
      transcriptHistory: [...session.transcriptHistory, createHistoryEntry("caller", input.transcript)],
      usageLedger: [
        ...(session.usageLedger ?? []),
        ...(input.usageEvents ?? []).map((event) => createUsageLedgerEntry(event))
      ]
    });

    const prompts = resolveConversationPrompts(clinicSettings, runtimeDoctors, session);
    let reply = clinicSettings?.greetingMessage ?? FALLBACK_MESSAGES.fallback;
    let stage: BookingStage = session.bookingStage;
    let action = "demo_fallback";
    let latestIntent = session.latestIntent ?? "demo_booking";

    if (normalizedTranscript.includes("emergency")) {
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
      switch (session.bookingStage) {
        case "waiting_for_intent":
        case "greeting":
          {
            const directDoctor = mapDoctorPreference(normalizedTranscript, session, runtimeDoctors);
            const specialization = mapSpecialization(normalizedTranscript, runtimeDoctors);

            if (directDoctor) {
              const selectedDoctor = runtimeDoctors.find((doctor) => doctor.name === directDoctor.selectedDoctor) ?? null;
              session = updateSession(session, {
                selectedSpecialization: selectedDoctor?.specialization ?? session.selectedSpecialization,
                selectedDoctor: directDoctor.selectedDoctor,
                doctorPreference: directDoctor.doctorPreference
              });
              reply = withExtraInstructions(prompts.askDate, prompts);
              stage = "waiting_for_date";
              action = "capture_doctor_preference";
              latestIntent = "book_appointment";
            } else if (specialization) {
              session = updateSession(session, {
                selectedSpecialization: specialization.specialization,
                selectedDoctor: specialization.doctors[0]
              });
              reply = withExtraInstructions(prompts.askDoctorPreference, prompts);
              stage = "waiting_for_doctor_preference";
              action = "capture_specialization";
              latestIntent = "book_appointment";
            } else if (matchIntentStart(normalizedTranscript)) {
            reply = withExtraInstructions(prompts.askSpecialization, prompts);
            stage = "waiting_for_specialization";
            action = "capture_booking_intent";
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
            reply = withExtraInstructions(prompts.askDate, prompts);
            stage = "waiting_for_date";
            action = "capture_doctor_preference";
          } else if (specialization) {
            session = updateSession(session, {
              selectedSpecialization: specialization.specialization,
              selectedDoctor: specialization.doctors[0]
            });
            reply = withExtraInstructions(prompts.askDoctorPreference, prompts);
            stage = "waiting_for_doctor_preference";
            action = "capture_specialization";
          } else {
            reply = runtimeDoctors.length > 0
              ? `Available specializations include ${runtimeDoctors.map((doctor) => doctor.specialization).filter((value, index, array) => array.indexOf(value) === index).join(", ")}. Please choose one.`
              : withExtraInstructions(prompts.askSpecialization, prompts);
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
            reply = withExtraInstructions(prompts.askDate, prompts);
            stage = "waiting_for_date";
            action = "capture_doctor_preference";
          } else {
            reply = withExtraInstructions(prompts.askDoctorPreference, prompts);
            action = "reprompt_doctor_preference";
          }
          break;
        }

        case "waiting_for_date": {
          const date = mapDateFlexible(normalizedTranscript);

          if (date) {
            session = updateSession(session, { preferredDate: date });
            reply = withExtraInstructions(prompts.askTime, prompts);
            stage = "waiting_for_time";
            action = "capture_date";
          } else {
            reply = withExtraInstructions(prompts.askDate, prompts);
            action = "reprompt_date";
          }
          break;
        }

        case "waiting_for_time": {
          const time = mapTimeFlexible(normalizedTranscript);

          if (time) {
            session = updateSession(session, { preferredTime: time });
            reply = withExtraInstructions(prompts.askPatientName, prompts);
            stage = "waiting_for_patient_name";
            action = "capture_time";
          } else {
            reply = withExtraInstructions(prompts.askTime, prompts);
            action = "reprompt_time";
          }
          break;
        }

        case "waiting_for_patient_name": {
          const patientName = extractPatientName(input.transcript);

          if (patientName) {
            session = updateSession(session, { patientName });
            reply = withExtraInstructions(prompts.askMobile, prompts);
            stage = "waiting_for_mobile";
            action = "capture_patient_name";
          } else {
            reply = withExtraInstructions(prompts.askPatientName, prompts);
            action = "reprompt_patient_name";
          }
          break;
        }

        case "waiting_for_mobile": {
          const mobile = resolveMobile(input.transcript, session.callerNumber, session.contactNumber);

          if (mobile) {
            session = updateSession(session, { contactNumber: mobile });
            reply = withExtraInstructions(prompts.askPatientType, prompts);
            stage = "waiting_for_patient_type";
            action = "capture_mobile";
          } else {
            reply = withExtraInstructions(prompts.askMobile, prompts);
            action = "reprompt_mobile";
          }
          break;
        }

        case "waiting_for_patient_type": {
          const patientType = mapPatientType(normalizedTranscript);

          if (patientType) {
            session = updateSession(session, { patientType });
            reply = buildConfirmationSummary(session, prompts);
            stage = "confirming";
            action = "capture_patient_type";
          } else {
            reply = withExtraInstructions(prompts.askPatientType, prompts);
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
            reply = buildConfirmationSummary(session, prompts);
            action = "reprompt_confirmation";
          }
          break;
        }

        case "booked":
          reply = prompts.bookingAlreadyComplete;
          action = "booking_already_complete";
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



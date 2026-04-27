import { CallLogModel, DoctorModel } from "@ai-hospital/shared-db";
import { llmFactory, type LLMConfig } from "./provider-factory";
import { createUsageLedgerEntry, summarizeUsageLedger, type UsageEventInput, type UsageLedgerEntry } from "./costing";
import { resolveAvailability, type AppointmentSnapshot, type AvailabilityPromptTemplates, type AvailabilityRuntimeDoctor } from "./availability-resolver";
// ADDED:
import { inferCondition } from "./symptom-inference-engine";
import { appendCallQualityTrace } from "./call-quality-analyzer";

import { CallRepository, type BookingStage, type CallTurnAnalysis, type DemoSessionRecord, type SessionAppointmentSnapshot, type TranscriptEntry } from "../repositories/call-repository";

type DetectIntentResult = {
  intent: string;
  intents?: string[];
  confidence: number;
};

type HospitalIntentLabel =
  | "GREETING"
  | "BOOK_APPOINTMENT"
  | "RESCHEDULE_APPOINTMENT"
  | "CANCEL_APPOINTMENT"
  | "CHECK_AVAILABILITY"
  | "CLINIC_INFO"
  | "DOCTOR_INFO"
  | "REPORT_INQUIRY"
  | "APPOINTMENT_STATUS"
  | "PAYMENT_BILLING"
  | "EMERGENCY"
  | "HUMAN_ESCALATION"
  | "GOODBYE"
  | "PRESCRIPTION_RENEWAL"
  | "PATIENT_ADMISSION_STATUS"
  | "OT_SCHEDULING"
  | "TELECONSULT_REQUEST"
  | "LANGUAGE_SUPPORT"
  | "HEALTH_PACKAGE_BOOKING"
  | "REFERRAL_BOOKING"
  | "SECOND_OPINION"
  | "INSURANCE_INQUIRY"
  | "HOME_VISIT_REQUEST"
  | "DIGITAL_REPORT_DELIVERY"
  | "FOLLOW_UP_CARE";

type IntentLanguage = "en" | "hi" | "hinglish" | "gu";

type HospitalIntentEntities = {
  doctor_name: string | null;
  specialty: string | null;
  date: string | null;
  time: string | null;
  symptom: string | null;
  booking_for: "self" | "third_party";
  relation: string | null;
  urgency: "normal" | "elevated" | "immediate";
  language: IntentLanguage;
  visit_mode: "in_person" | "teleconsult" | "home_visit";
  fee_query: boolean;
  fee_context: string | null;
  info_topic: string | null;
};

type HospitalIntentResult = {
  intents: HospitalIntentLabel[];
  entities: HospitalIntentEntities;
  confidence: number;
};

type SemanticFallbackDecision = {
  intent: HospitalIntentLabel | "UNKNOWN";
  reply_mode: "prompt" | "freeform";
  prompt_key: string | null;
  reply: string | null;
  language: IntentLanguage;
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
  llmFallbackEnabled?: boolean;
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
  bookingConfirmationSummary: string;
  bookingFinalSummary: string;
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
  availableDoctors: string;
  doctorDisambiguation: string;
  partialMobilePrompt: string;
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
  noActiveAppointmentSpecific: string;
  cancelAskDetails: string;
  cancelAskPatientName: string;
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
  bookingConfirmationSummary: "{{confirmPrefix}} {{date}} {{timePhrase}} Dr. {{doctor}} ke saath booking hai, naam {{patientName}}, aur contact number {{contactNumber}} rahega. Sahi hai?",
  bookingFinalSummary: "{{bookingConfirmed}} {{date}} {{timePhrase}} Dr. {{doctor}} ke saath appointment booked hai. Reference last 4: {{reference}}.",
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
  availableDoctors: "Humare paas {{doctorList}} available hain. Kaunsa doctor chahiye?",
  doctorDisambiguation: "Batayiye, kaunse doctor se appointment leni hai? Humare yaha {{doctorOptions}} available hain.",
  partialMobilePrompt: "{{digits}} mila. Baaki {{remainingDigits}} digit bata dijiye.",
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
  noActiveAppointmentSpecific: "Is number par {{criteria}} ke liye koi active appointment nahi mili.",
  cancelAskDetails: "Kaunsi appointment cancel karni hai? Patient name, doctor name, ya din bata dijiye.",
  cancelAskPatientName: "{{criteria}} ke liye kis patient ke naam par appointment cancel karni hai?",
  cancelConfirm: "Aapki booking {{appointment}} ke liye hai. Kya main ise cancel kar doon?",
  cancelDeclined: "Theek hai, appointment cancel nahi ki gayi. Koi aur madad chahiye ho to bata dijiye.",
  cancelMissingBooking: "Active booking nahi mili. Koi aur madad chahiye ho to bata dijiye.",
  cancelFinal: "Theek hai, {{appointment}} wali appointment cancel kar di gayi hai. Reference last 4: {{reference}}.",
  extraInstructions: ""
} as const;

const GUJARATI_PROMPT_DEFAULTS: Partial<ConversationPrompts> = {
  askSpecialization: "તમારે કયા ડોક્ટર અથવા કઈ વિશેષતા માટે અપોઇન્ટમેન્ટ લેવી છે?",
  askDoctorPreference: "તમારે કોઈ ચોક્કસ ડોક્ટર જોઈએ છે કે નજીકના ઉપલબ્ધ ડોક્ટર ચાલશે?",
  askDate: "તમારે કયા દિવસે અપોઇન્ટમેન્ટ જોઈએ છે?",
  askTime: "તમારે સવાર, બપોર કે સાંજનો કયો સમય જોઈએ છે?",
  askPatientName: "કૃપા કરીને દર્દીનું નામ કહો.",
  askMobile: "કૃપા કરીને મોબાઇલ નંબર કહો.",
  askPatientType: "આ પહેલી વાર આવી રહ્યા છો કે ફોલો અપ?",
  confirmPrefix: "બરાબર, હું એક વાર વિગતો કન્ફર્મ કરી દઉં.",
  bookingConfirmed: "થઈ ગયું. તમારી અપોઇન્ટમેન્ટની નોંધ અપડેટ થઈ ગઈ છે.",
  bookingConfirmationSummary: "{{confirmPrefix}} {{date}} {{timePhrase}} {{doctor}} સાથે અપોઇન્ટમેન્ટ છે, દર્દીનું નામ {{patientName}}, અને સંપર્ક નંબર {{contactNumber}} રહેશે. સાચું છે?",
  bookingFinalSummary: "{{bookingConfirmed}} {{date}} {{timePhrase}} {{doctor}} સાથે અપોઇન્ટમેન્ટ નક્કી થઈ ગઈ છે. રેફરન્સના છેલ્લાં 4: {{reference}}.",
  bookingCancelled: "બરાબર, અપોઇન્ટમેન્ટની વિનંતી રદ કરી દીધી છે. નવી અપોઇન્ટમેન્ટ જોઈએ તો કહેજો.",
  bookingAlreadyComplete: "તમારી અપોઇન્ટમેન્ટની વિનંતી પહેલેથી કન્ફર્મ છે. ફોન કરવા બદલ આભાર.",
  bookingAlreadyCancelled: "આ અપોઇન્ટમેન્ટ પહેલેથી રદ થઈ ગઈ છે. નવી અપોઇન્ટમેન્ટ માટે કહેજો.",
  transferMessage: "હું તમને reception સાથે connect કરું છું.",
  goodbyeMessage: "આભાર. નમસ્તે.",
  confirmRememberedDoctor: "{{doctor}} માટે જ અપોઇન્ટમેન્ટ કરવી છે ને?",
  confirmRememberedDay: "{{day}} માટે જ જોવું છે?",
  callerNumberConfirmation: "અપોઇન્ટમેન્ટ માટે આ જ નંબર વાપરું? {{maskedNumber}}.",
  callerReuseConfirmation: "પાછલી મુલાકાતનો સંપર્ક નંબર વાપરું? {{maskedNumber}}.",
  silenceRetryWithSlots: "તમે {{slotChoices}}માંથી પસંદ કરી શકો છો. હું રાહ જોઈ રહી છું.",
  silenceRetryDate: "{{day}} જ રાખવો છે કે બીજો દિવસ? હું રાહ જોઈ રહી છું.",
  silenceRetryDoctor: "{{doctor}} માટે જ અપોઇન્ટમેન્ટ કરવી છે ને?",
  silenceRetryGeneric: "{{stagePrompt}} હું રાહ જોઈ રહી છું.",
  recoverySpecialization: "ડોક્ટર અથવા વિભાગ સ્પષ્ટ નથી આવ્યો. {{specializations}}માંથી કહો.",
  recoveryTimeWithSlots: "સમય કન્ફર્મ કરવો હતો. {{slotChoices}}માંથી કયો રાખું?",
  recoveryTimeGeneric: "સમય કન્ફર્મ કરવો હતો. સવાર જોઈએ કે બપોર?",
  recoveryDateWithMemory: "{{day}} જ રાખવો છે કે બીજો દિવસ?",
  recoveryDateGeneric: "દિવસ કન્ફર્મ કરવો હતો. કયા દિવસની અપોઇન્ટમેન્ટ જોઈએ?",
  recoveryDoctorWithMemory: "{{doctor}} માટે જ અપોઇન્ટમેન્ટ કરવી છે ને?",
  recoveryPatientName: "નામ સ્પષ્ટ નથી આવ્યું. કયા નામથી અપોઇન્ટમેન્ટ કરું?",
  recoveryMobile: "મોબાઇલ નંબર સ્પષ્ટ નથી આવ્યો. એક વાર નંબર કહો.",
  recoveryConfirmation: "કન્ફર્મ કરવું હતું. વિગતો સાચી છે?",
  availableDoctors: "અમારા પાસે {{doctorList}} ઉપલબ્ધ છે. કયા ડોક્ટર જોઈએ?",
  doctorDisambiguation: "કયા ડોક્ટર સાથે અપોઇન્ટમેન્ટ લેવી છે? અમારા પાસે {{doctorOptions}} ઉપલબ્ધ છે.",
  partialMobilePrompt: "{{digits}} મળ્યા. બાકી {{remainingDigits}} અંક કહો.",
  availabilityExactSlotAvailable: "{{time}} નો સ્લોટ ઉપલબ્ધ છે.",
  availabilitySlotAvailable: "{{day}} {{timeContext}}{{slot}} નો સ્લોટ ઉપલબ્ધ છે.",
  availabilityTimeFull: "{{requestedTime}} ઉપલબ્ધ નથી. {{alternativeFrame}}. કયો રાખું?",
  availabilityAlternativeSameBucket: "{{slot1}} અને {{slot2}} ઉપલબ્ધ છે",
  availabilityAlternativeDifferentBucket: "{{slot1}} {{bucket1}} માં છે અને {{slot2}} થોડું પછી {{bucket2}} માં હશે",
  availabilityDayUnavailableWithNext: "{{day}} એ ડોક્ટર ઉપલબ્ધ નથી. {{nextDay}} માં {{slotPreview}} મળી શકે છે. {{nextDay}} જોઈએ?",
  availabilityDayUnavailableNoNext: "{{day}} એ ડોક્ટર ઉપલબ્ધ નથી. કોઈ બીજો ડોક્ટર જોઈએ?",
  availabilitySlotsFullWithNext: "{{day}} ના સ્લોટ ભરાઈ ગયા છે. {{nextDay}} માં {{slotPreview}} મળી શકે છે. એ જોઈએ?",
  availabilitySlotsFullNoNext: "{{day}} ના સ્લોટ ભરાઈ ગયા છે. કોઈ બીજો ડોક્ટર જોઈએ?",
  availabilityBookingDisabled: "{{doctor}} માટે અપોઇન્ટમેન્ટ હમણાં રિસેપ્શનથી કન્ફર્મ થશે. હું જોડાવી શકું છું.",
  rescheduleNoActiveBooking: "આ નંબર પર કોઈ active appointment મળી નથી. નવી અપોઇન્ટમેન્ટ book કરવી હોય તો કહેજો.",
  rescheduleFoundBooking: "તમારી અપોઇન્ટમેન્ટ {{appointment}} માટે છે. કયા દિવસે ફરીથી નક્કી કરવી છે?",
  rescheduleAskNewDay: "કયા દિવસે ફરીથી નક્કી કરવી છે? સોમવારથી રવિવારમાંથી દિવસ કહો.",
  rescheduleMissingBooking: "Active booking ની doctor વિગતો સ્પષ્ટ નથી મળી. રિસેપ્શનથી કન્ફર્મ કરવું પડશે.",
  rescheduleBookingDisabled: "{{doctor}} માટે reschedule હમણાં રિસેપ્શનથી કન્ફર્મ થશે. હું રિસેપ્શન સાથે જોડાવી શકું છું.",
  rescheduleSlotsAvailable: "{{availabilityReply}} {{slotChoices}}માંથી કયો slot રાખું?",
  rescheduleAskSlot: "{{slotChoices}}માંથી કયો slot રાખું?",
  rescheduleConfirm: "{{day}} {{slot}} પર {{doctor}} સાથે ફરીથી નક્કી કરી દઉં?",
  rescheduleFinal: "થઈ ગયું. તમારી અપોઇન્ટમેન્ટ {{day}} {{slot}} પર {{doctor}} સાથે ફરીથી નક્કી થઈ ગઈ છે. રેફરન્સના છેલ્લાં 4: {{reference}}.",
  rescheduleDeclined: "બરાબર, reschedule હમણાં રદ કરી દીધું. નવી અપોઇન્ટમેન્ટ અથવા બીજી મદદ જોઈએ તો કહેજો.",
  rescheduleAlreadyComplete: "તમારી અપોઇન્ટમેન્ટ પહેલેથી ફરીથી નક્કી થઈ ચૂકી છે. આભાર.",
  cancelNoActiveBooking: "આ નંબર પર કોઈ active appointment મળી નથી. નવી અપોઇન્ટમેન્ટ book કરવી હોય તો કહેજો.",
  noActiveAppointmentSpecific: "આ નંબર પર {{criteria}} માટે કોઈ active appointment મળી નથી.",
  cancelAskDetails: "કઈ અપોઇન્ટમેન્ટ રદ કરવી છે? દર્દીનું નામ, ડોક્ટરનું નામ, અથવા કયો દિવસ હતો એ કહો.",
  cancelAskPatientName: "{{criteria}} માટે કયા દર્દીના નામે અપોઇન્ટમેન્ટ રદ કરવી છે?",
  cancelConfirm: "તમારી અપોઇન્ટમેન્ટ {{appointment}} માટે છે. શું હું તેને રદ કરી દઉં?",
  cancelDeclined: "બરાબર, અપોઇન્ટમેન્ટ રદ કરી નથી. બીજી મદદ જોઈએ તો કહેજો.",
  cancelMissingBooking: "કોઈ active booking મળી નથી. બીજી મદદ જોઈએ તો કહેજો.",
  cancelFinal: "બરાબર, {{appointment}} વાળી અપોઇન્ટમેન્ટ રદ કરી દીધી છે. રેફરન્સના છેલ્લાં 4: {{reference}}.",
  extraInstructions: ""
};

const ENGLISH_PROMPT_DEFAULTS: Partial<ConversationPrompts> = {
  askSpecialization: "Which doctor or specialization do you need an appointment for?",
  askDoctorPreference: "Do you want a specific doctor, or should I find the earliest available doctor?",
  askDate: "Which day would you like the appointment?",
  askTime: "Do you prefer morning, afternoon, or evening?",
  askPatientName: "Please tell me the patient's name.",
  askMobile: "Please tell me the mobile number.",
  askPatientType: "Is this a new patient or a follow-up?",
  confirmPrefix: "Okay, let me confirm the details once.",
  bookingConfirmed: "Done. Your booking request has been updated on the dashboard.",
  bookingConfirmationSummary: "{{confirmPrefix}} The booking is for {{date}} {{time}} with Dr. {{doctor}}, patient name {{patientName}}, and contact number {{contactNumber}}. Is that correct?",
  bookingFinalSummary: "{{bookingConfirmed}} Your appointment is booked for {{date}} {{time}} with Dr. {{doctor}}. Reference last 4: {{reference}}.",
  bookingCancelled: "Okay, I have cancelled the booking request. Tell me if you need a new appointment.",
  bookingAlreadyComplete: "Your appointment request is already confirmed. Thank you for calling.",
  bookingAlreadyCancelled: "This booking is already cancelled. Tell me if you need a new appointment.",
  transferMessage: "I will connect you with reception.",
  goodbyeMessage: "Thank you. Goodbye.",
  confirmRememberedDoctor: "Should I book it with {{doctor}}?",
  confirmRememberedDay: "Should I check for {{day}}?",
  callerNumberConfirmation: "Should I use this current number for booking? {{maskedNumber}}.",
  callerReuseConfirmation: "Should I use the contact details from your previous visit? {{maskedNumber}}.",
  silenceRetryWithSlots: "You can choose from {{slotChoices}}. I am waiting.",
  silenceRetryDate: "Should I keep {{day}}, or choose another day? I am waiting.",
  silenceRetryDoctor: "Should I book it with {{doctor}}?",
  silenceRetryGeneric: "{{stagePrompt}} I am waiting.",
  recoverySpecialization: "The doctor or department was not clear. Please choose from {{specializations}}.",
  recoveryTimeWithSlots: "I need to confirm the time. Which one should I keep from {{slotChoices}}?",
  recoveryTimeGeneric: "I need to confirm the time. Do you want morning or afternoon?",
  recoveryDateWithMemory: "Should I keep {{day}}, or choose another day?",
  recoveryDateGeneric: "I need to confirm the day. Which day would you like?",
  recoveryDoctorWithMemory: "Should I book it with {{doctor}}?",
  recoveryPatientName: "The name was not clear. Which name should I use for the booking?",
  recoveryMobile: "The mobile number was not clear. Please say the number once.",
  recoveryConfirmation: "I need to confirm. Are the details correct?",
  availableDoctors: "We have {{doctorList}} available. Which doctor would you like?",
  doctorDisambiguation: "Which doctor would you like an appointment with? We have {{doctorOptions}} available.",
  partialMobilePrompt: "{{digits}} received. Please say the remaining {{remainingDigits}} digits.",
  availabilityExactSlotAvailable: "{{time}} is available.",
  availabilitySlotAvailable: "{{day}} {{timeContext}}{{slot}} is available.",
  availabilityTimeFull: "{{requestedTime}} is not available. {{alternativeFrame}}. Which one should I keep?",
  availabilityAlternativeSameBucket: "{{slot1}} and {{slot2}} are available",
  availabilityAlternativeDifferentBucket: "{{slot1}} is in {{bucket1}} and {{slot2}} is later in {{bucket2}}",
  availabilityDayUnavailableWithNext: "The doctor is not available on {{day}}. {{slotPreview}} may be available on {{nextDay}}. Should I check {{nextDay}}?",
  availabilityDayUnavailableNoNext: "The doctor is not available on {{day}}. Should I check another doctor?",
  availabilitySlotsFullWithNext: "{{day}} slots are full. {{slotPreview}} may be available on {{nextDay}}. Should I check that?",
  availabilitySlotsFullNoNext: "{{day}} slots are full. Should I check another doctor?",
  availabilityBookingDisabled: "Booking for {{doctor}} will be confirmed by reception. I can connect you.",
  rescheduleNoActiveBooking: "I could not find an active appointment for this number. Tell me if you want to book a new appointment.",
  rescheduleFoundBooking: "Your booking is for {{appointment}}. Which day should I reschedule it to?",
  rescheduleAskNewDay: "Which day should I reschedule it to? Please say a day from Monday to Sunday.",
  rescheduleMissingBooking: "The active booking doctor details were not clear. Reception will need to confirm this.",
  rescheduleBookingDisabled: "Rescheduling for {{doctor}} will be confirmed by reception. I can connect you.",
  rescheduleSlotsAvailable: "{{availabilityReply}} Which slot should I keep from {{slotChoices}}?",
  rescheduleAskSlot: "Which slot should I keep from {{slotChoices}}?",
  rescheduleConfirm: "Should I reschedule it to {{day}} {{slot}} with Dr. {{doctor}}?",
  rescheduleFinal: "Done. Your appointment has been rescheduled to {{day}} {{slot}} with Dr. {{doctor}}. Reference last 4: {{reference}}.",
  rescheduleDeclined: "Okay, I have cancelled the reschedule for now. Tell me if you need a new appointment or any other help.",
  rescheduleAlreadyComplete: "Your appointment is already rescheduled. Thank you.",
  cancelNoActiveBooking: "I could not find an active appointment for this number. Tell me if you want to book a new appointment.",
  noActiveAppointmentSpecific: "I could not find an active appointment for {{criteria}} on this number.",
  cancelAskDetails: "Which appointment should I cancel? Please tell me the patient name, doctor name, or date.",
  cancelAskPatientName: "For {{criteria}}, which patient name should I cancel the appointment for?",
  cancelConfirm: "Your booking is for {{appointment}}. Should I cancel it?",
  cancelDeclined: "Okay, I have not cancelled the appointment. Tell me if you need anything else.",
  cancelMissingBooking: "I could not find an active booking. Tell me if you need anything else.",
  cancelFinal: "Okay, I have cancelled the appointment for {{appointment}}. Reference last 4: {{reference}}.",
  extraInstructions: ""
};

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
    pendingContactNumber: null,
    partialMobileDigits: null,
    bookingContactConfirmed: false,
    bookingContactConfirmationPending: false,
    availabilityCheckKey: null,
    availabilityOfferedDate: null,
    availabilityOfferedTime: null,
    availabilityOfferedSlots: [],
    cancel_lookup_doctor: null,
    cancel_lookup_date: null,
    cancel_lookup_time: null,
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
    qualityTrace: [],
    qualitySummary: {
      score: 100,
      severity: "info",
      issueCount: 0,
      highIssueCount: 0,
      tags: [],
      updatedAt: null
    },
    createdAt,
    updatedAt: createdAt
  };
}

function normalizeTranscript(transcript: string): string {
  return transcript
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/à¥¤/g, " ")
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
    llmFallbackEnabled: clinicSettings?.intelligenceSettings?.llmFallbackEnabled ?? true,
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

  return sanitizePromptDoctorPrefixForSpeech(
    applyPromptLanguagePresetFallback(prompts, resolveConfiguredPromptLanguage(clinicSettings))
  );
}

function sanitizePromptDoctorPrefixForSpeech(prompts: ConversationPrompts): ConversationPrompts {
  if (!isGujaratiPromptSet(prompts)) {
    return prompts;
  }

  const removeDoctorPrefix = (value: string) => value.replace(/\bDr\.?\s+\{\{doctor\}\}/g, "{{doctor}}");

  return {
    ...prompts,
    bookingConfirmationSummary: removeDoctorPrefix(prompts.bookingConfirmationSummary),
    bookingFinalSummary: removeDoctorPrefix(prompts.bookingFinalSummary),
    rescheduleConfirm: removeDoctorPrefix(prompts.rescheduleConfirm),
    rescheduleFinal: removeDoctorPrefix(prompts.rescheduleFinal)
  };
}

function readProviderLanguage(providerConfig: unknown): string {
  if (!providerConfig || typeof providerConfig !== "object") {
    return "";
  }

  const language = (providerConfig as { language?: unknown }).language;
  return typeof language === "string" ? language.toLowerCase() : "";
}

function resolveConfiguredPromptLanguage(clinicSettings: ClinicSettings | null | undefined): "en" | "hi" | "gu" | null {
  const promptPresetLanguage = (clinicSettings?.supportedLanguage ?? "").toLowerCase();

  if (promptPresetLanguage.includes("gu")) return "gu";
  if (promptPresetLanguage.includes("hi") || promptPresetLanguage.includes("hinglish")) return "hi";
  if (promptPresetLanguage.includes("en")) return "en";

  const ttsLanguage = readProviderLanguage(clinicSettings?.ttsProviders);
  const sttLanguage = readProviderLanguage(clinicSettings?.sttProviders);
  const providerLanguage = `${ttsLanguage} ${sttLanguage}`;

  if (providerLanguage.includes("gu")) return "gu";
  if (providerLanguage.includes("hi")) return "hi";
  if (providerLanguage.includes("en")) return "en";

  return null;
}

function hasGujaratiText(value: string): boolean {
  return /[\u0A80-\u0AFF]/u.test(value);
}

function hasDevanagariText(value: string): boolean {
  return /[\u0900-\u097F]/u.test(value);
}

function looksHinglishPrompt(value: string): boolean {
  return /\b(kis|kaunsa|kaunsi|chahiye|karni|karna|bata|dijiye|theek|haan|nahi|aap|mujhe|doctor se|ke liye|ke saath|par|rahega)\b/i.test(value);
}

function applyPromptLanguagePresetFallback(prompts: ConversationPrompts, language: "en" | "hi" | "gu" | null): ConversationPrompts {
  const localized = { ...prompts };

  if (language === "gu") {
    for (const [key, value] of Object.entries(GUJARATI_PROMPT_DEFAULTS) as Array<[keyof ConversationPrompts, string]>) {
      const current = localized[key];

      if (!current || !hasGujaratiText(current)) {
        localized[key] = value;
      }
    }

    return localized;
  }

  if (language !== "en") {
    return prompts;
  }

  for (const [key, value] of Object.entries(ENGLISH_PROMPT_DEFAULTS) as Array<[keyof ConversationPrompts, string]>) {
    const current = localized[key];

    if (!current || hasGujaratiText(current) || hasDevanagariText(current) || looksHinglishPrompt(current)) {
      localized[key] = value;
    }
  }

  return localized;
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
    "emergency_escalation",
    "transfer_call",
    "booking_already_complete",
    "booking_cancelled"
  ]).has(action);
}

function shouldUseSemanticLlmFallback(action: string, intelligence: Required<IntelligenceSettings>): boolean {
  return intelligence.llmFallbackEnabled && (action === "demo_fallback" || isFallbackAction(action) || action === "clarify");
}

function appendLlmUsage(
  session: DemoSessionRecord,
  llmConfig: LLMConfig | null | undefined,
  callerText: string,
  replyText: string
): DemoSessionRecord {
  if (!llmConfig || !llmConfig.primaryProvider || llmConfig.primaryProvider === "mock") {
    return session;
  }

  return updateSession(session, {
    usageLedger: [
      ...(session.usageLedger ?? []),
      createUsageLedgerEntry({
        service: "llm",
        provider: llmConfig.primaryProvider,
        model: llmConfig.model,
        text: `${callerText}\n${replyText}`,
        quantity: replyText.length
      })
    ]
  });
}

function isFallbackAction(action: string): boolean {
  return action === "greet_and_prompt" || action === "reset_to_greeting" || action.startsWith("reprompt_");
}

function matchHumanTransferIntent(normalizedTranscript: string): boolean {
  if ([
    "\u0ab9\u0acd\u0aaf\u0ac1\u0aae\u0aa8",
    "\u0a8f\u0a9c\u0aa8\u0acd\u0a9f",
    "\u0ab0\u0abf\u0ab8\u0ac7\u0aaa\u0acd\u0ab6\u0aa8",
    "\u0ab0\u0abf\u0ab8\u0ac7\u0aaa\u0acd\u0ab6\u0aa8\u0abf\u0ab8\u0acd\u0a9f",
    "\u0ab8\u0acd\u0a9f\u0abe\u0aab \u0ab8\u0abe\u0aa5\u0ac7 \u0ab5\u0abe\u0aa4",
    "\u0a95\u0acb\u0a88 \u0aae\u0abe\u0aa3\u0ab8 \u0ab8\u0abe\u0aa5\u0ac7 \u0ab5\u0abe\u0aa4",
    "\u0a95\u0acb\u0a88 \u0aae\u0abe\u0aa3\u0ab8 \u0a9c\u0acb\u0aa1\u0ac7 \u0ab5\u0abe\u0aa4",
    "\u0aae\u0abe\u0aa3\u0ab8 \u0a9c\u0acb\u0aa1\u0ac7 \u0ab5\u0abe\u0aa4",
    "\u0aae\u0abe\u0aa3\u0ab8 \u0ab8\u0abe\u0aa5\u0ac7 \u0ab5\u0abe\u0aa4",
    "\u0ab0\u0abf\u0ab8\u0ac7\u0aaa\u0acd\u0ab6\u0aa8 \u0a9c\u0acb\u0aa1\u0ac7 \u0ab5\u0abe\u0aa4",
    "\u0ab0\u0abf\u0ab8\u0ac7\u0aaa\u0acd\u0ab6\u0aa8\u0abf\u0ab8\u0acd\u0a9f \u0a9c\u0acb\u0aa1\u0ac7 \u0ab5\u0abe\u0aa4",
    "\u0a95\u0ab0\u0abe\u0ab5\u0acb",
    "\u0ab9\u0ab0\u0abe\u0ab5\u0acb",
    "àª®àª¾àª£àª¸ àª¸àª¾àª¥à«‡ àªµàª¾àª¤",
    "àª®àª¾àª£àª¸ àªœà«‹àª¡à«‡ àªµàª¾àª¤",
    "àª•à«‹àªˆ àª®àª¾àª£àª¸ àªœà«‹àª¡à«‡ àªµàª¾àª¤",
    "àª°àª¿àª¸à«‡àªªà«àª¶àª¨ àª¸àª¾àª¥à«‡ àªµàª¾àª¤",
    "àª°àª¿àª¸à«‡àªªà«àª¶àª¨ àªœà«‹àª¡à«‡ àªµàª¾àª¤",
    "àª«à«àª°àª¨à«àªŸ àª¡à«‡àª¸à«àª•",
    "àª“àªªàª°à«‡àªŸàª°",
    "àª²àª¾àª‡àªµ àªàªœàª¨à«àªŸ",
    "àª•à«‹àª² àªŸà«àª°àª¾àª¨à«àª¸àª«àª°",
    "àª•àª¨à«‡àª•à«àªŸ àª•àª°à«€ àª¦à«‹",
    "\u0ab5\u0abe\u0aa4 \u0a95\u0ab0\u0abe\u0ab5\u0acb",
    "\u0a95\u0aa8\u0ac7\u0a95\u0acd\u0a9f \u0a95\u0ab0\u0acb",
    "\u0a9f\u0acd\u0ab0\u0abe\u0aa8\u0acd\u0ab8\u0aab\u0ab0 \u0a95\u0ab0\u0acb"
  ].some((phrase) => normalizedTranscript.includes(phrase))) {
    return true;
  }

  const hasGujaratiHumanNoun = [
    "\u0aae\u0abe\u0aa3\u0ab8",
    "\u0aae\u0abe\u0aa8\u0ab8",
    "\u0ab0\u0abf\u0ab8\u0ac7\u0aaa\u0acd\u0ab6\u0aa8",
    "\u0ab0\u0abf\u0ab8\u0ac7\u0aaa\u0acd\u0ab6\u0aa8\u0abf\u0ab8\u0acd\u0a9f",
    "\u0ab8\u0acd\u0a9f\u0abe\u0aab",
    "\u0a91\u0aaa\u0ab0\u0ac7\u0a9f\u0ab0",
    "\u0aab\u0acd\u0ab0\u0aa8\u0acd\u0a9f \u0aa1\u0ac7\u0ab8\u0acd\u0a95"
  ].some((phrase) => normalizedTranscript.includes(phrase));
  const hasGujaratiTransferVerb = [
    "\u0ab5\u0abe\u0aa4",
    "\u0a95\u0ab0\u0abe\u0ab5\u0acb",
    "\u0ab9\u0ab0\u0abe\u0ab5\u0acb",
    "\u0a9c\u0acb\u0aa1\u0ac7",
    "\u0a95\u0aa8\u0ac7\u0a95\u0acd\u0a9f",
    "\u0a9f\u0acd\u0ab0\u0abe\u0aa8\u0acd\u0ab8\u0aab\u0ab0"
  ].some((phrase) => normalizedTranscript.includes(phrase));

  if (hasGujaratiHumanNoun && hasGujaratiTransferVerb) {
    return true;
  }

  return [
    "human",
    "human agent",
    "human se baat",
    "human agent se baat",
    "agent",
    "agent se baat",
    "agent baat",
    "representative",
    "representative se baat",
    "operator",
    "operator se baat",
    "reception",
    "reception se baat",
    "receptionist",
    "receptionist se baat",
    "staff se baat",
    "front desk",
    "front desk se baat",
    "desk se baat",
    "live agent",
    "call connect",
    "call transfer karo",
    "person se baat",
    "insaan se baat",
    "kisi aadmi se baat",
    "baat kara do",
    "baat karwa do",
    "connect kar do",
    "connect kar dijiye",
    "transfer kar do",
    "transfer kar dijiye",
    "call transfer",
    "\u0939\u094d\u092f\u0942\u092e\u0928",
    "\u0939\u094d\u092f\u0942\u092e\u0928 \u090f\u091c\u0947\u0902\u091f",
    "\u0939\u094d\u092f\u0942\u092e\u0928 \u090f\u091c\u0947\u0902\u091f \u092c\u093e\u0924",
    "\u090f\u091c\u0947\u0902\u091f",
    "\u090f\u091c\u0947\u0902\u091f \u0938\u0947 \u092c\u093e\u0924",
    "\u090f\u091c\u0947\u0902\u091f \u092c\u093e\u0924",
    "\u0930\u093f\u0938\u0947\u092a\u094d\u0936\u0928",
    "\u0930\u093f\u0938\u0947\u092a\u094d\u0936\u0928 \u0938\u0947 \u092c\u093e\u0924",
    "\u0930\u093f\u0938\u0947\u092a\u094d\u0936\u0928\u093f\u0938\u094d\u091f",
    "\u0913\u092a\u0930\u0947\u091f\u0930",
    "\u0938\u094d\u091f\u093e\u092b \u0938\u0947 \u092c\u093e\u0924",
    "\u0915\u093f\u0938\u0940 \u0938\u0947 \u092c\u093e\u0924",
    "\u092c\u093e\u0924 \u0915\u0930\u093e \u0926\u094b",
    "\u092c\u093e\u0924 \u0915\u0930\u0935\u093e \u0926\u094b",
    "\u0915\u0928\u0947\u0915\u094d\u091f \u0915\u0930 \u0926\u094b",
    "\u091f\u094d\u0930\u093e\u0902\u0938\u092b\u0930 \u0915\u0930 \u0926\u094b"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function buildConfiguredSystemPrompt(
  session: DemoSessionRecord,
  prompts: ConversationPrompts,
  runtimeDoctors: RuntimeDoctor[],
  baseReply: string
): string {
  const doctorList = runtimeDoctors.map((doctor) => `${doctor.name} (${doctor.specialization})`).join(", ");

  return [
    "You are a live hospital receptionist AI for a real clinic or hospital.",
    "Your job is to sound calm, helpful, short, and professional on a phone call.",
    "You may reply in Gujarati, Hindi, Hinglish, or English based on the caller's language. Match the caller naturally.",
    "Reply with one concise spoken response only. Do not include JSON, labels, bullets, or analysis.",
    "Do not invent booking details. Keep the existing booking stage, slot facts, and collected details unchanged.",
    "If the rule-based pipeline already produced a good answer, improve only wording and clarity, not the facts.",
    "If the caller uses a new wording, slang, typo, STT error, or indirect phrase, infer the most likely intent and answer appropriately.",
    "Supported live-call intents include booking, reschedule, cancel, availability, clinic timings, doctor info, fees, reports, appointment status, human transfer, and emergency routing.",
    "If something is unclear, ask only one short clarifying question.",
    "Never give medical diagnosis. For emergencies or dangerous symptoms, prioritize urgent escalation.",
    "Never promise unavailable slots, prices, reports, or confirmations that are not already known.",
    "Tone rules: warm, respectful, efficient, receptionist-like, never robotic, never verbose.",
    `Current booking stage: ${session.bookingStage}.`,
    `Selected doctor: ${session.selectedDoctor ?? "not selected"}.`,
    `Selected specialization: ${session.selectedSpecialization ?? "not selected"}.`,
    `Preferred date: ${session.preferredDate ?? "not selected"}.`,
    `Preferred time: ${session.preferredTime ?? "not selected"}.`,
    `Patient name: ${session.patientName ?? "not collected"}.`,
    `Contact number: ${session.contactNumber ?? "not collected"}.`,
    `Available doctors: ${doctorList || "none configured"}.`,
    "When referring to the clinic's doctors or slots, use clinic-side phrasing like 'humare paas' / 'અમારા અહીં' rather than 'aap ke paas'.",
    `Configured prompt instructions: ${prompts.extraInstructions || "none"}.`,
    `Configured spoken language sample: ${prompts.askDate}`,
    `Latest caller utterance language should follow this sample style when suitable: ${prompts.askTime}`,
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

function buildSemanticFallbackSystemPrompt(
  transcript: string,
  session: DemoSessionRecord,
  prompts: ConversationPrompts,
  runtimeDoctors: RuntimeDoctor[],
  language: IntentLanguage
): string {
  const doctorList = runtimeDoctors.length
    ? runtimeDoctors.map((doctor) => `${doctor.name} (${doctor.specialization})`).join(", ")
    : "none configured";

  return [
    "You are the fallback brain for a live hospital receptionist AI.",
    "The rule-based flow was not fully confident. Your job is to understand the caller and decide the best safe next response.",
    "You must handle natural speech, Gujarati/Hindi/Hinglish/English mixing, typos, STT mistakes, short phrases, and unseen wording.",
    "Infer the most likely intent from messy real phone-call language.",
    "Your tone must stay receptionist-like: polite, short, warm, confident, and operational.",
    "Return JSON only. No markdown, no explanation, no extra text.",
    "Use this exact schema:",
    `{"intent":"BOOK_APPOINTMENT|RESCHEDULE_APPOINTMENT|CANCEL_APPOINTMENT|CHECK_AVAILABILITY|CLINIC_INFO|DOCTOR_INFO|REPORT_INQUIRY|APPOINTMENT_STATUS|PAYMENT_BILLING|EMERGENCY|HUMAN_ESCALATION|GOODBYE|PRESCRIPTION_RENEWAL|PATIENT_ADMISSION_STATUS|OT_SCHEDULING|TELECONSULT_REQUEST|LANGUAGE_SUPPORT|HEALTH_PACKAGE_BOOKING|REFERRAL_BOOKING|SECOND_OPINION|INSURANCE_INQUIRY|HOME_VISIT_REQUEST|DIGITAL_REPORT_DELIVERY|FOLLOW_UP_CARE|UNKNOWN","reply_mode":"prompt|freeform","prompt_key":"askSpecialization|askDoctorPreference|askDate|askTime|askPatientName|askMobile|askPatientType|confirmRememberedDoctor|confirmRememberedDay|callerNumberConfirmation|callerReuseConfirmation|silenceRetryWithSlots|silenceRetryDate|silenceRetryDoctor|silenceRetryGeneric|recoverySpecialization|recoveryTimeWithSlots|recoveryTimeGeneric|recoveryDateWithMemory|recoveryDateGeneric|recoveryDoctorWithMemory|recoveryPatientName|recoveryMobile|recoveryConfirmation|availableDoctors|doctorDisambiguation|partialMobilePrompt|none","reply":"string","language":"en|hi|hinglish|gu"}`,
    `Current booking stage: ${session.bookingStage}.`,
    `Selected doctor: ${session.selectedDoctor ?? "not selected"}.`,
    `Selected specialization: ${session.selectedSpecialization ?? "not selected"}.`,
    `Preferred date: ${session.preferredDate ?? "not selected"}.`,
    `Preferred time: ${session.preferredTime ?? "not selected"}.`,
    `Patient name: ${session.patientName ?? "not collected"}.`,
    `Contact number: ${session.contactNumber ?? "not collected"}.`,
    `Available doctors: ${doctorList}.`,
    `User language hint: ${language}.`,
    `Caller utterance: ${transcript}`,
    "Priority order:",
    "1. If one of the existing prompt-backed replies fits, return reply_mode prompt and choose the closest prompt_key.",
    "2. If the caller used a new wording but intent is still clear, return the correct intent and use either the nearest prompt or a short freeform reply.",
    "3. If the caller is asking about booking flow progress, ask only the next most useful question.",
    "4. If the caller mentions emergency, chest pain, breathing trouble, severe bleeding, unconsciousness, or similarly dangerous symptoms, prioritize EMERGENCY.",
    "5. If the caller wants a human, staff, operator, reception, or transfer, prioritize HUMAN_ESCALATION.",
    "6. Never invent booking details, doctor availability, reports, fees, medical advice, or confirmations.",
    "7. If unclear, ask one short clarifying question in the caller's language.",
    `Existing prompts: specialization="${prompts.askSpecialization}", doctorPreference="${prompts.askDoctorPreference}", date="${prompts.askDate}", time="${prompts.askTime}", patientName="${prompts.askPatientName}", mobile="${prompts.askMobile}", patientType="${prompts.askPatientType}", confirm="${prompts.confirmPrefix}", recovery="${prompts.recoveryConfirmation}", doctors="${prompts.availableDoctors}"`,
    "Important language behavior:",
    "If caller speaks Gujarati, answer in Gujarati.",
    "If caller speaks Hindi, answer in Hindi.",
    "If caller mixes Hinglish, answer in natural Hinglish.",
    "If caller speaks English, answer in English.",
    "Do not over-translate names, times, dates, or phone numbers.",
    "If the utterance is unrelated, ambiguous, or too new for the prompt set, use a simple human-style freeform reply that asks one short clarifying question in the user's language."
  ].join("\n");
}

function parseSemanticFallbackDecision(text: string, language: IntentLanguage): SemanticFallbackDecision | null {
  const trimmed = String(text || "").trim();

  const jsonText = (() => {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }
    return trimmed;
  })();

  try {
    const parsed = JSON.parse(jsonText) as Partial<SemanticFallbackDecision> & Record<string, unknown>;
    const allowedIntents = new Set<SemanticFallbackDecision["intent"]>([
      "BOOK_APPOINTMENT",
      "RESCHEDULE_APPOINTMENT",
      "CANCEL_APPOINTMENT",
      "CHECK_AVAILABILITY",
      "CLINIC_INFO",
      "DOCTOR_INFO",
      "REPORT_INQUIRY",
      "APPOINTMENT_STATUS",
      "PAYMENT_BILLING",
      "EMERGENCY",
      "HUMAN_ESCALATION",
      "GOODBYE",
      "PRESCRIPTION_RENEWAL",
      "PATIENT_ADMISSION_STATUS",
      "OT_SCHEDULING",
      "TELECONSULT_REQUEST",
      "LANGUAGE_SUPPORT",
      "HEALTH_PACKAGE_BOOKING",
      "REFERRAL_BOOKING",
      "SECOND_OPINION",
      "INSURANCE_INQUIRY",
      "HOME_VISIT_REQUEST",
      "DIGITAL_REPORT_DELIVERY",
      "FOLLOW_UP_CARE",
      "UNKNOWN"
    ]);
    const rawIntent = typeof parsed.intent === "string" ? parsed.intent.trim().toUpperCase().replace(/[\s-]+/g, "_") : "UNKNOWN";
    const intent = allowedIntents.has(rawIntent as SemanticFallbackDecision["intent"]) ? (rawIntent as SemanticFallbackDecision["intent"]) : "UNKNOWN";
    const replyMode = parsed.reply_mode === "prompt" || parsed.reply_mode === "freeform" ? parsed.reply_mode : "freeform";
    const promptKey = typeof parsed.prompt_key === "string" && parsed.prompt_key.trim() ? parsed.prompt_key.trim() : null;
    const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : null;
    const parsedLanguage = parsed.language === "en" || parsed.language === "hi" || parsed.language === "hinglish" || parsed.language === "gu"
      ? parsed.language
      : language;
    const confidence = typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence) ? parsed.confidence : 0.5;

    return {
      intent: intent as SemanticFallbackDecision["intent"],
      reply_mode: replyMode,
      prompt_key: promptKey,
      reply,
      language: parsedLanguage,
      confidence
    };
  } catch (_error) {
    return null;
  }
}

function renderSemanticPromptReply(
  decision: SemanticFallbackDecision,
  session: DemoSessionRecord,
  prompts: ConversationPrompts,
  runtimeDoctors: RuntimeDoctor[]
): string | null {
  switch (decision.prompt_key) {
    case "askSpecialization":
      return prompts.askSpecialization;
    case "askDoctorPreference":
      return prompts.askDoctorPreference;
    case "askDate":
      return prompts.askDate;
    case "askTime":
      return prompts.askTime;
    case "askPatientName":
      return prompts.askPatientName;
    case "askMobile":
      return prompts.askMobile;
    case "askPatientType":
      return prompts.askPatientType;
    case "confirmRememberedDoctor":
      return session.selectedDoctor ? renderPrompt(prompts.confirmRememberedDoctor, { doctor: formatDoctorNameForSpeech(session.selectedDoctor, prompts) }) : null;
    case "confirmRememberedDay":
      return session.preferredDate ? renderPrompt(prompts.confirmRememberedDay, { day: formatBookingDateForPrompt(session.preferredDate, prompts) }) : null;
    case "callerNumberConfirmation":
      return session.callerNumber ? renderPrompt(prompts.callerNumberConfirmation, { maskedNumber: maskMobile(session.callerNumber), number: session.callerNumber }) : null;
    case "callerReuseConfirmation":
      return session.callerNumber ? renderPrompt(prompts.callerReuseConfirmation, { maskedNumber: maskMobile(session.callerNumber), number: session.callerNumber }) : null;
    case "silenceRetryWithSlots":
      return session.availabilityOfferedSlots?.length
        ? renderPrompt(prompts.silenceRetryWithSlots, { slotChoices: slotChoiceText(session.availabilityOfferedSlots, prompts) })
        : null;
    case "silenceRetryDate":
      return session.preferredDate ? renderPrompt(prompts.silenceRetryDate, { day: formatBookingDateForPrompt(session.preferredDate, prompts) }) : null;
    case "silenceRetryDoctor":
      return session.selectedDoctor ? renderPrompt(prompts.silenceRetryDoctor, { doctor: formatDoctorNameForSpeech(session.selectedDoctor, prompts) }) : null;
    case "silenceRetryGeneric":
      return prompts.silenceRetryGeneric;
    case "recoverySpecialization":
      return renderPrompt(prompts.recoverySpecialization, {
        specializations: buildAvailableSpecializationsText(runtimeDoctors)
      });
    case "recoveryTimeWithSlots":
      return session.availabilityOfferedSlots?.length
        ? renderPrompt(prompts.recoveryTimeWithSlots, { slotChoices: slotChoiceText(session.availabilityOfferedSlots, prompts) })
        : null;
    case "recoveryTimeGeneric":
      return prompts.recoveryTimeGeneric;
    case "recoveryDateWithMemory":
      return session.preferredDate ? renderPrompt(prompts.recoveryDateWithMemory, { day: formatBookingDateForPrompt(session.preferredDate, prompts) }) : null;
    case "recoveryDateGeneric":
      return prompts.recoveryDateGeneric;
    case "recoveryDoctorWithMemory":
      return session.selectedDoctor ? renderPrompt(prompts.recoveryDoctorWithMemory, { doctor: formatDoctorNameForSpeech(session.selectedDoctor, prompts) }) : null;
    case "recoveryPatientName":
      return prompts.recoveryPatientName;
    case "recoveryMobile":
      return prompts.recoveryMobile;
    case "recoveryConfirmation":
      return prompts.recoveryConfirmation;
    case "availableDoctors":
      return buildAvailableDoctorsReply(runtimeDoctors, prompts);
    case "doctorDisambiguation":
      return buildAvailableDoctorsReply(runtimeDoctors, prompts);
    case "partialMobilePrompt":
      return session.partialMobileDigits?.length
        ? renderPrompt(prompts.partialMobilePrompt, { digits: session.partialMobileDigits, remainingDigits: Math.max(1, 10 - session.partialMobileDigits.length) })
        : null;
    default:
      return null;
  }
}

function buildAvailableSpecializationsText(runtimeDoctors: RuntimeDoctor[]): string {
  const specializations = (runtimeDoctors.length > 0 ? runtimeDoctors : FALLBACK_DOCTORS)
    .map((doctor) => doctor.specialization)
    .filter((value, index, array) => array.indexOf(value) === index);

  return specializations.join(", ");
}

async function applySemanticFallbackReply(
  transcript: string,
  session: DemoSessionRecord,
  clinicSettings: ClinicSettings | null | undefined,
  prompts: ConversationPrompts,
  runtimeDoctors: RuntimeDoctor[],
  fallbackReply: string,
  language: IntentLanguage
): Promise<{ reply: string; intent: string; action: string }> {
  const llmConfig = clinicSettings?.llmProviders;

  if (!llmConfig || !llmConfig.primaryProvider || llmConfig.primaryProvider === "mock") {
    return { reply: fallbackReply, intent: session.latestIntent ?? "unknown", action: "demo_fallback" };
  }

  try {
    const rawDecision = await llmFactory.generateReply(
      transcript,
      session,
      llmConfig,
      buildSemanticFallbackSystemPrompt(transcript, session, prompts, runtimeDoctors, language),
      async () => fallbackReply
    );

    const decision = parseSemanticFallbackDecision(rawDecision, language);
    if (!decision) {
      return { reply: fallbackReply, intent: session.latestIntent ?? "unknown", action: "demo_fallback" };
    }

    if (decision.reply_mode === "prompt") {
      const promptReply = renderSemanticPromptReply(decision, session, prompts, runtimeDoctors);
      if (promptReply) {
        return {
          reply: promptReply,
          intent: decision.intent,
          action: "semantic_prompt_reply"
        };
      }
    }

    if (decision.reply) {
      return {
        reply: decision.reply,
        intent: decision.intent,
        action: "semantic_freeform_reply"
      };
    }
  } catch (error) {
    console.warn(`[llm] semantic fallback failed. Error: ${(error as Error).message}`);
  }

  return { reply: fallbackReply, intent: session.latestIntent ?? "unknown", action: "demo_fallback" };
}

function containsAny(value: string, phrases: string[]): boolean {
  return phrases.some((phrase) => value.includes(phrase));
}

function detectIntentLanguage(transcript: string): IntentLanguage {
  if (/[\u0A80-\u0AFF]/u.test(transcript)) return "gu";
  if (/[\u0900-\u097F]/u.test(transcript)) return "hi";
  if (/\b(karna|karni|karvu|karavvu|chahiye|hai|hain|che|chhe|mane|sathe|malvu|mera|meri|mujhe|doctor se|kal|aaj|parso|available hai|ready hai)\b/i.test(transcript)) {
    return "hinglish";
  }

  return "en";
}

function detectEmergencySymptom(normalizedTranscript: string): string | null {
  const emergencyPhrases = [
    "chest pain",
    "heart pain",
    "breathing problem",
    "breath problem",
    "can't breathe",
    "cannot breathe",
    "unconscious",
    "severe bleeding",
    "heavy bleeding",
    "bleeding a lot",
    "saans nahi",
    "saans lene",
    "chhati mein dard",
    "chati mein dard",
    "behosh",
    "bahut bleeding",
    "\u0a9b\u0abe\u0aa4\u0ac0\u0aae\u0abe\u0a82 \u0aa6\u0ac1\u0a96\u0abe\u0ab5\u0acb",
    "\u0a9b\u0abe\u0aa4\u0ac0 \u0aa6\u0ac1\u0a96\u0ac7",
    "\u0ab6\u0acd\u0ab5\u0abe\u0ab8 \u0aa8\u0aa5\u0ac0",
    "\u0ab6\u0acd\u0ab5\u0abe\u0ab8 \u0aa4\u0a95\u0ab2\u0ac0\u0aab",
    "\u0aac\u0ac7\u0aad\u0abe\u0aa8",
    "\u0aaa\u0ac1\u0ab7\u0acd\u0a95\u0ab3 \u0ab0\u0a95\u0acd\u0aa4\u0ab8\u0acd\u0ab0\u0abe\u0ab5",
    "\u091b\u093e\u0924\u0940 \u092e\u0947\u0902 \u0926\u0930\u094d\u0926",
    "\u0938\u093e\u0902\u0938 \u0928\u0939\u0940\u0902",
    "\u0938\u093e\u0902\u0938 \u0924\u0915\u0932\u0940\u092b",
    "\u092c\u0947\u0939\u094b\u0936",
    "\u091c\u094d\u092f\u093e\u0926\u093e \u0916\u0942\u0928",
    "\u092c\u0939\u0941\u0924 \u0916\u0942\u0928"
  ];

  return emergencyPhrases.find((phrase) => normalizedTranscript.includes(phrase)) ?? null;
}

function detectRelation(normalizedTranscript: string): string | null {
  const relationMap: Array<[string, string[]]> = [
    ["wife", ["wife", "patni", "biwi", "\u0aaa\u0aa4\u0acd\u0aa8\u0ac0", "\u0aac\u0abe\u0aaf\u0aa1\u0ac0", "\u092a\u0924\u094d\u0928\u0940", "\u092c\u0940\u0935\u0940"]],
    ["husband", ["husband", "pati", "\u0aaa\u0aa4\u0abf", "\u092a\u0924\u093f"]],
    ["mother", ["mother", "mom", "mummy", "maa", "\u0aae\u0aae\u0acd\u0aae\u0ac0", "\u0aae\u0abe\u0aa4\u0abe", "\u092e\u092e\u094d\u092e\u0940", "\u092e\u093e\u0901"]],
    ["father", ["father", "dad", "papa", "\u0aaa\u0aaa\u0acd\u0aaa\u0abe", "\u0aaa\u0abf\u0aa4\u0abe", "\u092a\u093e\u092a\u093e", "\u092a\u093f\u0924\u093e"]],
    ["child", ["child", "son", "daughter", "beta", "beti", "\u0aac\u0ac7\u0a9f\u0abe", "\u0aac\u0ac7\u0a9f\u0ac0", "\u092c\u0947\u091f\u093e", "\u092c\u0947\u091f\u0940"]]
  ];

  for (const [relation, phrases] of relationMap) {
    if (containsAny(normalizedTranscript, phrases)) {
      return relation;
    }
  }

  return null;
}

function detectGeneralSymptom(normalizedTranscript: string): string | null {
  return [
    "fever",
    "cough",
    "cold",
    "skin rash",
    "rash",
    "headache",
    "stomach pain",
    "\u0aa4\u0abe\u0ab5",
    "\u0a96\u0abe\u0a82\u0ab8\u0ac0",
    "\u0ab8\u0ab0\u0aa6\u0ac0",
    "\u0aae\u0abe\u0aa5\u0abe\u0aa8\u0acb \u0aa6\u0ac1\u0a96\u0abe\u0ab5\u0acb",
    "\u0aaa\u0ac7\u0a9f\u0aae\u0abe\u0a82 \u0aa6\u0ac1\u0a96\u0abe\u0ab5\u0acb",
    "\u092c\u0941\u0916\u093e\u0930",
    "\u0916\u093e\u0902\u0938\u0940",
    "\u0938\u0930\u094d\u0926\u0940",
    "\u0938\u093f\u0930 \u0926\u0930\u094d\u0926",
    "\u092a\u0947\u091f \u0926\u0930\u094d\u0926"
  ].find((phrase) => normalizedTranscript.includes(phrase)) ?? null;
}

function detectFeeContext(normalizedTranscript: string): string | null {
  if (containsAny(normalizedTranscript, [
    "insurance",
    "insurence",
    "inshurans",
    "cashless",
    "cash less",
    "mediclaim",
    "tpa",
    "cghs",
    "corporate card",
    "\u0a87\u0aa8\u0acd\u0ab6\u0acd\u0aaf\u0acb\u0ab0\u0aa8\u0acd\u0ab8",
    "\u0a95\u0ac7\u0ab6\u0ab2\u0ac7\u0ab8",
    "\u0aae\u0ac7\u0aa1\u0abf\u0a95\u0acd\u0ab2\u0ac7\u0a87\u0aae"
  ])) return "insurance";

  if (containsAny(normalizedTranscript, [
    "follow-up",
    "follow up",
    "followup",
    "revisit",
    "second visit",
    "\u0aab\u0acb\u0ab2\u0acb",
    "\u0aab\u0ab0\u0ac0 \u0a86\u0ab5\u0ac1\u0a82",
    "\u0aac\u0ac0\u0a9c\u0ac0 \u0ab5\u0abf\u0a9d\u0abf\u0a9f"
  ])) return "follow_up";

  if (containsAny(normalizedTranscript, [
    "upi",
    "gpay",
    "google pay",
    "phonepe",
    "paytm",
    "card",
    "cash",
    "online payment",
    "\u0a95\u0ac7\u0ab6",
    "\u0a95\u0abe\u0ab0\u0acd\u0aa1",
    "\u0aaa\u0ac7\u0aae\u0ac7\u0aa8\u0acd\u0a9f"
  ])) return "payment_mode";

  return null;
}

function matchFeeQuery(normalizedTranscript: string): boolean {
  return containsAny(normalizedTranscript, [
    "fee",
    "fees",
    "feez",
    "fis",
    "consulting charge",
    "consultation",
    "opd charge",
    "visiting charge",
    "visiting charges",
    "charge",
    "charges",
    "rate",
    "cost",
    "price",
    "payment",
    "bill",
    "billing",
    "kitna",
    "kitni",
    "kitne",
    "paisa",
    "rupiya",
    "rupees",
    "affordable",
    "cashless",
    "insurance",
    "mediclaim",
    "tpa",
    "upi",
    "gpay",
    "phonepe",
    "paytm",
    "\u0aab\u0ac0",
    "\u0aab\u0ac0\u0ab8",
    "\u0a9a\u0abe\u0ab0\u0acd\u0a9c",
    "\u0aad\u0abe\u0ab5",
    "\u0ab0\u0ac7\u0a9f",
    "\u0ab0\u0ac1\u0aaa\u0abf\u0aaf\u0abe",
    "\u0a95\u0ac7\u0a9f\u0ab2\u0abe",
    "\u0a95\u0ac7\u0a9f\u0ab2\u0ac0",
    "\u0a95\u0ac7\u0a9f\u0ab2\u0ac1\u0a82",
    "\u0a98\u0aa3\u0abe \u0ab2\u0ac7",
    "\u0ab8\u0ab8\u0acd\u0aa4\u0ac1\u0a82",
    "\u0a87\u0aa8\u0acd\u0ab6\u0acd\u0aaf\u0acb\u0ab0\u0aa8\u0acd\u0ab8",
    "\u0a95\u0ac7\u0ab6\u0ab2\u0ac7\u0ab8",
    "\u0aae\u0ac7\u0aa1\u0abf\u0a95\u0acd\u0ab2\u0ac7\u0a87\u0aae",
    "\u0aab\u0acb\u0ab2\u0acb \u0a85\u0aaa",
    "\u0ab0\u0ac0\u0ab5\u0abf\u0a9d\u0abf\u0a9f",
    "\u092b\u0940\u0938",
    "\u092b\u0940",
    "\u092a\u0948\u0938\u093e",
    "\u092c\u093f\u0932"
  ]);
}

function detectClinicInfoTopic(normalizedTranscript: string): string | null {
  if (containsAny(normalizedTranscript, [
    "address",
    "location",
    "landmark",
    "google maps",
    "branch",
    "\u0a8f\u0aa1\u0acd\u0ab0\u0ac7\u0ab8",
    "\u0ab2\u0acb\u0a95\u0ac7\u0ab6\u0aa8",
    "\u0a95\u0acd\u0ab2\u0abf\u0aa8\u0abf\u0a95 \u0a95\u0acd\u0aaf\u0abe\u0a82",
    "\u0ab9\u0acb\u0ab8\u0acd\u0aaa\u0abf\u0a9f\u0ab2 \u0a95\u0acd\u0aaf\u0abe\u0a82",
    "\u0ab2\u0ac7\u0aa8\u0acd\u0aa1\u0aae\u0abe\u0ab0\u0acd\u0a95",
    "àª•à«àª¯àª¾ àªµàª¿àª¸à«àª¤àª¾àª°àª®àª¾àª‚",
    "àª•àªˆ àª¸à«àªŸà«àª°à«€àªŸ",
    "àª®à«‡àªª",
    "àª¬à«àª°àª¾àª¨à«àªš",
    "àª¶àª¾àª–àª¾"
  ])) return "location";

  if (containsAny(normalizedTranscript, [
    "timing",
    "timeing",
    "opd time",
    "opd timing",
    "open time",
    "close",
    "sunday",
    "holiday",
    "lunch break",
    "walk-in",
    "walk in",
    "\u0a9f\u0abe\u0a87\u0aae\u0abf\u0a82\u0a97",
    "\u0a95\u0acd\u0ab2\u0abf\u0aa8\u0abf\u0a95 \u0a95\u0acd\u0aaf\u0abe\u0ab0\u0ac7",
    "\u0a95\u0acd\u0ab2\u0abf\u0aa8\u0abf\u0a95 \u0aac\u0a82\u0aa7",
    "\u0a93\u0aaa\u0ac0\u0aa1\u0ac0",
    "\u0ab8\u0aae\u0aaf",
    "àª•à«àª¯àª¾àª°à«‡ àª–à«àª²à«‡",
    "àª•à«àª¯àª¾àª°à«‡ àª¬àª‚àª§",
    "àª°àªµàª¿àªµàª¾àª°à«‡",
    "àª¸àª¨à«àª¡à«‡",
    "àª›à«‡àª²à«àª²à«€ appointment",
    "àªµà«‹àª• àª‡àª¨",
    "walkin"
  ])) return "timing";

  if (containsAny(normalizedTranscript, [
    "parking",
    "two-wheeler",
    "bus stop",
    "brts",
    "railway station",
    "airport",
    "rickshaw",
    "\u0aaa\u0abe\u0ab0\u0acd\u0a95\u0abf\u0a82\u0a97",
    "\u0ab0\u0abf\u0a95\u0acd\u0ab6\u0abe",
    "\u0aac\u0ab8 \u0ab8\u0acd\u0a9f\u0acb\u0aaa",
    "àª•à«‡àªµà«€ àª°à«€àª¤à«‡ àª†àªµàªµà«àª‚",
    "àª•àªˆ àª°à«€àª¤à«‡ àª†àªµàªµàª¾àª¨à«àª‚",
    "àª¬à«€àª†àª°àªŸà«€àªàª¸",
    "àªŸà« àªµà«àª¹à«€àª²àª°",
    "àª°à«‡àª²àªµà«‡",
    "àªàª°àªªà«‹àª°à«àªŸ"
  ])) return "directions";

  if (containsAny(normalizedTranscript, [
    "lab",
    "x-ray",
    "xray",
    "ecg",
    "blood test",
    "pharmacy",
    "wheelchair",
    "lift",
    "emergency facility",
    "ambulance",
    "icu",
    "\u0ab2\u0ac7\u0aac",
    "\u0a8f\u0a95\u0acd\u0ab8\u0ab0\u0ac7",
    "\u0aac\u0acd\u0ab2\u0aa1 \u0a9f\u0ac7\u0ab8\u0acd\u0a9f",
    "\u0aab\u0abe\u0ab0\u0acd\u0aae\u0ab8\u0ac0",
    "\u0ab5\u0acd\u0ab9\u0ac0\u0ab2\u0a9a\u0ac7\u0ab0",
    "\u0ab2\u0abf\u0aab\u0acd\u0a9f",
    "àª«à«‡àª¸àª¿àª²àª¿àªŸà«€",
    "àª¸à«àªµàª¿àª§àª¾",
    "àª‡àª®àª°àªœàª¨à«àª¸à«€",
    "àªàª®à«àª¬à«àª¯à«àª²àª¨à«àª¸",
    "àª†àª‡àª¸à«€àª¯à«"
  ])) return "facilities";

  if (containsAny(normalizedTranscript, [
    "wait",
    "waiting",
    "crowd",
    "queue",
    "token",
    "jaldi",
    "\u0aad\u0ac0\u0aa1",
    "\u0ab5\u0ac7\u0a87\u0a9f",
    "\u0a95\u0acd\u0aaf\u0ac2",
    "\u0a9f\u0acb\u0a95\u0aa8",
    "àª•à«‡àªŸàª²à«àª‚ wait",
    "àª•à«‡àªŸàª²à«€ àª°àª¾àª¹",
    "àª²àª¾àª‡àª¨ àª›à«‡",
    "àª­à«€àª¡ àª›à«‡"
  ])) return "wait_time";

  if (containsAny(normalizedTranscript, [
    "number",
    "phone",
    "whatsapp",
    "email",
    "website",
    "contact",
    "\u0aa8\u0a82\u0aac\u0ab0",
    "\u0aab\u0acb\u0aa8",
    "\u0ab5\u0acb\u0a9f\u0acd\u0ab8\u0a8f\u0aaa",
    "\u0a87\u0aae\u0ac7\u0a87\u0ab2",
    "àª¡àª¾àª¯àª°à«‡àª•à«àªŸ àª¡à«‰àª•à«àªŸàª° àª¨àª‚àª¬àª°",
    "àªµà«‹àªŸà«àª¸àªàªª àª¨àª‚àª¬àª°",
    "àª•à«àª²àª¿àª¨àª¿àª•àª¨à«‹ àª¨àª‚àª¬àª°"
  ])) return "contact";

  if (containsAny(normalizedTranscript, [
    "doctor available",
    "doctor on leave",
    "doctor leave",
    "substitute doctor",
    "locum",
    "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0a86\u0a9c\u0ac7",
    "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0a86\u0ab5\u0acd\u0aaf\u0abe",
    "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0ab2\u0ac0\u0ab5",
    "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 available",
    "àª¡à«‰àª•à«àªŸàª° àª†àªœà«‡ àª›à«‡",
    "àª¡à«‰àª•à«àªŸàª° àª†àªµà«àª¯àª¾",
    "àª¡à«‰àª•à«àªŸàª° àª°àªœàª¾ àªªàª°",
    "àª¬à«€àªœàª¾ àª¡à«‰àª•à«àªŸàª°",
    "àª¸àª¬à«àª¸à«àªŸàª¿àªŸà«àª¯à«‚àªŸ"
  ])) return "doctor_availability";

  return null;
}

function matchClinicInfoQuery(normalizedTranscript: string): boolean {
  return Boolean(detectClinicInfoTopic(normalizedTranscript)) || containsAny(normalizedTranscript, [
    "clinic info",
    "hospital info",
    "clinic",
    "hospital",
    "\u0a95\u0acd\u0ab2\u0abf\u0aa8\u0abf\u0a95",
    "\u0ab9\u0acb\u0ab8\u0acd\u0aaa\u0abf\u0a9f\u0ab2"
  ]);
}

function detectHospitalIntentLayer(normalizedTranscript: string, runtimeDoctors: RuntimeDoctor[]): HospitalIntentResult {
  const language = detectIntentLanguage(normalizedTranscript);
  const intents: HospitalIntentLabel[] = [];
  const emergencySymptom = detectEmergencySymptom(normalizedTranscript);
  const feeQuery = matchFeeQuery(normalizedTranscript);
  const feeContext = detectFeeContext(normalizedTranscript);
  const infoTopic = detectClinicInfoTopic(normalizedTranscript);

  const doctorPreference = mapDoctorPreference(normalizedTranscript, createNewSession("intent-probe", undefined), runtimeDoctors);
  const specialization = mapSpecialization(normalizedTranscript, runtimeDoctors);
  const date = mapDateFlexible(normalizedTranscript);
  const time = mapTimeFlexible(normalizedTranscript);
  const relation = detectRelation(normalizedTranscript);
  const symptom = emergencySymptom ?? detectGeneralSymptom(normalizedTranscript);
  const visitMode = containsAny(normalizedTranscript, ["home visit", "\u0a98\u0ab0\u0ac7 \u0ab5\u0abf\u0a9d\u0abf\u0a9f", "\u0939\u094b\u092e \u0935\u093f\u091c\u093f\u091f"])
    ? "home_visit"
    : containsAny(normalizedTranscript, ["teleconsult", "video consult", "phone consult", "\u0a9f\u0ac7\u0ab2\u0ac0\u0a95\u0aa8\u0acd\u0ab8\u0ab2\u0acd\u0a9f", "\u091f\u0947\u0932\u0940\u0915\u0902\u0938\u0932\u094d\u091f"])
      ? "teleconsult"
      : "in_person";

  if (emergencySymptom) {
    return {
      intents: ["EMERGENCY"],
      entities: {
        doctor_name: doctorPreference?.selectedDoctor ?? null,
        specialty: specialization?.specialization ?? null,
        date,
        time,
        symptom: emergencySymptom,
        booking_for: relation ? "third_party" : "self",
        relation,
        urgency: "immediate",
        language,
        visit_mode: visitMode,
        fee_query: feeQuery,
        fee_context: feeContext,
        info_topic: infoTopic
      },
      confidence: 1
    };
  }

  if (
    /\b(hello|hi|namaste|namaskar)\b/i.test(normalizedTranscript)
    || containsAny(normalizedTranscript, ["\u0aa8\u0aae\u0ab8\u0acd\u0aa4\u0ac7", "\u0928\u092e\u0938\u094d\u0924\u0947"])
  ) {
    intents.push("GREETING");
  }

  if (matchHumanTransferIntent(normalizedTranscript)) intents.push("HUMAN_ESCALATION");
  if (matchCancelAppointmentIntent(normalizedTranscript)) intents.push("CANCEL_APPOINTMENT");
  if (matchRescheduleIntent(normalizedTranscript)) intents.push("RESCHEDULE_APPOINTMENT");
  if (matchIntentStart(normalizedTranscript) || doctorPreference || specialization || symptom) intents.push("BOOK_APPOINTMENT");
  if (asksDoctorList(normalizedTranscript) || containsAny(normalizedTranscript, ["doctor info", "which doctor", "doctor details", "\u0a95\u0aaf\u0abe \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0", "\u0915\u094c\u0928\u0938\u0947 \u0921\u0949\u0915\u094d\u091f\u0930"])) intents.push("DOCTOR_INFO");
  if (containsAny(normalizedTranscript, ["available", "availability", "slot available", "doctor available", "available hai", "\u0a85\u0ab5\u0ac7\u0ab2\u0ac7\u0aac\u0ab2", "\u0a89\u0aaa\u0ab2\u0aac\u0acd\u0aa7", "\u0909\u092a\u0932\u092c\u094d\u0927"])) intents.push("CHECK_AVAILABILITY");
  if (matchClinicInfoQuery(normalizedTranscript)) intents.push("CLINIC_INFO");
  if (containsAny(normalizedTranscript, ["report", "lab report", "report ready", "report aayi", "\u0ab0\u0abf\u0aaa\u0acb\u0ab0\u0acd\u0a9f", "\u0930\u093f\u092a\u094b\u0930\u094d\u091f"])) intents.push("REPORT_INQUIRY");
  if (containsAny(normalizedTranscript, ["appointment status", "booking status", "confirm hai", "booked hai", "\u0ab8\u0acd\u0a9f\u0ac7\u0a9f\u0ab8", "\u0915\u0928\u094d\u092b\u0930\u094d\u092e"])) intents.push("APPOINTMENT_STATUS");
  if (feeQuery) intents.push("PAYMENT_BILLING");
  if (hasEndConversationIntent(normalizedTranscript)) intents.push("GOODBYE");
  if (visitMode === "teleconsult") intents.push("TELECONSULT_REQUEST");
  if (visitMode === "home_visit") intents.push("HOME_VISIT_REQUEST");
  if (containsAny(normalizedTranscript, ["language", "gujarati", "hindi", "english", "\u0aad\u0abe\u0ab7\u0abe", "\u092d\u093e\u0937\u093e"])) intents.push("LANGUAGE_SUPPORT");
  if (containsAny(normalizedTranscript, ["insurance", "\u0a87\u0aa8\u0acd\u0ab6\u0acd\u0aaf\u0acb\u0ab0\u0aa8\u0acd\u0ab8", "\u0907\u0928\u094d\u0936\u094d\u092f\u094b\u0930\u0947\u0902\u0938"])) intents.push("INSURANCE_INQUIRY");
  if (containsAny(normalizedTranscript, ["second opinion", "\u0ab8\u0ac7\u0a95\u0aa8\u0acd\u0aa1 \u0a93\u0aaa\u0abf\u0aa8\u0abf\u0aaf\u0aa8", "\u0938\u0947\u0915\u0902\u0921 \u0913\u092a\u093f\u0928\u093f\u092f\u0928"])) intents.push("SECOND_OPINION");
  if (containsAny(normalizedTranscript, ["prescription", "renewal", "refill", "\u0aaa\u0acd\u0ab0\u0abf\u0ab8\u0acd\u0a95\u0acd\u0ab0\u0abf\u0aaa\u0acd\u0ab6\u0aa8", "\u092a\u094d\u0930\u0947\u0938\u094d\u0915\u094d\u0930\u093f\u092a\u094d\u0936\u0928"])) intents.push("PRESCRIPTION_RENEWAL");
  if (containsAny(normalizedTranscript, ["admission", "admitted", "\u0aa6\u0abe\u0a96\u0ab2", "\u092d\u0930\u094d\u0924\u0940"])) intents.push("PATIENT_ADMISSION_STATUS");
  if (containsAny(normalizedTranscript, ["operation theatre", "ot schedule", "surgery schedule", "\u0a93\u0aaa\u0ab0\u0ac7\u0ab6\u0aa8", "\u0913\u092a\u0930\u0947\u0936\u0928"])) intents.push("OT_SCHEDULING");
  if (containsAny(normalizedTranscript, ["health package", "package booking", "\u0ab9\u0ac7\u0ab2\u0acd\u0aa5 \u0aaa\u0ac7\u0a95\u0ac7\u0a9c", "\u0939\u0947\u0932\u094d\u0925 \u092a\u0948\u0915\u0947\u091c"])) intents.push("HEALTH_PACKAGE_BOOKING");
  if (containsAny(normalizedTranscript, ["referral", "refer", "\u0ab0\u0ac7\u0aab\u0ab0", "\u0930\u0947\u092b\u0930"])) intents.push("REFERRAL_BOOKING");
  if (containsAny(normalizedTranscript, ["digital report", "whatsapp report", "email report", "\u0aa1\u0abf\u0a9c\u0abf\u0a9f\u0ab2 \u0ab0\u0abf\u0aaa\u0acb\u0ab0\u0acd\u0a9f"])) intents.push("DIGITAL_REPORT_DELIVERY");
  if (containsAny(normalizedTranscript, ["follow up care", "after care", "\u0aab\u0acb\u0ab2\u0acb \u0a85\u0aaa \u0a95\u0ac7\u0ab0", "\u092b\u0949\u0932\u094b \u0905\u092a \u0915\u0947\u092f\u0930"])) intents.push("FOLLOW_UP_CARE");

  const uniqueIntents = Array.from(new Set(intents));
  const confidence = uniqueIntents.length === 0
    ? 0.35
    : uniqueIntents.some((intent) => ["CANCEL_APPOINTMENT", "RESCHEDULE_APPOINTMENT", "HUMAN_ESCALATION"].includes(intent))
      ? 0.92
      : uniqueIntents.includes("BOOK_APPOINTMENT") && (doctorPreference || specialization || date || time || symptom)
        ? 0.86
        : 0.72;

  return {
    intents: uniqueIntents.length ? uniqueIntents : ["BOOK_APPOINTMENT"],
    entities: {
      doctor_name: doctorPreference?.selectedDoctor ?? null,
      specialty: specialization?.specialization ?? null,
      date,
      time,
      symptom,
      booking_for: relation ? "third_party" : "self",
      relation,
      urgency: symptom ? "elevated" : "normal",
      language,
      visit_mode: visitMode,
      fee_query: feeQuery,
      fee_context: feeContext,
      info_topic: infoTopic
    },
    confidence
  };
}

function hasDetectedIntent(result: HospitalIntentResult, intent: HospitalIntentLabel, minimumConfidence = 0.7): boolean {
  return result.confidence >= minimumConfidence && result.intents.includes(intent);
}

function matchIntentStart(normalizedTranscript: string): boolean {
  if (matchGujaratiBookingIntent(normalizedTranscript)) {
    return true;
  }

  const bookingPhrases = [
    "hello",
    "hi",
    "namaste",
    "namaskar",
    "appointment chahiye",
    "mujhe appointment chahiye",
    "mujhe appointment book karni hai",
    "doctor appointment chahiye",
    "appointment book karna hai",
    "appointment book karni hai",
    "appointment lena hai",
    "appointment leni hai",
    "appointment lagana hai",
    "appointment lagani hai",
    "appointment lagwa do",
    "appointment lagwani hai",
    "appointment kar do",
    "appointment kar dijiye",
    "appointment fix karni hai",
    "appointment schedule karni hai",
    "doctor ko dikhana hai",
    "doctor se milna hai",
    "doctor sahab ko dikhana hai",
    "doctor madam ko dikhana hai",
    "checkup karana hai",
    "check up karana hai",
    "consultation chahiye",
    "consult karna hai",
    "nayi appointment",
    "new appointment",
    "new booking",
    "token lena hai",
    "number lagana hai",
    "number lagwana hai",
    "opd appointment",
    "opd booking",
    "appointment",
    "book karani hai",
    "book karana hai",
    "book karni hai",
    "book karna hai",
    "book karwa do",
    "book karwa dijiye",
    "book kara do",
    "book kara dijiye",
    "booking karani hai",
    "booking karni hai",
    "booking karna hai",
    "booking kara do",
    "booking karwa do",
    "appointment karani hai",
    "àª…àªªà«‹àª‡àª¨à«àªŸàª®à«‡àª¨à«àªŸ",
    "àªàªªà«‹àª‡àª¨à«àªŸàª®à«‡àª¨à«àªŸ",
    "àª…àªªà«‹àª‡àª¨à«àªŸàª®à«‡àª¨à«àªŸ àª¬à«àª•",
    "àªàªªà«‹àª‡àª¨à«àªŸàª®à«‡àª¨à«àªŸ àª¬à«àª•",
    "àª…àªªà«‹àª‡àª¨à«àªŸàª®à«‡àª¨à«àªŸ àª²à«‡àªµà«€",
    "àªàªªà«‹àª‡àª¨à«àªŸàª®à«‡àª¨à«àªŸ àª²à«‡àªµà«€",
    "àª¬à«àª• àª•àª°àªµà«€",
    "àª¬à«àª•àª¿àª‚àª— àª•àª°àªµà«€",
    "àª¡à«‹àª•à«àªŸàª° àªªàª¾àª¸à«‡ àªœàªµà«àª‚",
    "àª¡à«‹àª•à«àªŸàª° àªœà«‹àª¡à«‡ àª…àªªà«‹àª‡àª¨à«àªŸàª®à«‡àª¨à«àªŸ",
    "àª¡à«‰àª•à«àªŸàª° àªœà«‹àª¡à«‡ àª…àªªà«‹àª‡àª¨à«àªŸàª®à«‡àª¨à«àªŸ",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤šà¤¾à¤¹à¤¿à¤",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤¬à¥à¤•",
    "à¤¡à¥‰à¤•à¥à¤Ÿà¤° à¤•à¥‹ à¤¦à¤¿à¤–à¤¾à¤¨à¤¾",
    "à¤¡à¥‰à¤•à¥à¤Ÿà¤° à¤¸à¥‡ à¤®à¤¿à¤²à¤¨à¤¾",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ"
  ];

  const robustBookingPhrases = [
    "mane appointment levi che",
    "doctor sathe malvu che",
    "checkup mate samay aapo",
    "doctor slot book karvo che",
    "appointment fix karvi che",
    "kal ka appointment milega",
    "aaje mate booking karo",
    "next week appointment joiye",
    "doctor ne dekhavu che",
    "consultation book karvi che",
    "opd mate naam lakhvu che",
    "token book karvo che",
    "mujhe doctor se milna hai",
    "mera number lagao",
    "ek slot reserve karo",
    "mari visit book karo",
    "pehli vaar appointment levi che",
    "new patient mate booking karvi che",
    "online appointment karvi che",
    "doctor available che book karo",
    "mujhe oncology doctor se milna hai",
    "skin doctor ka appointment chahiye",
    "thodu urgent appointment aapo",
    "aaje j doctor joiye",
    "koi earliest slot aapo",
    "kal savare slot male",
    "evening ma appointment joiye",
    "sunday ma open che booking karo",
    "mara pita mate appointment levu che",
    "bacha mate doctor joiye",
    "check karine booking karo",
    "available hoy to book kari do",
    "mujhe time de do doctor ka",
    "doctor kab free hai book karo",
    "ek consult set karo",
    "opd entry karavi che",
    "register karine appointment aapo",
    "walk in nai booking karvi che",
    "prior appointment joiye",
    "jaldi appointment karavo",
    "mari slot confirm karo",
    "token number api do",
    "doctor ne malva mate entry karo",
    "booking karva madad karo",
    "mujhe naam likhwana hai",
    "schedule set karo",
    "doctor ne dekhaavanu che",
    "appointment confirm karavi che",
    "slot lock karo",
    "doctor joiye",
    "doctor joye",
    "earliest slot"
  ];

  return [...bookingPhrases, ...robustBookingPhrases].some((phrase) => normalizedTranscript.includes(phrase));
}

function matchGujaratiBookingIntent(normalizedTranscript: string): boolean {
  return [
    "\u0a85\u0aaa\u0acb\u0a87\u0aa8\u0acd\u0a9f\u0aae\u0ac7\u0aa8\u0acd\u0a9f",
    "\u0a8f\u0aaa\u0acb\u0a87\u0aa8\u0acd\u0a9f\u0aae\u0ac7\u0aa8\u0acd\u0a9f",
    "\u0a8f\u0aaa\u0acb\u0a88\u0aa8\u0acd\u0a9f\u0aae\u0ac7\u0aa8\u0acd\u0a9f",
    "\u0aac\u0ac1\u0a95 \u0a95\u0ab0\u0ab5\u0ac0",
    "\u0aac\u0ac1\u0a95\u0abf\u0a82\u0a97 \u0a95\u0ab0\u0ab5\u0ac0",
    "\u0ab2\u0ac7\u0ab5\u0ac0 \u0a9b\u0ac7",
    "\u0a95\u0ab0\u0ac0 \u0aa6\u0ac7\u0ab5\u0abe\u0aa8\u0ac1\u0a82",
    "\u0a95\u0ab0\u0abe\u0ab5\u0ab5\u0ac0 \u0a9b\u0ac7",
    "\u0a9f\u0acb\u0a95\u0aa8 \u0ab2\u0ac7\u0ab5\u0ac1\u0a82",
    "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0a9c\u0acb\u0aa1\u0ac7",
    "\u0aa1\u0ac9\u0a95\u0acd\u0a9f\u0ab0 \u0a9c\u0acb\u0aa1\u0ac7",
    "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0aaa\u0abe\u0ab8\u0ac7",
    "\u0aa1\u0ac9\u0a95\u0acd\u0a9f\u0ab0 \u0aaa\u0abe\u0ab8\u0ac7",
    "appointment àª®àª³àª¶à«‡",
    "slot book",
    "slot open",
    "time available",
    "booking possible",
    "opd appointment",
    "checkup appointment",
    "fresh appointment",
    "new patient",
    "àªªàª¹à«‡àª²à«€ àªµàª¾àª°",
    "àª¨àªµà«€ appointment",
    "àªŸàª¾àª‡àª® àª²àªˆ àª¦à«‹",
    "àª®àª³àªµà«àª‚ àª›à«‡",
    "àª¬àª¤àª¾àªµàªµà«àª‚ àª›à«‡",
    "àª¡à«‰àª•à«àªŸàª° àª–àª¾àª²à«€",
    "àª•à«àª¯àª¾àª°à«‡ slot"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function asksDoctorList(normalizedTranscript: string): boolean {
  if ([
    "\u0a95\u0aaf\u0abe \u0a95\u0aaf\u0abe \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
    "\u0a95\u0aaf\u0abe \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
    "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0ab2\u0abf\u0ab8\u0acd\u0a9f",
    "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0a89\u0aaa\u0ab2\u0aac\u0acd\u0aa7",
    "\u0a95\u0acb\u0aa3 \u0a95\u0acb\u0aa3 \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
    "\u0aae\u0aa8\u0ac7 \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0\u0aa8\u0abe \u0aa8\u0abe\u0aae \u0a95\u0ab9\u0acb",
    "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0\u0aa8\u0abe \u0aa8\u0abe\u0aae \u0a95\u0ab9\u0acb",
    "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0aa8\u0abe \u0aa8\u0abe\u0aae \u0a95\u0ab9\u0acb"
  ].some((phrase) => normalizedTranscript.includes(phrase))) {
    return true;
  }

  return [
    "which doctors",
    "available doctors",
    "doctor available",
    "kaun kaun se doctor",
    "kon kon se doctor",
    "kaunse doctor",
    "doctor list",
    "doctor names",
    "name of doctors",
    "doctor na naam",
    "doktor na naam",
    "à¤•à¥Œà¤¨ à¤•à¥Œà¤¨ à¤¸à¥‡ à¤¡à¥‰à¤•à¥à¤Ÿà¤°",
    "à¤•à¥Œà¤¨à¤¸à¥‡ à¤¡à¥‰à¤•à¥à¤Ÿà¤°",
    "à¤¡à¥‰à¤•à¥à¤Ÿà¤° à¤…à¤µà¥‡à¤²à¥‡à¤¬à¤²",
    "à¤¡à¥‰à¤•à¥à¤Ÿà¤° à¤‰à¤ªà¤²à¤¬à¥à¤§"
  ].some((phrase) => normalizedTranscript.includes(phrase.toLowerCase()));
}

function buildAvailableDoctorsReply(runtimeDoctors: RuntimeDoctor[], prompts?: ConversationPrompts): string {
  const doctors = (runtimeDoctors.length > 0 ? runtimeDoctors : FALLBACK_DOCTORS)
    .map((doctor) => `${formatDoctorNameForSpeech(doctor.name, prompts)} (${doctor.specialization})`);
  const promptSet = prompts ?? DEFAULT_PROMPTS;

  if (doctors.length === 0) {
    return renderPrompt(promptSet.recoverySpecialization, {
      specializations: "doctor directory"
    });
  }

  const lastDoctor = doctors.pop();
  const joiner = prompts && isGujaratiPromptSet(prompts) ? "\u0a85\u0aa8\u0ac7" : prompts && isEnglishPromptSet(prompts) ? "and" : "aur";
  const doctorText = doctors.length > 0 ? `${doctors.join(", ")}, ${joiner} ${lastDoctor}` : lastDoctor;

  return renderPrompt(promptSet.availableDoctors, {
    doctorList: doctorText,
    doctorOptions: doctorText
  });
}

function buildDoctorPreferenceSelectionPrompt(
  session: DemoSessionRecord,
  runtimeDoctors: RuntimeDoctor[],
  prompts: ConversationPrompts
): string {
  const doctorPool = runtimeDoctors.length > 0 ? runtimeDoctors : FALLBACK_DOCTORS;
  const filteredDoctors = session.selectedSpecialization
    ? doctorPool.filter((doctor) => doctor.specialization === session.selectedSpecialization)
    : doctorPool;

  if (filteredDoctors.length === 0) {
    return withExtraInstructions(prompts.askDoctorPreference, prompts);
  }

  const options = filteredDoctors.map((doctor) => formatDoctorNameForSpeech(doctor.name, prompts));
  const lastOption = options.pop();
  const joiner = isGujaratiPromptSet(prompts) ? "અને" : isEnglishPromptSet(prompts) ? "and" : "aur";
  const doctorText = options.length > 0 ? `${options.join(", ")} ${joiner} ${lastOption}` : lastOption;

  if (isGujaratiPromptSet(prompts)) {
    return session.selectedSpecialization
      ? `અમારી પાસે ${session.selectedSpecialization} માટે ${doctorText} ઉપલબ્ધ છે. તમારે કયા ડોક્ટર સાથે મળવું છે?`
      : `અમારી પાસે ${doctorText} ઉપલબ્ધ છે. તમારે કયા ડોક્ટર સાથે મળવું છે?`;
  }

  if (isEnglishPromptSet(prompts)) {
    return session.selectedSpecialization
      ? `We have ${doctorText} available for ${session.selectedSpecialization}. Which doctor would you like to see?`
      : `We have ${doctorText} available. Which doctor would you like to see?`;
  }

  return session.selectedSpecialization
    ? `${session.selectedSpecialization} ke liye hamare yahan ${doctorText} available hain. Aap kis doctor se milna chahenge?`
    : `Hamare yahan ${doctorText} available hain. Aap kis doctor se milna chahenge?`;
}

function resolveDoctorForFeeQuery(normalizedTranscript: string, session: DemoSessionRecord, runtimeDoctors: RuntimeDoctor[]): RuntimeDoctor | null {
  const doctors = runtimeDoctors.length > 0 ? runtimeDoctors : FALLBACK_DOCTORS;
  const preference = mapDoctorPreference(normalizedTranscript, session, doctors);
  if (preference?.selectedDoctor) {
    return doctors.find((doctor) => doctor.name === preference.selectedDoctor) ?? null;
  }

  const specialization = mapSpecialization(normalizedTranscript, doctors);
  if (specialization?.doctors.length === 1) {
    return doctors.find((doctor) => doctor.name === specialization.doctors[0]) ?? null;
  }

  if (session.selectedDoctor) {
    return doctors.find((doctor) => doctor.name === session.selectedDoctor) ?? null;
  }

  return doctors.length === 1 ? doctors[0] : null;
}

function buildDoctorFeeReply(
  normalizedTranscript: string,
  session: DemoSessionRecord,
  runtimeDoctors: RuntimeDoctor[],
  clinicSettings: ClinicSettings | null | undefined,
  prompts?: ConversationPrompts
): { reply: string; action: string } {
  const feeContext = detectFeeContext(normalizedTranscript);

  if (feeContext === "insurance") {
    return {
      reply: "\u0a87\u0aa8\u0acd\u0ab6\u0acd\u0aaf\u0acb\u0ab0\u0aa8\u0acd\u0ab8 details desk \u0aaa\u0ab0 confirm \u0a95\u0ab0\u0acb.",
      action: "answer_insurance_fee"
    };
  }

  if (feeContext === "payment_mode") {
    return {
      reply: "Cash \u0a85\u0aa8\u0ac7 UPI payment \u0a9a\u0abe\u0ab2\u0ac7. Card desk \u0aaa\u0ab0 confirm \u0a95\u0ab0\u0acb.",
      action: "answer_payment_mode"
    };
  }

  const doctor = resolveDoctorForFeeQuery(normalizedTranscript, session, runtimeDoctors);

  if (!doctor) {
    return {
      reply: "\u0a95\u0aaf\u0abe \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0aa8\u0ac0 fee \u0a9c\u0abe\u0aa3\u0ab5\u0ac0 \u0a9b\u0ac7?",
      action: "ask_fee_doctor"
    };
  }

  if (feeContext === "follow_up") {
    return {
      reply: `${formatDoctorNameForSpeech(doctor.name, prompts)} follow-up fee desk \u0aaa\u0ab0 confirm \u0a95\u0ab0\u0acb.`,
      action: "answer_follow_up_fee"
    };
  }

  const amount = doctor.fee || clinicSettings?.consultationFee;
  return {
    reply: amount
      ? `${formatDoctorNameForSpeech(doctor.name, prompts)} \u0aa8\u0ac0 consulting fee ${formatFeeAmountForSpeech(amount, prompts)} \u0a9b\u0ac7.`
      : "\u0aab\u0ac0 details desk \u0aaa\u0ab0 confirm \u0a95\u0ab0\u0acb.",
    action: "answer_doctor_fee"
  };
}

function buildClinicInfoReply(
  normalizedTranscript: string,
  clinicSettings: ClinicSettings | null | undefined,
  session: DemoSessionRecord,
  runtimeDoctors: RuntimeDoctor[],
  prompts?: ConversationPrompts
): { reply: string; action: string } {
  const topic = detectClinicInfoTopic(normalizedTranscript) ?? "general";
  const doctor = mapDoctorPreference(normalizedTranscript, session, runtimeDoctors)?.selectedDoctor ?? session.selectedDoctor ?? null;

  if (topic === "timing") {
    return {
      reply: `OPD timing ${clinicSettings?.clinicTimings ?? "desk par confirm"} \u0a9b\u0ac7.`,
      action: "answer_clinic_timing"
    };
  }

  if (topic === "location") {
    return {
      reply: `Clinic ${clinicSettings?.clinicName ?? "hospital"} \u0aa8\u0abe address \u0aae\u0abe\u0a9f\u0ac7 desk \u0aaa\u0ab0 confirm \u0a95\u0ab0\u0acb.`,
      action: "answer_clinic_location"
    };
  }

  if (topic === "doctor_availability") {
    return {
      reply: doctor ? `${formatDoctorNameForSpeech(doctor, prompts)} \u0aa8\u0ac0 availability appointment slot \u0aae\u0abe\u0a82 check \u0a95\u0ab0\u0ac0\u0a8f.` : "\u0a95\u0aaf\u0abe doctor \u0aa8\u0ac0 availability \u0a9c\u0abe\u0aa3\u0ab5\u0ac0 \u0a9b\u0ac7?",
      action: doctor ? "answer_doctor_availability" : "ask_availability_doctor"
    };
  }

  if (topic === "contact") {
    return {
      reply: `Reception number ${clinicSettings?.transferNumber ?? "desk par confirm"} \u0a9b\u0ac7.`,
      action: "answer_clinic_contact"
    };
  }

  if (topic === "directions") {
    return {
      reply: "Parking \u0a85\u0aa8\u0ac7 directions desk \u0aaa\u0ab0 confirm \u0a95\u0ab0\u0acb.",
      action: "answer_clinic_directions"
    };
  }

  if (topic === "facilities") {
    return {
      reply: "Lab, X-ray \u0a85\u0aa8\u0ac7 facilities desk \u0aaa\u0ab0 confirm \u0a95\u0ab0\u0acb.",
      action: "answer_clinic_facilities"
    };
  }

  if (topic === "wait_time") {
    return {
      reply: "Current waiting time desk \u0aaa\u0ab0 confirm \u0a95\u0ab0\u0acb.",
      action: "answer_wait_time"
    };
  }

  return {
    reply: "Address, timing, parking, \u0a95\u0ac7 doctor availability - \u0ab6\u0ac1\u0a82 \u0a9c\u0abe\u0aa3\u0ab5\u0ac1\u0a82 \u0a9b\u0ac7?",
    action: "clarify_clinic_info"
  };
}

function canAnswerGlobalInfoIntent(stage: BookingStage): boolean {
  return ["waiting_for_intent", "greeting", "fallback"].includes(stage);
}

function matchRescheduleIntent(normalizedTranscript: string): boolean {
  const gujaratiReschedulePhrases = [
    "\u0ab0\u0ac0\u0ab6\u0ac7\u0aa1\u0acd\u0aaf\u0ac1\u0ab2",
    "\u0ab0\u0abf\u0ab6\u0ac7\u0aa1\u0acd\u0aaf\u0ac1\u0ab2",
    "\u0ab6\u0ac7\u0aa1\u0acd\u0aaf\u0ac1\u0ab2 \u0a95\u0ab0\u0ab5\u0ac0",
    "\u0ab6\u0ac7\u0aa1\u0acd\u0aaf\u0ac1\u0ab2 \u0a95\u0ab0\u0acb",
    "\u0ab6\u0ac7\u0aa1\u0acd\u0aaf\u0ac1\u0ab2 \u0a95\u0ab0\u0ab5\u0abe",
    "\u0a8f\u0aaa\u0acb\u0a87\u0aa8\u0acd\u0a9f\u0aae\u0ac7\u0aa8\u0acd\u0a9f \u0aac\u0aa6\u0ab2",
    "\u0aac\u0ac1\u0a95\u0abf\u0a82\u0a97 \u0aac\u0aa6\u0ab2",
    "\u0ab8\u0acd\u0ab2\u0acb\u0a9f \u0aac\u0aa6\u0ab2",
    "\u0a9f\u0abe\u0a87\u0aae \u0aac\u0aa6\u0ab2",
    "\u0aa6\u0abf\u0ab5\u0ab8 \u0aac\u0aa6\u0ab2",
    "\u0aac\u0ac0\u0a9c\u0acb \u0ab8\u0acd\u0ab2\u0acb\u0a9f",
    "\u0aac\u0ac0\u0a9c\u0abe \u0aa6\u0abf\u0ab5\u0ab8\u0ac7",
    "\u0aaa\u0abe\u0a9b\u0ab3 \u0a95\u0ab0\u0acb",
    "\u0a86\u0a97\u0ab3 \u0a95\u0ab0\u0acb",
    "same doctor different day"
  ];

  const reschedulePhrases = [
    "reschedule",
    "re schedule",
    "re-schedule",
    "rescheduled",
    "rescheduling",
    "reshedule",
    "reshchedule",
    "resedule",
    "reschedule karna",
    "reschedule karni",
    "reschedule kar do",
    "reschedule kar dijiye",
    "reschedule karwa do",
    "appointment reschedule",
    "change appointment",
    "appointment change",
    "booking change",
    "slot change",
    "change slot",
    "time change",
    "date change",
    "din change",
    "appointment shift",
    "shift appointment",
    "shift karna hai",
    "shift kar do",
    "postpone appointment",
    "prepone appointment",
    "move appointment",
    "aage karna hai",
    "peeche karna hai",
    "next week kar do",
    "kal ki jagah",
    "parso ki jagah",
    "same appointment dusre din",
    "different time possible",
    "time suit nahi",
    "time convenient nahi",
    "schedule adjust",
    "2-3 din aage"
  ];

  const robustReschedulePhrases = [
    "appointment change karvi che",
    "date badlavi che",
    "time change karvo che",
    "slot shift karo",
    "reschedule karvi che",
    "biji date aapo",
    "aa time possible nathi",
    "mane bijo time joiye",
    "postpone karvu che",
    "advance karvu che",
    "thodu pachi muki do",
    "kal ni jagyae parso karo",
    "next week ma muki do",
    "aa appointment move karo",
    "timing change kari do",
    "9 vagya ni jagyae 11 karo",
    "morning ni jagyae evening karo",
    "aa slot suit nathi karto",
    "mara schedule sathe match nathi",
    "biju slot suggest karo",
    "free hoy to badli do",
    "doctor change nai time change",
    "same doctor sathe biji date joiye",
    "aa booking edit karvi che",
    "modify appointment",
    "shift to another day",
    "ek bijo option aapo",
    "thodu late karo",
    "thodu jaldi karo",
    "adjust kari do",
    "aa cancel kari ne biji book karo",
    "same booking ne move karo",
    "update timing",
    "revise appointment",
    "aa fit nathi change karo",
    "reschedule request",
    "booking ma change karvo che",
    "slot replace karo",
    "new time assign karo",
    "alternate slot aapo",
    "doctor same rehva do time badlo",
    "aa divas nai chale",
    "aa week ma nahi next week karo",
    "appointment aagal pachi karo",
    "adjust schedule",
    "mari booking update karo",
    "change request mukvu che",
    "confirm karva pela change karo",
    "aa slot remove kari ne bijo muki do",
    "aa nai chale"
  ];

  return [...gujaratiReschedulePhrases, ...reschedulePhrases, ...robustReschedulePhrases].some((phrase) => normalizedTranscript.includes(phrase));
}

function matchCancelAppointmentIntent(normalizedTranscript: string): boolean {
  const strongCancelPhrases = [
    "\u0a95\u0ac7\u0aa8\u0acd\u0ab8\u0ab2",
    "\u0a95\u0ac7\u0aa8\u0acd\u0ab8\u0abf\u0ab2",
    "\u0a95\u0ac7\u0aa8\u0acd\u0aa1\u0ab2",
    "\u0a95\u0ac7\u0aa8\u0acd\u0aa1\u0ab2 \u0a95\u0ab0",
    "\u0a95\u0ac7\u0aa8 \u0a95\u0ab0",
    "\u0a95\u0ac7\u0aa8 \u0a95\u0ab0\u0ac0",
    "\u0a95\u0ac7\u0aae\u0acd\u0aaa \u0a95\u0ab0",
    "\u0ab0\u0aa6",
    "\u0ab0\u0aa6\u0acd\u0aa6",
    "\u0a8f\u0aaa\u0acb\u0a87\u0aa8\u0acd\u0a9f\u0aae\u0ac7\u0aa8\u0acd\u0a9f \u0a95\u0ac7\u0aa8\u0acd\u0ab8\u0ab2",
    "\u0aac\u0ac1\u0a95\u0abf\u0a82\u0a97 \u0a95\u0ac7\u0aa8\u0acd\u0ab8\u0ab2",
    "\u0a8f\u0aaa\u0acb\u0a87\u0aa8\u0acd\u0a9f\u0aae\u0ac7\u0aa8\u0acd\u0a9f \u0a9c\u0acb\u0a88\u0aa4\u0ac0 \u0aa8\u0aa5\u0ac0",
    "\u0aac\u0ac1\u0a95\u0abf\u0a82\u0a97 \u0a9c\u0acb\u0a88\u0aa4\u0ac0 \u0aa8\u0aa5\u0ac0",
    "\u0a95\u0ab0\u0ab5\u0ac0 \u0aa8\u0aa5\u0ac0",
    "\u0ab9\u0a9f\u0abe\u0ab5\u0ac0 \u0aa6\u0acb",
    "àª¨ àª°àª¾àª–à«‹",
    "àªœàª°à«‚àª° àª¨àª¥à«€",
    "àª›à«‹àª¡à«€ àª¦à«‹",
    "àª­à«‚àª²à«€ àªœàª¾àª“",
    "àª¨àª¹à«€àª‚ àª²à«‡àªµà«‹",
    "slot free",
    "delete àª•àª°à«‹",
    "àª“àªªàª°à«‡àª¶àª¨ cancel"
  ];

  if (strongCancelPhrases.some((phrase) => transcriptHasStandalonePhrase(normalizedTranscript, phrase))) {
    return true;
  }

  const cancelVariants = [
    "cancel",
    "cansel",
    "cansil",
    "candel",
    "candle",
    "kendal",
    "kendel",
    "cancelled",
    "cancellation",
    "cancel appointment",
    "cancel booking",
    "cancel karna",
    "cancel karni",
    "cancel kar do",
    "cancel kar dijiye",
    "cancel kara do",
    "cancel kara dijiye",
    "cancel karwa do",
    "cancel karwa dijiye",
    "cancel krna",
    "cancel kr do",
    "cansil kar do",
    "cansel kar do",
    "appointment cancel",
    "appointment cancel karni hai",
    "appointment cancel karna hai",
    "appointment cancel kar do",
    "appointment cancel kara do",
    "appointment cancel karwa do",
    "booking cancel",
    "booking cancel karni hai",
    "booking cancel karna hai",
    "booking cancel kar do",
    "booking cancel kara do",
    "booking cancel karwa do",
    "cancel my appointment",
    "mujhe cancel karni hai",
    "mujhe cancel karna hai",
    "meri appointment cancel",
    "meri booking cancel",
    "20 april wali cancel",
    "april wali cancel",
    "appointment nahi chahiye",
    "booking nahi chahiye",
    "mat book karo",
    "mat karna appointment",
    "appointment hata do",
    "booking hata do",
    "appointment delete",
    "booking delete",
    "appointment drop",
    "booking drop",
    "slot free kar do",
    "appointment bhool jao",
    "appointment nahi lena",
    "appointment mat rakho",
    "operation cancel",
    "call off appointment",
    "à¤•à¥ˆà¤‚à¤¸à¤²",
    "à¤•à¥ˆà¤‚à¤¸à¤¿à¤²",
    "à¤•à¥‡à¤‚à¤¸à¤²",
    "à¤•à¥ˆà¤¨à¤¸à¤²",
    "à¤•à¥ˆà¤¨à¤¸à¤¿à¤²",
    "à¤•à¥ˆà¤‚à¤¸à¤² à¤•à¤°",
    "à¤•à¥ˆà¤‚à¤¸à¤¿à¤² à¤•à¤°",
    "à¤•à¥‡à¤‚à¤¸à¤² à¤•à¤°",
    "à¤•à¥ˆà¤‚à¤¸à¤² à¤•à¤° à¤¦à¥‹",
    "à¤•à¥ˆà¤‚à¤¸à¤¿à¤² à¤•à¤° à¤¦à¥‹",
    "à¤•à¥ˆà¤‚à¤¸à¤² à¤•à¤° à¤¦à¥€à¤œà¤¿à¤",
    "à¤•à¥ˆà¤‚à¤¸à¤¿à¤² à¤•à¤° à¤¦à¥€à¤œà¤¿à¤",
    "à¤•à¥ˆà¤‚à¤¸à¤² à¤•à¤°à¤µà¤¾ à¤¦à¥‹",
    "à¤•à¥ˆà¤‚à¤¸à¤¿à¤² à¤•à¤°à¤µà¤¾ à¤¦à¥‹",
    "à¤°à¤¦à¥à¤¦",
    "à¤°à¤¦à¥à¤¦ à¤•à¤°",
    "à¤°à¤¦à¥à¤¦ à¤•à¤° à¤¦à¥‹",
    "à¤°à¤¦à¥à¤¦ à¤•à¤° à¤¦à¥€à¤œà¤¿à¤",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤•à¥ˆà¤‚à¤¸à¤²",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤•à¥ˆà¤‚à¤¸à¤¿à¤²",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤•à¥‡à¤‚à¤¸à¤²",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤°à¤¦à¥à¤¦",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤¹à¤Ÿà¤¾à¤“",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤¹à¤Ÿà¤¾ à¤¦à¥‹",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤¨à¤¹à¥€à¤‚ à¤šà¤¾à¤¹à¤¿à¤",
    "à¤¬à¥à¤•à¤¿à¤‚à¤— à¤•à¥ˆà¤‚à¤¸à¤²",
    "à¤¬à¥à¤•à¤¿à¤‚à¤— à¤•à¥ˆà¤‚à¤¸à¤¿à¤²",
    "à¤¬à¥à¤•à¤¿à¤‚à¤— à¤•à¥‡à¤‚à¤¸à¤²",
    "à¤¬à¥à¤•à¤¿à¤‚à¤— à¤°à¤¦à¥à¤¦",
    "à¤¬à¥à¤•à¤¿à¤‚à¤— à¤¹à¤Ÿà¤¾ à¤¦à¥‹",
    "à¤¬à¥à¤•à¤¿à¤‚à¤— à¤¨à¤¹à¥€à¤‚ à¤šà¤¾à¤¹à¤¿à¤",
    "à¤®à¥‡à¤°à¥€ à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤•à¥ˆà¤‚à¤¸à¤²",
    "à¤®à¥‡à¤°à¥€ à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤•à¥ˆà¤‚à¤¸à¤¿à¤²",
    "à¤®à¥‡à¤°à¥€ à¤¬à¥à¤•à¤¿à¤‚à¤— à¤•à¥ˆà¤‚à¤¸à¤²",
    "à¤®à¥‡à¤°à¥€ à¤¬à¥à¤•à¤¿à¤‚à¤— à¤•à¥ˆà¤‚à¤¸à¤¿à¤²",
    "20 à¤…à¤ªà¥à¤°à¥ˆà¤² à¤µà¤¾à¤²à¥€ à¤•à¥ˆà¤‚à¤¸à¤²",
    "20 à¤…à¤ªà¥à¤°à¥ˆà¤² à¤µà¤¾à¤²à¥€ à¤•à¥ˆà¤‚à¤¸à¤¿à¤²",
    "à¤…à¤ªà¥à¤°à¥ˆà¤² à¤µà¤¾à¤²à¥€ à¤•à¥ˆà¤‚à¤¸à¤²",
    "à¤…à¤ªà¥à¤°à¥ˆà¤² à¤µà¤¾à¤²à¥€ à¤•à¥ˆà¤‚à¤¸à¤¿à¤²",
    "à¤•à¥ˆà¤‚à¤¸à¤²",
    "à¤•à¥ˆà¤‚à¤¸à¤¿à¤²",
    "à¤•à¥‡à¤‚à¤¸à¤²",
    "à¤•à¥ˆà¤¨à¤¸à¤²",
    "à¤•à¥ˆà¤¨à¤¸à¤¿à¤²",
    "à¤°à¤¦à¥à¤¦",
    "à¤•à¥ˆà¤‚à¤¸à¤² à¤•à¤°",
    "à¤•à¥ˆà¤‚à¤¸à¤¿à¤² à¤•à¤°",
    "à¤•à¥‡à¤‚à¤¸à¤² à¤•à¤°",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤•à¥ˆà¤‚à¤¸à¤²",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤•à¥ˆà¤‚à¤¸à¤¿à¤²",
    "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤•à¥‡à¤‚à¤¸à¤²",
    "à¤¬à¥à¤•à¤¿à¤‚à¤— à¤•à¥ˆà¤‚à¤¸à¤²",
    "à¤¬à¥à¤•à¤¿à¤‚à¤— à¤•à¥ˆà¤‚à¤¸à¤¿à¤²",
    "à¤¬à¥à¤•à¤¿à¤‚à¤— à¤•à¥‡à¤‚à¤¸à¤²",
    "booking radd karo",
    "mare appointment cancel karvi che",
    "mare cancel karvi che",
    "mari appointment cancel karvi che",
    "mari appointment radd karvi che",
    "appointment radd karvi che",
    "appointment cancel karvi che",
    "aa appointment cancel karvi che",
    "aa appointment radd karvi che",
    "doctor sathe ni appointment cancel karvi che",
    "sahil sathe ni appointment cancel karvi che",
    "aa cancel karo",
    "mari booking hataavi do",
    "slot remove karo",
    "naam hataavi do",
    "visit cancel karo",
    "aavanu nathi",
    "hu nahi avi shaku",
    "cancel karavi do",
    "drop appointment",
    "delete booking",
    "remove entry",
    "cancel request",
    "aa radd kari do",
    "appointment bandh karo",
    "entry cancel karo",
    "mujhe nahi aana hai",
    "plan change thai gayo che",
    "doctor nahi joiye have",
    "appointment cancel karvi padse",
    "aa visit nai karvi",
    "hu busy chu cancel karo",
    "aa booking close karo",
    "cancel my slot",
    "withdraw appointment",
    "hu aavi nahi shaku",
    "naam kadhi nakho",
    "remove from list",
    "opd entry cancel karo",
    "cancel kari do please",
    "aa confirm nai karvi",
    "booking reject karo",
    "aa hataavi do",
    "cancel karvu che bas",
    "delete kari do",
    "aa slot free kari do",
    "mara mate cancel karo",
    "patient nai aavse",
    "visit drop karvi che",
    "aa reschedule nai cancel karo",
    "remove appointment",
    "hu nai aavu cancel karo",
    "cancel immediately",
    "aa cancel kari ne biju nai joiye",
    "cancel kari ne bandh karo",
    "pura cancel kari do",
    "hu nai aavu"
  ];

  return cancelVariants.some((phrase) => transcriptHasStandalonePhrase(normalizedTranscript, phrase));
}

const SPECIALIZATION_ALIASES: Record<string, string[]> = {
  "General Medicine": [
    "\u0a9c\u0aa8\u0ab0\u0ab2 \u0aae\u0ac7\u0aa1\u0abf\u0ab8\u0abf\u0aa8",
    "\u0a9c\u0aa8\u0ab0\u0ab2 \u0aae\u0ac7\u0aa1\u0abf\u0ab8\u0ac0\u0aa8",
    "\u0a9c\u0aa8\u0ab0\u0ab2",
    "\u0aae\u0ac7\u0aa1\u0abf\u0ab8\u0abf\u0aa8",
    "\u0aae\u0ac7\u0aa1\u0abf\u0ab8\u0ac0\u0aa8",
    "\u0aab\u0abf\u0a9d\u0abf\u0ab6\u0abf\u0aaf\u0aa8",
    "\u0aab\u0abf\u0a9d\u0abf\u0ab6\u0abf\u0aaf\u0aa8 \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
    "\u0aab\u0ac7\u0aae\u0abf\u0ab2\u0ac0 \u0aab\u0abf\u0a9d\u0abf\u0ab6\u0abf\u0aaf\u0aa8",
    "\u0ab8\u0abe\u0aae\u0abe\u0aa8\u0acd\u0aaf \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
    "\u0ab8\u0abe\u0aa6\u0abe \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
    "\u091c\u0928\u0930\u0932",
    "\u091c\u0928\u0930\u0932 \u092e\u0947\u0921\u093f\u0938\u093f\u0928",
    "\u092b\u093f\u091c\u093f\u0936\u093f\u092f\u0928",
    "\u092b\u0948\u092e\u093f\u0932\u0940 \u092b\u093f\u091c\u093f\u0936\u093f\u092f\u0928",
    "\u0938\u093e\u092e\u093e\u0928\u094d\u092f \u0921\u0949\u0915\u094d\u091f\u0930",
    "\u092e\u0947\u0921\u093f\u0938\u093f\u0928",
    "\u092c\u0941\u0916\u093e\u0930",
    "àªœàª¨àª°àª² àª®à«‡àª¡àª¿àª¸àª¿àª¨",
    "àª«à«‡àª®àª¿àª²à«€ àª«àª¿àªàª¿àª¶àª¿àª¯àª¨",
    "àª«àª¿àªàª¿àª¶àª¿àª¯àª¨",
    "àª¸àª¾àª®àª¾àª¨à«àª¯ àª¡à«‹àª•à«àªŸàª°",
    "general",
    "general medicine",
    "general physician",
    "physician",
    "general doctor",
    "family doctor",
    "medicine",
    "medical",
    "md",
    "mbbs",
    "fever doctor",
    "normal doctor",
    "regular doctor",
    "à¤œà¤¨à¤°à¤²",
    "à¤œà¤¨à¤°à¤² à¤®à¥‡à¤¡à¤¿à¤¸à¤¿à¤¨",
    "à¤«à¤¿à¤œà¤¿à¤¶à¤¿à¤¯à¤¨",
    "à¤®à¥‡à¤¡à¤¿à¤¸à¤¿à¤¨",
    "à¤¬à¥à¤–à¤¾à¤°",
    "à¤¸à¤¾à¤§à¤¾à¤°à¤£ à¤¡à¥‰à¤•à¥à¤Ÿà¤°",
    "à¤®à¥‡à¤¡à¤¿à¤¸à¤¿à¤¨",
    "à¤œà¤¨à¤°à¤²",
    "à¤œà¤¨à¤°à¤² à¤®à¥‡à¤¡à¤¿à¤¸à¤¿à¤¨",
    "à¤œà¤¨à¤°à¤² à¤«à¤¿à¤œà¤¿à¤¶à¤¿à¤¯à¤¨",
    "à¤«à¤¿à¤œà¤¿à¤¶à¤¿à¤¯à¤¨"
  ],
  Cardiology: [
    "\u0a95\u0abe\u0ab0\u0acd\u0aa1\u0abf\u0aaf\u0acb\u0ab2\u0acb\u0a9c\u0ac0",
    "\u0a95\u0abe\u0ab0\u0acd\u0aa1\u0abf\u0aaf\u0acb\u0ab2\u0acb\u0a9c\u0abf\u0ab8\u0acd\u0a9f",
    "\u0a95\u0abe\u0ab0\u0acd\u0aa1\u0abf\u0aaf\u0abe\u0a95",
    "\u0ab9\u0abe\u0ab0\u0acd\u0a9f",
    "\u0ab9\u0abe\u0ab0\u0acd\u0a9f \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
    "\u0ab9\u0abe\u0ab0\u0acd\u0a9f \u0ab8\u0acd\u0aaa\u0ac7\u0ab6\u0abf\u0aaf\u0ab2\u0abf\u0ab8\u0acd\u0a9f",
    "\u0aa6\u0abf\u0ab2",
    "\u0aa6\u0abf\u0ab2\u0aa8\u0abe \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
    "\u0ab9\u0ac3\u0aa6\u0aaf",
    "\u0915\u093e\u0930\u094d\u0921\u093f\u092f\u094b\u0932\u0949\u091c\u0940",
    "\u0915\u093e\u0930\u094d\u0921\u093f\u092f\u094b\u0932\u0949\u091c\u093f\u0938\u094d\u091f",
    "\u0939\u093e\u0930\u094d\u091f",
    "\u0939\u093e\u0930\u094d\u091f \u0921\u0949\u0915\u094d\u091f\u0930",
    "\u0939\u093e\u0930\u094d\u091f \u0938\u094d\u092a\u0947\u0936\u0932\u093f\u0938\u094d\u091f",
    "\u0926\u093f\u0932",
    "\u0926\u093f\u0932 \u0915\u0947 \u0921\u0949\u0915\u094d\u091f\u0930",
    "\u0939\u0943\u0926\u092f",
    "àª•àª¾àª°à«àª¡àª¿àª¯à«‹àª²à«‹àªœà«€",
    "àª•àª¾àª°à«àª¡àª¿àª¯à«‹àª²à«‹àªœàª¿àª¸à«àªŸ",
    "àª¹àª¾àª°à«àªŸ",
    "àª¹àª¾àª°à«àªŸ àª¡à«‹àª•à«àªŸàª°",
    "àª¦àª¿àª²àª¨àª¾ àª¡à«‹àª•à«àªŸàª°",
    "cardiology",
    "cardiologist",
    "heart specialist",
    "cardio",
    "heart",
    "heart doctor",
    "cardiac",
    "à¤•à¤¾à¤°à¥à¤¡à¤¿à¤¯à¥‹à¤²à¥‰à¤œà¥€",
    "à¤•à¤¾à¤°à¥à¤¡à¤¿à¤¯à¥‹à¤²à¥‰à¤œà¤¿à¤¸à¥à¤Ÿ",
    "à¤¹à¤¾à¤°à¥à¤Ÿ",
    "à¤¹à¤¾à¤°à¥à¤Ÿ à¤¡à¥‰à¤•à¥à¤Ÿà¤°",
    "à¤¹à¥ƒà¤¦à¤¯",
    "à¤¦à¤¿à¤²",
    "à¤¦à¤¿à¤² à¤•à¥‡ à¤¡à¥‰à¤•à¥à¤Ÿà¤°",
    "à¤•à¤¾à¤°à¥à¤¡à¤¿à¤¯à¥‹à¤²à¥‰à¤œà¥€",
    "à¤•à¤¾à¤°à¥à¤¡à¤¿à¤¯à¥‹à¤²à¥‰à¤œà¤¿à¤¸à¥à¤Ÿ",
    "à¤¹à¤¾à¤°à¥à¤Ÿ à¤¸à¥à¤ªà¥‡à¤¶à¤²à¤¿à¤¸à¥à¤Ÿ"
  ],
  Dermatology: [
    "\u0aa1\u0ab0\u0acd\u0aae\u0ac7\u0a9f\u0acb\u0ab2\u0acb\u0a9c\u0ac0",
    "\u0aa1\u0ab0\u0acd\u0aae\u0ac7\u0a9f\u0acb\u0ab2\u0acb\u0a9c\u0abf\u0ab8\u0acd\u0a9f",
    "\u0aa1\u0ab0\u0acd\u0aae\u0abe",
    "\u0ab8\u0acd\u0a95\u0abf\u0aa8",
    "\u0ab8\u0acd\u0a95\u0abf\u0aa8 \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
    "\u0ab8\u0acd\u0a95\u0abf\u0aa8 \u0ab8\u0acd\u0aaa\u0ac7\u0ab6\u0abf\u0aaf\u0ab2\u0abf\u0ab8\u0acd\u0a9f",
    "\u0aa4\u0acd\u0ab5\u0a9a\u0abe",
    "\u0a9a\u0abe\u0aae\u0aa1\u0ac0",
    "\u0a9a\u0abe\u0aae\u0aa1\u0ac0\u0aa8\u0abe \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
    "\u0921\u0930\u094d\u092e\u0947\u091f\u094b\u0932\u0949\u091c\u0940",
    "\u0921\u0930\u094d\u092e\u0947\u091f\u094b\u0932\u0949\u091c\u093f\u0938\u094d\u091f",
    "\u0921\u0930\u094d\u092e\u093e",
    "\u0938\u094d\u0915\u093f\u0928",
    "\u0938\u094d\u0915\u093f\u0928 \u0921\u0949\u0915\u094d\u091f\u0930",
    "\u0938\u094d\u0915\u093f\u0928 \u0938\u094d\u092a\u0947\u0936\u0932\u093f\u0938\u094d\u091f",
    "\u0924\u094d\u0935\u091a\u093e",
    "\u091a\u093e\u092e\u0921\u093c\u0940",
    "àª¡àª°à«àª®à«‡àªŸà«‹àª²à«‹àªœà«€",
    "àª¡àª°à«àª®à«‡àªŸà«‹àª²à«‹àªœàª¿àª¸à«àªŸ",
    "àª¸à«àª•àª¿àª¨",
    "àª¸à«àª•àª¿àª¨ àª¡à«‹àª•à«àªŸàª°",
    "àª¤à«àªµàªšàª¾",
    "dermatology",
    "dermatologist",
    "skin specialist",
    "skin",
    "skin doctor",
    "derma",
    "à¤¤à¥à¤µà¤šà¤¾",
    "à¤¸à¥à¤•à¤¿à¤¨",
    "à¤¸à¥à¤•à¤¿à¤¨ à¤¡à¥‰à¤•à¥à¤Ÿà¤°",
    "à¤¡à¤°à¥à¤®à¥‡à¤Ÿà¥‹à¤²à¥‰à¤œà¥€",
    "à¤¡à¤°à¥à¤®à¥‡à¤Ÿà¥‹à¤²à¥‰à¤œà¤¿à¤¸à¥à¤Ÿ",
    "à¤šà¤®à¤¡à¤¼à¥€",
    "à¤šà¤°à¥à¤® à¤°à¥‹à¤—",
    "à¤¡à¤°à¥à¤®à¥‡à¤Ÿà¥‹à¤²à¥‰à¤œà¥€",
    "à¤¡à¤°à¥à¤®à¥‡à¤Ÿà¥‹à¤²à¥‰à¤œà¤¿à¤¸à¥à¤Ÿ",
    "à¤¸à¥à¤•à¤¿à¤¨ à¤¸à¥à¤ªà¥‡à¤¶à¤²à¤¿à¤¸à¥à¤Ÿ",
    "à¤¸à¥à¤•à¤¿à¤¨",
    "à¤¤à¥à¤µà¤šà¤¾",
    "à¤®à¥à¤¡à¥à¤¡ à¤ªà¥€à¤¬à¥à¤°à¥‹à¤²à¥‰à¤œà¥€"
  ],
  Oncologist: [
    "\u0a93\u0aa8\u0acd\u0a95\u0acb\u0ab2\u0acb\u0a9c\u0abf\u0ab8\u0acd\u0a9f",
    "\u0a93\u0aa8\u0acd\u0a95\u0acb",
    "\u0a95\u0ac7\u0aa8\u0acd\u0ab8\u0ab0",
    "\u0a95\u0ac5\u0aa8\u0acd\u0ab8\u0ab0",
    "àª“àª¨à«àª•à«‹àª²à«‹àªœàª¿àª¸à«àªŸ",
    "àª“àª¨à«àª•à«‹àª²à«‹àªœà«€",
    "àª“àª¨à«àª•à«‹àª²à«‹àªœàª¿àª¸à«àªŸ àªœà«‹àª¡à«‡",
    "àª“àª¨à«àª•à«‹àª²à«‹àªœàª¿àª¸à«àªŸ àªªàª¾àª¸à«‡",
    "àª•à«‡àª¨à«àª¸àª°",
    "àª•à«‡àª¨à«àª¸àª° àª¡à«‹àª•à«àªŸàª°",
    "àª•à«‡àª¨à«àª¸àª° àª¸à«àªªà«‡àª¶àª¿àª¯àª¾àª²àª¿àª¸à«àªŸ",
    "oncologist",
    "oncology",
    "onco",
    "cancer",
    "cancer specialist",
    "cancer doctor",
    "tumor doctor",
    "tumour doctor",
    "chemo doctor",
    "à¤•à¥€à¤®à¥‹",
    "à¤•à¥ˆà¤‚à¤¸à¤° à¤¡à¥‰à¤•à¥à¤Ÿà¤°",
    "à¤Ÿà¥à¤¯à¥‚à¤®à¤°",
    "à¤“à¤‚à¤•à¥‡à¤²à¥‰à¤œà¤¿à¤¸à¥à¤Ÿ",
    "à¤“à¤¨à¥à¤•à¥‹à¤²à¥‰à¤œà¤¿à¤¸à¥à¤Ÿ",
    "à¤‘à¤¨à¥à¤•à¥‹à¤²à¥‰à¤œà¤¿à¤¸à¥à¤Ÿ",
    "à¤‘à¤¨à¥à¤•à¥‹à¤²à¥‰à¤œà¥€",
    "à¤“à¤‚à¤•à¥‹à¤²à¥‰à¤œà¥€",
    "à¤•à¥ˆà¤‚à¤¸à¤°",
    "à¤•à¥…à¤¨à¥à¤¸à¤°",
    "à¤•à¥ˆà¤‚à¤¸à¤° à¤¸à¥à¤ªà¥‡à¤¶à¤²à¤¿à¤¸à¥à¤Ÿ"
  ]
};

function buildDoctorDirectory(runtimeDoctors: RuntimeDoctor[]) {
  const doctors = runtimeDoctors.length > 0 ? runtimeDoctors : FALLBACK_DOCTORS;
  const specializationMap = new Map<string, { specialization: string; doctors: string[]; doctorIds: string[] }>();
  const specializationAliasMap = new Map<string, { specialization: string; doctors: string[]; doctorIds: string[] }>();

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

  for (const definition of specializationMap.values()) {
    for (const alias of buildSpecializationAliases(definition.specialization)) {
      specializationAliasMap.set(alias, definition);
    }
  }

  return {
    doctors,
    specializationMap,
    specializationAliasMap
  };
}

function mapSpecialization(normalizedTranscript: string, runtimeDoctors: RuntimeDoctor[]): { specialization: string; doctors: string[] } | null {
  const directory = buildDoctorDirectory(runtimeDoctors);
  const normalizedMatchText = normalizeDoctorMatchText(normalizedTranscript);

  for (const [specialization, aliases] of Object.entries(SPECIALIZATION_ALIASES)) {
    if (aliases.some((alias) => normalizedMatchText.includes(normalizeDoctorMatchText(alias)))) {
      const matchedDoctors = directory.doctors.filter((doctor) => doctor.specialization === specialization).map((doctor) => doctor.name);
      return {
        specialization,
        doctors: matchedDoctors.length > 0 ? matchedDoctors : [directory.doctors[0]?.name ?? "Dr. Ananya Sharma"]
      };
    }
  }

  for (const [key, definition] of directory.specializationAliasMap.entries()) {
    if (normalizedMatchText.includes(key)) {
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
  const matches = rankDoctorMatches(normalizedTranscript, doctorList);
  const exactDoctor = getSurnameOnlyAmbiguousDoctorMatches(normalizedTranscript, doctorList).length > 0 || getAmbiguousDoctorMatches(matches).length > 0
    ? null
    : matches[0]?.doctor ?? null;

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

function rankDoctorMatches(normalizedTranscript: string, doctorList: RuntimeDoctor[]): Array<{ doctor: RuntimeDoctor; score: number }> {
  return doctorList
    .map((doctor) => ({ doctor, score: doctorMatchScore(doctor, normalizedTranscript) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
}

function getAmbiguousDoctorMatches(matches: Array<{ doctor: RuntimeDoctor; score: number }>): RuntimeDoctor[] {
  if (matches.length < 2) {
    return [];
  }

  const topScore = matches[0].score;
  const tiedMatches = matches.filter((match) => match.score === topScore);

  return tiedMatches.length > 1 ? tiedMatches.map((match) => match.doctor) : [];
}

function mapAmbiguousDoctorPreference(normalizedTranscript: string, runtimeDoctors: RuntimeDoctor[]): RuntimeDoctor[] {
  const doctorList = runtimeDoctors.length > 0 ? runtimeDoctors : FALLBACK_DOCTORS;
  const surnameMatches = getSurnameOnlyAmbiguousDoctorMatches(normalizedTranscript, doctorList);
  return surnameMatches.length > 0 ? surnameMatches : getAmbiguousDoctorMatches(rankDoctorMatches(normalizedTranscript, doctorList));
}

function buildDoctorDisambiguationPrompt(doctors: RuntimeDoctor[], prompts?: ConversationPrompts): string {
  const promptSet = prompts ?? DEFAULT_PROMPTS;
  const isGujarati = prompts
    ? hasGujaratiText(`${prompts.askDate} ${prompts.askSpecialization} ${prompts.recoveryDoctorWithMemory}`)
    : false;
  const options = doctors.map((doctor) => `${formatDoctorNameForSpeech(doctor.name, prompts)} (${doctor.specialization})`);
  const lastOption = options.pop();
  const optionText = options.length > 0 ? `${options.join(", ")} ${isGujarati ? "અને" : "aur"} ${lastOption}` : lastOption;
  const sharedLastName = commonDoctorLastName(doctors);

  return renderPrompt(promptSet.doctorDisambiguation, {
    doctorOptions: optionText,
    doctorList: optionText,
    sharedLastName: sharedLastName ?? ""
  });

  if (isGujarati) {
    if (sharedLastName) {
      return `કયા ${sharedLastName} doctor માટે appointment લેવી છે? અમારી પાસે ${optionText} ઉપલબ્ધ છે.`;
    }

    return `કયા doctor માટે appointment લેવી છે? અમારી પાસે ${optionText} ઉપલબ્ધ છે.`;
  }

  if (sharedLastName) {
    return `Batayiye, kaunse ${sharedLastName} doctor se appointment leni hai? Humare yaha ${optionText} available hain.`;
  }

  return `Batayiye, kaunse doctor se appointment leni hai? Humare yaha ${optionText} available hain.`;
}

function commonDoctorLastName(doctors: RuntimeDoctor[]): string | null {
  const lastNames = doctors
    .map((doctor) => doctor.name.replace(/^dr\.?\s+/i, "").trim().split(/\s+/).filter(Boolean).pop() ?? "")
    .filter(Boolean);

  if (lastNames.length < 2) {
    return null;
  }

  const first = lastNames[0].toLowerCase();
  return lastNames.every((name) => name.toLowerCase() === first) ? lastNames[0] : null;
}

function getSurnameOnlyAmbiguousDoctorMatches(normalizedTranscript: string, doctorList: RuntimeDoctor[]): RuntimeDoctor[] {
  const transcript = normalizeDoctorMatchText(normalizedTranscript);
  const doctorsByLastName = new Map<string, RuntimeDoctor[]>();

  for (const doctor of doctorList) {
    const lastName = doctorLastName(doctor);
    if (!lastName) {
      continue;
    }

    doctorsByLastName.set(lastName, [...(doctorsByLastName.get(lastName) ?? []), doctor]);
  }

  for (const doctors of doctorsByLastName.values()) {
    if (doctors.length < 2) {
      continue;
    }

    const lastNameAliases = doctorPartAliases(doctorLastName(doctors[0]) ?? "");
    if (!lastNameAliases.some((alias) => transcriptHasToken(transcript, alias))) {
      continue;
    }

    const firstNameMatches = doctors.filter((doctor) => {
      const firstName = doctorFirstName(doctor);
      return firstName && doctorPartAliases(firstName).some((alias) => transcriptHasToken(transcript, alias));
    });

    if (firstNameMatches.length === 0) {
      return doctors;
    }
  }

  return [];
}

function doctorFirstName(doctor: RuntimeDoctor): string | null {
  return doctor.name.replace(/^dr\.?\s+/i, "").trim().split(/\s+/).filter(Boolean)[0] ?? null;
}

function doctorLastName(doctor: RuntimeDoctor): string | null {
  const parts = doctor.name.replace(/^dr\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : null;
}

function buildSpecializationAliases(specialization: string): string[] {
  const raw = String(specialization || "").trim();
  if (!raw) {
    return [];
  }

  const aliases = new Set<string>();
  const normalized = normalizeDoctorMatchText(raw);
  const tokens = normalized.split(" ").filter(Boolean);
  const filteredTokens = tokens.filter((token) => !["doctor", "specialist", "department", "dept"].includes(token));

  aliases.add(normalized);
  aliases.add(filteredTokens.join(" "));

  if (filteredTokens.length > 0) {
    aliases.add(`${filteredTokens.join(" ")} specialist`);
    aliases.add(`${filteredTokens.join(" ")} doctor`);
  }

  if (filteredTokens.length > 1) {
    const acronym = filteredTokens.map((token) => token[0]).join("");
    aliases.add(acronym);
    aliases.add(acronym.split("").join(" "));
    aliases.add(`${acronym} specialist`);
  }

  if (filteredTokens.some((token) => ["ent", "otolaryngology", "otorhinolaryngology"].includes(token))
    || filteredTokens.join(" ").includes("ear nose throat")) {
    [
      "ent",
      "e n t",
      "ent specialist",
      "end specialist",
      "ear nose throat",
      "ear nose throat specialist",
      "ear nose throat doctor",
      "ear nose and throat",
      "kan nak gala",
      "kan naak gala",
      "kaan naak gala",
      "kan nak gala doctor",
      "kan nak gala specialist",
      "kan na gala",
      "kaan na gala",
      "ien ti",
      "ienti",
      "ઇએનટી",
      "ઈએનટી",
      "એનટી",
      "કાન નાક ગળા",
      "કાનના નાકના ગળાના",
      "કાનના ગળાના",
      "કાન નાક ગળાના doctor",
      "કાન નાક ગળાના specialist",
      "ear pain",
      "nose throat"
    ].forEach((alias) => aliases.add(normalizeDoctorMatchText(alias)));
  }

  return Array.from(aliases).filter(Boolean);
}

function doctorPartAliases(part: string): string[] {
  const normalized = part.toLowerCase();
  return [
    normalized,
    ...(DEVANAGARI_NAME_ALIASES[normalized] ?? []),
    ...(DEVANAGARI_NAME_ALIASES_CLEAN[normalized] ?? []),
    ...(GUJARATI_NAME_ALIASES[normalized] ?? [])
  ]
    .map((alias) => normalizeDoctorMatchText(alias))
    .filter(Boolean);
}

function transcriptHasToken(transcript: string, token: string): boolean {
  return new RegExp(`(?:^|\\s)${escapeRegExp(token)}(?:\\s|$)`, "iu").test(transcript);
}

function transcriptHasStandalonePhrase(transcript: string, phrase: string): boolean {
  const normalizedPhrase = String(phrase || "").trim();
  if (!normalizedPhrase) return false;
  const pattern = escapeRegExp(normalizedPhrase).replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|\\s)${pattern}(?:\\s|$)`, "iu").test(transcript);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GUJARATI_NAME_ALIASES: Record<string, string[]> = {
  ananya: ["\u0a85\u0aa8\u0aa8\u0acd\u0aaf\u0abe", "\u0a85\u0aa8\u0aa8\u0acd\u0aaf\u0abe\u0aac\u0ac7\u0aa8", "\u0a85\u0aa8\u0aa8\u0acd\u0aaf", "\u0a85\u0aa8\u0aa8\u0acd\u0aaf\u0abe \u0aae\u0ac7\u0aa1\u0aae"],
  sharma: ["\u0ab6\u0ab0\u0acd\u0aae\u0abe"],
  rohan: ["\u0ab0\u0acb\u0ab9\u0aa8", "\u0ab0\u0acb\u0ab9\u0aa3", "\u0ab0\u0acb\u0ab9\u0aa8\u0aad\u0abe\u0a88", "\u0ab0\u0acb\u0ab9\u0aa8 \u0ab8\u0ab0"],
  patel: ["\u0aaa\u0a9f\u0ac7\u0ab2", "\u0aaa\u0a9f\u0ac7\u0ab2\u0ab8\u0abe\u0ab9\u0ac7\u0aac"],
  meera: ["\u0aae\u0ac0\u0ab0\u0abe", "\u0aae\u0ac0\u0ab0\u0acb", "\u0aae\u0ac0\u0ab0\u0abe\u0aac\u0ac7\u0aa8", "\u0aae\u0ac0\u0ab0\u0abe \u0aae\u0ac7\u0aa1\u0aae"],
  shah: ["\u0ab6\u0abe\u0ab9", "\u0ab6\u0abe\u0ab9\u0ab8\u0abe\u0ab9\u0ac7\u0aac", "\u0a86\u0ab9\u0abe\u0ab0"],
  pankaj: ["\u0aaa\u0a82\u0a95\u0a9c", "\u0aaa\u0a82\u0a95\u0aa4\u0abe", "\u0aaa\u0a82\u0a95\u0abe", "\u0aaa\u0a82\u0a95\u0a9c\u0aad\u0abe\u0a88"],
  paresh: ["\u0aaa\u0ab0\u0ac7\u0ab6"]
};

const DEVANAGARI_NAME_ALIASES: Record<string, string[]> = {
  ananya: ["à¤…à¤¨à¤¨à¥à¤¯à¤¾", "à¤…à¤¨à¤¯à¤¾"],
  sharma: ["à¤¶à¤°à¥à¤®à¤¾"],
  rohan: ["à¤°à¥‹à¤¹à¤¨"],
  patel: ["à¤ªà¤Ÿà¥‡à¤²"],
  meera: ["à¤®à¥€à¤°à¤¾"],
  shah: ["à¤¶à¤¾à¤¹"],
  pankaj: ["à¤ªà¤‚à¤•à¤œ"],
  paresh: ["à¤ªà¤°à¥‡à¤¶"]
};

const DEVANAGARI_NAME_ALIASES_CLEAN: Record<string, string[]> = {
  ananya: ["\u0905\u0928\u0928\u094d\u092f\u093e", "\u0905\u0928\u092f\u093e", "\u0905\u0928\u0928\u094d\u092f\u093e \u092e\u0948\u0921\u092e"],
  sharma: ["\u0936\u0930\u094d\u092e\u093e"],
  rohan: ["\u0930\u094b\u0939\u0928", "\u0930\u094b\u0939\u0928 \u0938\u0930"],
  patel: ["\u092a\u091f\u0947\u0932", "\u092a\u091f\u0947\u0932 \u0938\u093e\u0939\u092c"],
  meera: ["\u092e\u0940\u0930\u093e", "\u092e\u0940\u0930\u093e \u092e\u0948\u0921\u092e"],
  shah: ["\u0936\u093e\u0939", "\u0936\u093e\u0939 \u0938\u093e\u0939\u092c"],
  pankaj: ["\u092a\u0902\u0915\u091c"],
  paresh: ["\u092a\u0930\u0947\u0936"]
};

const INDIC_LATIN_CHAR_MAP: Record<string, string> = {
  "\u0a81": "n",
  "\u0a82": "n",
  "\u0a83": "h",
  "\u0a85": "a",
  "\u0a86": "aa",
  "\u0a87": "i",
  "\u0a88": "i",
  "\u0a89": "u",
  "\u0a8a": "u",
  "\u0a8b": "ri",
  "\u0a8f": "e",
  "\u0a90": "ai",
  "\u0a93": "o",
  "\u0a94": "au",
  "\u0a95": "k",
  "\u0a96": "kh",
  "\u0a97": "g",
  "\u0a98": "gh",
  "\u0a99": "n",
  "\u0a9a": "ch",
  "\u0a9b": "chh",
  "\u0a9c": "j",
  "\u0a9d": "jh",
  "\u0a9e": "n",
  "\u0a9f": "t",
  "\u0aa0": "th",
  "\u0aa1": "d",
  "\u0aa2": "dh",
  "\u0aa3": "n",
  "\u0aa4": "t",
  "\u0aa5": "th",
  "\u0aa6": "d",
  "\u0aa7": "dh",
  "\u0aa8": "n",
  "\u0aaa": "p",
  "\u0aab": "f",
  "\u0aac": "b",
  "\u0aad": "bh",
  "\u0aae": "m",
  "\u0aaf": "y",
  "\u0ab0": "r",
  "\u0ab2": "l",
  "\u0ab3": "l",
  "\u0ab5": "v",
  "\u0ab6": "sh",
  "\u0ab7": "sh",
  "\u0ab8": "s",
  "\u0ab9": "h",
  "\u0abe": "a",
  "\u0abf": "i",
  "\u0ac0": "i",
  "\u0ac1": "u",
  "\u0ac2": "u",
  "\u0ac3": "ri",
  "\u0ac7": "e",
  "\u0ac8": "ai",
  "\u0acb": "o",
  "\u0acc": "au",
  "\u0acd": "",
  "\u0901": "n",
  "\u0902": "n",
  "\u0903": "h",
  "\u0905": "a",
  "\u0906": "aa",
  "\u0907": "i",
  "\u0908": "i",
  "\u0909": "u",
  "\u090a": "u",
  "\u090b": "ri",
  "\u090f": "e",
  "\u0910": "ai",
  "\u0913": "o",
  "\u0914": "au",
  "\u0915": "k",
  "\u0916": "kh",
  "\u0917": "g",
  "\u0918": "gh",
  "\u0919": "n",
  "\u091a": "ch",
  "\u091b": "chh",
  "\u091c": "j",
  "\u091d": "jh",
  "\u091e": "n",
  "\u091f": "t",
  "\u0920": "th",
  "\u0921": "d",
  "\u0922": "dh",
  "\u0923": "n",
  "\u0924": "t",
  "\u0925": "th",
  "\u0926": "d",
  "\u0927": "dh",
  "\u0928": "n",
  "\u092a": "p",
  "\u092b": "f",
  "\u092c": "b",
  "\u092d": "bh",
  "\u092e": "m",
  "\u092f": "y",
  "\u0930": "r",
  "\u0932": "l",
  "\u0933": "l",
  "\u0935": "v",
  "\u0936": "sh",
  "\u0937": "sh",
  "\u0938": "s",
  "\u0939": "h",
  "\u093e": "a",
  "\u093f": "i",
  "\u0940": "i",
  "\u0941": "u",
  "\u0942": "u",
  "\u0943": "ri",
  "\u0947": "e",
  "\u0948": "ai",
  "\u094b": "o",
  "\u094c": "au",
  "\u094d": ""
};

function transliterateIndicToLatin(value: string): string {
  return Array.from(String(value || ""))
    .map((char) => INDIC_LATIN_CHAR_MAP[char] ?? char)
    .join("");
}

function normalizeDoctorMatchText(value: string): string {
  return transliterateIndicToLatin(value)
    .toLowerCase()
    .replace(/[.,!?;:à¥¤]/g, " ")
    .replace(/\b(dr|doctor)\b/g, " ")
    .replace(/\u0aa1\u0ac9\.?/gu, " ")
    .replace(/\u0aa1\u0ac9\u0a95\u0acd\u0a9f\u0ab0/gu, " ")
    .replace(/\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0/gu, " ")
    .replace(/àª¡à«‰\.?/gu, " ")
    .replace(/àª¡à«‰àª•à«àªŸàª°/gu, " ")
    .replace(/àª¡à«‹àª•à«àªŸàª°/gu, " ")
    .replace(/à¤¡à¥‰\.?/gu, " ")
    .replace(/à¤¡à¥‰à¤•à¥à¤Ÿà¤°/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function doctorMatchScore(doctor: RuntimeDoctor, normalizedTranscript: string): number {
  const transcript = normalizeDoctorMatchText(normalizedTranscript);

  return buildDoctorAliases(doctor).reduce((bestScore, alias) => {
    const normalizedAlias = normalizeDoctorMatchText(alias);

    if (!normalizedAlias) {
      return bestScore;
    }

    const aliasTokens = normalizedAlias.split(" ").filter(Boolean);

    if (transcript.includes(normalizedAlias)) {
      return Math.max(bestScore, aliasTokens.length >= 2 ? 100 + normalizedAlias.length : 20 + normalizedAlias.length);
    }

    if (aliasTokens.length < 2) {
      return bestScore;
    }

    let cursor = 0;
    const orderedTokenMatch = aliasTokens.every((token) => {
      const foundAt = transcript.indexOf(token, cursor);
      if (foundAt === -1) {
        return false;
      }
      cursor = foundAt + token.length;
      return true;
    });

    return orderedTokenMatch ? Math.max(bestScore, 80 + normalizedAlias.length) : bestScore;
  }, 0);
}

function isEarliestAvailableDoctorRequest(normalizedTranscript: string): boolean {
  return [
    "koi bhi doctor chalega",
    "koi bhi chalega",
    "earliest available doctor",
    "earliest available",
    "earliest",
    "available doctor",
    "à¤…à¤°à¥à¤²à¤¿à¤à¤¸à¥à¤Ÿ à¤…à¤µà¥‡à¤²à¥‡à¤¬à¤²",
    "à¤…à¤°à¥à¤²à¤¿à¤à¤¸à¥à¤Ÿ à¤…à¤µà¥‡à¤²à¥‡à¤¬à¤² à¤¡à¥‰à¤•à¥à¤Ÿà¤°",
    "à¤…à¤µà¥‡à¤²à¥‡à¤¬à¤² à¤¡à¥‰à¤•à¥à¤Ÿà¤°",
    "à¤•à¥‹à¤ˆ à¤­à¥€ à¤¡à¥‰à¤•à¥à¤Ÿà¤°",
    "à¤•à¥‹à¤ˆ à¤­à¥€ à¤šà¤²à¥‡à¤—à¤¾",
    "à¤œà¤²à¥à¤¦à¥€ à¤µà¤¾à¤²à¤¾ à¤¡à¥‰à¤•à¥à¤Ÿà¤°",
    "à¤ªà¤¹à¤²à¤¾ available",
    "à¤ªà¤¹à¤²à¤¾ à¤…à¤µà¥‡à¤²à¥‡à¤¬à¤²"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function buildDoctorAliases(doctor: RuntimeDoctor): string[] {
  const rawName = doctor.name.toLowerCase();
  const noTitle = rawName.replace(/^dr\.?\s+/, "").trim();
  const nameParts = noTitle.split(/\s+/).filter(Boolean);
  const aliases = new Set<string>([rawName, noTitle, `dr ${noTitle}`, ...nameParts]);
  const devanagariParts = nameParts
    .map((part) => DEVANAGARI_NAME_ALIASES_CLEAN[part]?.[0] ?? DEVANAGARI_NAME_ALIASES[part]?.[0] ?? null)
    .filter((part): part is string => Boolean(part));
  const gujaratiParts = nameParts
    .map((part) => GUJARATI_NAME_ALIASES[part]?.[0] ?? null)
    .filter((part): part is string => Boolean(part));

  if (devanagariParts.length === nameParts.length && devanagariParts.length > 0) {
    const devanagariName = devanagariParts.join(" ");
    aliases.add(devanagariName);
    aliases.add(`à¤¡à¥‰à¤•à¥à¤Ÿà¤° ${devanagariName}`);
    aliases.add(`à¤¡à¥‰ ${devanagariName}`);
    if (devanagariParts[0]) {
      aliases.add(devanagariParts[0]);
    }
  }

  if (gujaratiParts.length === nameParts.length && gujaratiParts.length > 0) {
    const gujaratiName = gujaratiParts.join(" ");
    aliases.add(gujaratiName);
    aliases.add(`\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 ${gujaratiName}`);
    aliases.add(`\u0aa1\u0ac9 ${gujaratiName}`);
    for (const part of nameParts) {
      GUJARATI_NAME_ALIASES[part]?.forEach((alias) => aliases.add(alias));
    }
  }

  addSeededDoctorSpecializationAliases(aliases, doctor);

  if (doctor.doctorId === "doctor-1") {
    aliases.add("ananya sharma");
    aliases.add("ananya");
    aliases.add("doctor ananya");
    aliases.add("dr ananya");
    aliases.add("ananya doctor");
    aliases.add("ananya ji");
    aliases.add("ananya mam");
    aliases.add("ananya madam");
    aliases.add("à¤…à¤¨à¤¨à¥à¤¯à¤¾ à¤¶à¤°à¥à¤®à¤¾");
    aliases.add("à¤…à¤¨à¤¨à¥à¤¯à¤¾");
    aliases.add("à¤…à¤¨à¤¨à¥à¤¯à¤¾ à¤¸à¤°");
    aliases.add("à¤…à¤¨à¤¨à¥à¤¯à¤¾ à¤¡à¥‰à¤•à¥à¤Ÿà¤°");
    aliases.add("à¤¡à¥‰ à¤…à¤¨à¤¨à¥à¤¯à¤¾ à¤¶à¤°à¥à¤®à¤¾");
    aliases.add("à¤…à¤¨à¤¯à¤¾ à¤¶à¤°à¥à¤®à¤¾");
    aliases.add("à¤…à¤¨à¤¯à¤¾");
    aliases.add("à¤¡à¥‰à¤•à¥à¤Ÿà¤° à¤…à¤¨à¤¨à¥à¤¯à¤¾");
    aliases.add("à¤¡à¥‰à¤•à¥à¤Ÿà¤° à¤…à¤¨à¤¯à¤¾");
  }

  if (doctor.doctorId === "doctor-2") {
    aliases.add("rohan patel");
    aliases.add("rohan");
    aliases.add("doctor rohan");
    aliases.add("dr rohan");
    aliases.add("rohan doctor");
    aliases.add("rohan patel doctor");
    aliases.add("rohan sir");
    aliases.add("à¤°à¥‹à¤¹à¤¨ à¤ªà¤Ÿà¥‡à¤²");
    aliases.add("à¤°à¥‹à¤¹à¤¨");
    aliases.add("à¤°à¥‹à¤¹à¤¨ à¤¡à¥‰à¤•à¥à¤Ÿà¤°");
    aliases.add("à¤¡à¥‰ à¤°à¥‹à¤¹à¤¨ à¤ªà¤Ÿà¥‡à¤²");
    aliases.add("à¤¡à¥‰à¤•à¥à¤Ÿà¤° à¤°à¥‹à¤¹à¤¨");
  }

  if (doctor.doctorId === "doctor-3") {
    aliases.add("meera shah");
    aliases.add("meera");
    aliases.add("doctor meera");
    aliases.add("dr meera");
    aliases.add("meera doctor");
    aliases.add("meera shah doctor");
    aliases.add("meera mam");
    aliases.add("meera madam");
    aliases.add("à¤®à¥€à¤°à¤¾ à¤¶à¤¾à¤¹");
    aliases.add("à¤®à¥€à¤°à¤¾");
    aliases.add("à¤®à¥€à¤°à¤¾ à¤¡à¥‰à¤•à¥à¤Ÿà¤°");
    aliases.add("à¤¡à¥‰ à¤®à¥€à¤°à¤¾ à¤¶à¤¾à¤¹");
    aliases.add("à¤¡à¥‰à¤•à¥à¤Ÿà¤° à¤®à¥€à¤°à¤¾");
  }

  if (noTitle.includes("pankaj") || noTitle.includes("paresh") || (noTitle.includes("shah") && doctor.specialization.toLowerCase().includes("oncolog"))) {
    aliases.add("pankaj shah");
    aliases.add("pankaj");
    aliases.add("doctor pankaj");
    aliases.add("dr pankaj");
    aliases.add("pankaj doctor");
    aliases.add("pankaj shah doctor");
    aliases.add("pankaj sir");
    aliases.add("paresh shah");
    aliases.add("paresh");
    aliases.add("doctor paresh");
    aliases.add("dr paresh");
    aliases.add("paresh doctor");
    aliases.add("paresh shah doctor");
    aliases.add("paresh sir");
    aliases.add("pares shah");
    aliases.add("parish shah");
    aliases.add("à¤ªà¤‚à¤•à¤œ à¤¶à¤¾à¤¹");
    aliases.add("à¤ªà¤‚à¤•à¤œ");
    aliases.add("à¤¡à¥‰ à¤ªà¤‚à¤•à¤œ à¤¶à¤¾à¤¹");
    aliases.add("à¤¡à¥‰à¤•à¥à¤Ÿà¤° à¤ªà¤‚à¤•à¤œ");
    aliases.add("à¤ªà¤°à¥‡à¤¶ à¤¶à¤¾à¤¹");
    aliases.add("à¤ªà¤°à¥‡à¤¶");
    aliases.add("à¤¡à¥‰ à¤ªà¤°à¥‡à¤¶ à¤¶à¤¾à¤¹");
    aliases.add("à¤¡à¥‰à¤•à¥à¤Ÿà¤° à¤ªà¤°à¥‡à¤¶");
  }

  addGujaratiDoctorAliases(aliases, noTitle, doctor);

  return Array.from(aliases);
}

function addSeededDoctorSpecializationAliases(aliases: Set<string>, doctor: RuntimeDoctor): void {
  const specializationAliases: Record<string, string[]> = {
    "doctor-1": [
      "general medicine doctor",
      "general doctor",
      "physician doctor",
      "\u0a9c\u0aa8\u0ab0\u0ab2 \u0aae\u0ac7\u0aa1\u0abf\u0ab8\u0abf\u0aa8",
      "\u0a9c\u0aa8\u0ab0\u0ab2 \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
      "\u0aab\u0abf\u0a9d\u0abf\u0ab6\u0abf\u0aaf\u0aa8",
      "\u091c\u0928\u0930\u0932 \u092e\u0947\u0921\u093f\u0938\u093f\u0928",
      "\u091c\u0928\u0930\u0932 \u0921\u0949\u0915\u094d\u091f\u0930",
      "\u092b\u093f\u091c\u093f\u0936\u093f\u092f\u0928"
    ],
    "doctor-2": [
      "cardiology doctor",
      "cardiologist",
      "heart doctor",
      "cardiac doctor",
      "\u0a95\u0abe\u0ab0\u0acd\u0aa1\u0abf\u0aaf\u0acb\u0ab2\u0acb\u0a9c\u0ac0",
      "\u0a95\u0abe\u0ab0\u0acd\u0aa1\u0abf\u0aaf\u0acb\u0ab2\u0acb\u0a9c\u0abf\u0ab8\u0acd\u0a9f",
      "\u0ab9\u0abe\u0ab0\u0acd\u0a9f \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
      "\u0915\u093e\u0930\u094d\u0921\u093f\u092f\u094b\u0932\u0949\u091c\u0940",
      "\u0915\u093e\u0930\u094d\u0921\u093f\u092f\u094b\u0932\u0949\u091c\u093f\u0938\u094d\u091f",
      "\u0939\u093e\u0930\u094d\u091f \u0921\u0949\u0915\u094d\u091f\u0930"
    ],
    "doctor-3": [
      "dermatology doctor",
      "dermatologist",
      "skin doctor",
      "derma doctor",
      "\u0aa1\u0ab0\u0acd\u0aae\u0ac7\u0a9f\u0acb\u0ab2\u0acb\u0a9c\u0ac0",
      "\u0aa1\u0ab0\u0acd\u0aae\u0ac7\u0a9f\u0acb\u0ab2\u0acb\u0a9c\u0abf\u0ab8\u0acd\u0a9f",
      "\u0ab8\u0acd\u0a95\u0abf\u0aa8 \u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
      "\u0921\u0930\u094d\u092e\u0947\u091f\u094b\u0932\u0949\u091c\u0940",
      "\u0921\u0930\u094d\u092e\u0947\u091f\u094b\u0932\u0949\u091c\u093f\u0938\u094d\u091f",
      "\u0938\u094d\u0915\u093f\u0928 \u0921\u0949\u0915\u094d\u091f\u0930"
    ]
  };

  specializationAliases[doctor.doctorId]?.forEach((alias) => aliases.add(alias));
}

function addGujaratiDoctorAliases(aliases: Set<string>, noTitle: string, doctor: RuntimeDoctor): void {
  const specialization = doctor.specialization.toLowerCase();

  if (noTitle.includes("pankaj") || noTitle.includes("paresh") || (noTitle.includes("shah") && specialization.includes("oncolog"))) {
    [
      "\u0aaa\u0a82\u0a95\u0a9c \u0ab6\u0abe\u0ab9",
      "\u0aaa\u0a82\u0a95\u0a9c",
      "\u0aa1\u0ac9 \u0aaa\u0a82\u0a95\u0a9c \u0ab6\u0abe\u0ab9",
      "\u0aa1\u0ac9\u0a95\u0acd\u0a9f\u0ab0 \u0aaa\u0a82\u0a95\u0a9c",
      "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0aaa\u0a82\u0a95\u0a9c",
      "\u0aaa\u0a82\u0a95\u0a9c \u0a86\u0ab9\u0abe\u0ab0",
      "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0aaa\u0a82\u0a95\u0a9c \u0a86\u0ab9\u0abe\u0ab0",
      "\u0aaa\u0ab0\u0ac7\u0ab6 \u0ab6\u0abe\u0ab9",
      "\u0aaa\u0ab0\u0ac7\u0ab6",
      "\u0aa1\u0ac9 \u0aaa\u0ab0\u0ac7\u0ab6 \u0ab6\u0abe\u0ab9",
      "\u0aa1\u0ac9\u0a95\u0acd\u0a9f\u0ab0 \u0aaa\u0ab0\u0ac7\u0ab6",
      "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0 \u0aaa\u0ab0\u0ac7\u0ab6"
    ].forEach((alias) => aliases.add(alias));
  }
}

function mapDate(normalizedTranscript: string): string | null {
  if (normalizedTranscript.includes("\u0a86\u0a9c\u0ac7")) return "aaj";
  if (normalizedTranscript.includes("\u0a95\u0abe\u0ab2\u0ac7")) return "kal";

  if (["આજે", "કાલે"].some((phrase) => normalizedTranscript.includes(phrase))) {
    return normalizedTranscript.includes("કાલે") ? "kal" : "aaj";
  }
  const phrases = ["aaj", "kal", "tomorrow", "monday", "next available", "earliest slot", "आज", "कल"];
  const matched = phrases.find((phrase) => normalizedTranscript.includes(phrase));
  return matched ?? null;
}

function mapTime(normalizedTranscript: string): string | null {
  if (normalizedTranscript.includes("\u0ab8\u0ab5\u0abe\u0ab0\u0ac7")) return "morning";
  if (normalizedTranscript.includes("\u0aac\u0aaa\u0acb\u0ab0\u0ac7")) return "afternoon";
  if (normalizedTranscript.includes("\u0aac\u0aaa\u0acb\u0ab0")) return "afternoon";
  if (normalizedTranscript.includes("\u0aac\u0abe\u0aaa\u0acb\u0ab0")) return "afternoon";
  if (normalizedTranscript.includes("\u0aac\u0abe\u0aaa\u0acb\u0ab0\u0ac7")) return "afternoon";
  if (normalizedTranscript.includes("\u0ab8\u0abe\u0a82\u0a9c\u0ac7")) return "evening";

  if (normalizedTranscript.includes("àª¸àªµàª¾àª°à«‡")) return "morning";
  if (normalizedTranscript.includes("àª¬àªªà«‹àª°à«‡")) return "afternoon";
  if (normalizedTranscript.includes("àª¬àªªà«‹àª°")) return "afternoon";
  if (normalizedTranscript.includes("àª¬àª¾àªªà«‹àª°")) return "afternoon";
  if (normalizedTranscript.includes("àª¬àª¾àªªà«‹àª°à«‡")) return "afternoon";
  if (normalizedTranscript.includes("àª¸àª¾àª‚àªœà«‡")) return "evening";

  const phrases = ["morning", "afternoon", "evening", "10 baje", "11 baje", "4 pm", "5 pm", "koi bhi time chalega", "à¤¸à¥à¤¬à¤¹", "à¤¶à¤¾à¤®", "à¤¦à¥‹à¤ªà¤¹à¤°"];
  const matched = phrases.find((phrase) => normalizedTranscript.includes(phrase));
  return matched ?? null;
}

function normalizePatientNameText(value: string): string {
  return String(value || "")
    .replace(/[.,!?;:\u0964]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanGujaratiPatientNameCandidate(value: string): string | null {
  const cueWords = [
    "\u0a86",
    "\u0a8f\u0aa8\u0ac1\u0a82",
    "\u0a8f\u0aa8\u0ac1",
    "\u0a8f\u0aa8\u0abe",
    "\u0a9c\u0ac7\u0aa8\u0ac1\u0a82",
    "\u0a9c\u0ac7\u0aa8\u0ac1",
    "\u0a9c\u0ac7\u0aa8\u0abe",
    "\u0a9b\u0acb\u0a95\u0ab0\u0ac0\u0aa8\u0ac1\u0a82",
    "\u0a9b\u0acb\u0a95\u0ab0\u0abe\u0aa8\u0ac1\u0a82",
    "\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1\u0a82",
    "\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1",
    "\u0aa6\u0ab0\u0acd\u0aa6\u0ac0",
    "\u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f\u0aa8\u0ac1\u0a82",
    "\u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f",
    "\u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f\u0aa8\u0abe",
    "\u0aa8\u0abe\u0aae",
    "\u0aa8\u0abe\u0aae\u0ac7",
    "\u0a9b\u0ac7",
    "\u0a9b\u0ac1\u0a82",
    "\u0ab2\u0a96\u0acb",
    "\u0ab2\u0a96\u0ac0",
    "\u0a95\u0ab9\u0acb",
    "\u0aac\u0acb\u0ab2\u0acb",
    "\u0aac\u0aa4\u0abe\u0ab5\u0acb",
    "\u0a95\u0ab0\u0acb",
    "\u0a95\u0ab0\u0ac1\u0a82",
    "\u0aac\u0ac1\u0a95\u0abf\u0a82\u0a97"
  ];
  const cuePattern = new RegExp(`^(?:${cueWords.map(escapeRegExp).join("|")})\\s+|\\s+(?:${cueWords.map(escapeRegExp).join("|")})$`, "giu");
  const suffixWords = [
    "\u0aa8\u0ac0",
    "\u0aa8\u0abe",
    "\u0aa8\u0acb",
    "\u0aa8\u0ac7",
    "\u0aa8\u0ac1\u0a82",
    "\u0aa8\u0ac1",
    "\u0ab5\u0abe\u0ab3\u0ac0",
    "\u0ab5\u0abe\u0ab3\u0abe",
    "\u0ab5\u0abe\u0ab3\u0acb",
    "\u0ab5\u0abe\u0ab2\u0ac0",
    "\u0ab5\u0abe\u0ab2\u0abe",
    "\u0ab5\u0abe\u0ab2\u0acb",
    "\u0ab5\u0abe\u0ab2",
    "\u0aae\u0abe\u0ab0\u0abe",
    "\u0aae\u0abe\u0ab0\u0ac0",
    "\u0aae\u0abe\u0ab0\u0ac1\u0a82",
    "\u0a95\u0abe\u0a95\u0abe\u0aa8\u0ac1\u0a82",
    "\u0a95\u0abe\u0a95\u0abe\u0aa8\u0ac1",
    "\u0aae\u0abe\u0aae\u0abe\u0aa8\u0ac1\u0a82",
    "\u0aae\u0abe\u0aae\u0abe\u0aa8\u0ac1",
    "\u0aae\u0aae\u0acd\u0aae\u0ac0\u0aa8\u0ac1\u0a82",
    "\u0aae\u0aae\u0acd\u0aae\u0ac0\u0aa8\u0ac1",
    "\u0aaa\u0aaa\u0acd\u0aaa\u0abe\u0aa8\u0ac1\u0a82",
    "\u0aaa\u0aaa\u0acd\u0aaa\u0abe\u0aa8\u0ac1",
    "\u0aad\u0abe\u0a88\u0aa8\u0ac1\u0a82",
    "\u0aad\u0abe\u0a88\u0aa8\u0ac1",
    "\u0aac\u0ab9\u0ac7\u0aa8\u0aa8\u0ac1\u0a82",
    "\u0aac\u0ab9\u0ac7\u0aa8\u0aa8\u0ac1",
    "\u0aaa\u0aa4\u0acd\u0aa8\u0ac0\u0aa8\u0ac1\u0a82",
    "\u0aaa\u0aa4\u0acd\u0aa8\u0ac0\u0aa8\u0ac1",
    "\u0aaa\u0aa4\u0abf\u0aa8\u0ac1\u0a82",
    "\u0aaa\u0aa4\u0abf\u0aa8\u0ac1",
    "\u0aac\u0abe\u0ab3\u0a95\u0aa8\u0ac1\u0a82",
    "\u0aac\u0abe\u0ab3\u0a95\u0aa8\u0ac1",
    "\u0aa6\u0ac0\u0a95\u0ab0\u0abe\u0aa8\u0ac1\u0a82",
    "\u0aa6\u0ac0\u0a95\u0ab0\u0abe\u0aa8\u0ac1",
    "\u0aa6\u0ac0\u0a95\u0ab0\u0ac0\u0aa8\u0ac1\u0a82",
    "\u0aa6\u0ac0\u0a95\u0ab0\u0ac0\u0aa8\u0ac1"
  ];
  const suffixPattern = new RegExp(`\\s+(?:${suffixWords.map(escapeRegExp).join("|")})$`, "giu");
  let candidate = normalizePatientNameText(value);

  for (let index = 0; index < 4; index += 1) {
    const next = candidate
      .replace(cuePattern, " ")
      .replace(suffixPattern, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (next === candidate) break;
    candidate = next;
  }

  candidate = candidate
    .replace(/\b(please|plz|patient|name|naam|is|hai|write|book|booking|kar do|karna|karo|my|his|her|their|father|mother|mom|mum|dad|wife|husband|son|daughter|child|kid|baby|brother|sister|uncle|aunt|grandfather|grandmother|kaka|kaki|mama|mami|bhai|ben)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!candidate || /\d/.test(candidate)) {
    return null;
  }

  if (isInvalidPatientNameCandidate(candidate)) {
    return null;
  }

  const words = candidate.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 4 ? candidate : null;
}

function isInvalidPatientNameCandidate(value: string): boolean {
  const normalized = normalizePatientNameText(value).toLowerCase();

  if (!normalized) {
    return true;
  }

  if (containsAny(normalized, [
    "appointment",
    "doctor",
    "mobile",
    "number",
    "slot",
    "available",
    "earliest",
    "booking",
    "cancel",
    "cansel",
    "cansil",
    "candel",
    "kendal",
    "kendel",
    "follow",
    "patient",
    "name",
    "naam",
    "\u0a8f\u0aaa\u0acb\u0a87\u0aa8\u0acd\u0a9f\u0aae\u0ac7\u0aa8\u0acd\u0a9f",
    "\u0a85\u0aaa\u0acb\u0a87\u0aa8\u0acd\u0a9f\u0aae\u0ac7\u0aa8\u0acd\u0a9f",
    "\u0aa1\u0acb\u0a95\u0acd\u0a9f\u0ab0",
    "\u0aa1\u0ac9\u0a95\u0acd\u0a9f\u0ab0",
    "\u0a95\u0ac7\u0aa8\u0acd\u0ab8\u0ab2",
    "\u0a95\u0ac7\u0aa8\u0acd\u0abf\u0ab2",
    "\u0a95\u0ac7\u0aa8\u0acd\u0aa1\u0ab2",
    "\u0a95\u0ac7\u0aa8 \u0a95\u0ab0",
    "\u0a95\u0ab0\u0ab5\u0ac0",
    "\u0a95\u0ab0\u0ab5\u0abe\u0aa8\u0ac0",
    "\u0aae\u0acb\u0aac\u0abe\u0a87\u0ab2",
    "\u0aa8\u0a82\u0aac\u0ab0",
    "\u0ab8\u0acd\u0ab2\u0acb\u0a9f",
    "\u0aac\u0ac1\u0a95\u0abf\u0a82\u0a97",
    "\u0aa8\u0abe\u0aae \u0ab2\u0a96\u0acb",
    "\u0a9c\u0ac7\u0aa8\u0ac1\u0a82 \u0aa8\u0abe\u0aae",
    "\u0a8f\u0aa8\u0ac1\u0a82 \u0aa8\u0abe\u0aae"
  ])) {
    return true;
  }

  const onlyCue = normalized.replace(/\b(the|a|an|please|ji|ha|haan)\b/giu, " ").replace(/\s+/g, " ").trim();
  return !onlyCue;
}

function extractGujaratiPatientName(transcript: string): string | null {
  const normalized = normalizePatientNameText(transcript);
  if (!/[\u0A80-\u0AFF]/u.test(normalized)) {
    return null;
  }

  const patterns = [
    /(?:\u0aae\u0abe\u0ab0\u0ac1\u0a82|\u0aae\u0abe\u0ab0\u0ac1|\u0aae\u0abe\u0ab0\u0ac2|\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1\u0a82|\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1|\u0aa6\u0ab0\u0acd\u0aa6\u0ac0|\u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f\u0aa8\u0ac1\u0a82|\u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f|\u0a9b\u0acb\u0a95\u0ab0\u0ac0\u0aa8\u0ac1\u0a82|\u0a9b\u0acb\u0a95\u0ab0\u0abe\u0aa8\u0ac1\u0a82|\u0a8f\u0aa8\u0ac1\u0a82|\u0a8f\u0aa8\u0ac1|\u0a9c\u0ac7\u0aa8\u0ac1\u0a82|\u0a9c\u0ac7\u0aa8\u0ac1)?\s*\u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+?)(?:\s+\u0a9b\u0ac7|\s+\u0ab0\u0ab9\u0ac7\u0ab6\u0ac7|$)/iu,
    /(?:\u0aae\u0abe\u0ab0\u0abe|\u0aae\u0abe\u0ab0\u0ac0|\u0a95\u0abe\u0a95\u0abe\u0aa8\u0ac1\u0a82|\u0aae\u0abe\u0aae\u0abe\u0aa8\u0ac1\u0a82|\u0aae\u0aae\u0acd\u0aae\u0ac0\u0aa8\u0ac1\u0a82|\u0aaa\u0aaa\u0acd\u0aaa\u0abe\u0aa8\u0ac1\u0a82|\u0aad\u0abe\u0a88\u0aa8\u0ac1\u0a82|\u0aac\u0ab9\u0ac7\u0aa8\u0aa8\u0ac1\u0a82|\u0aaa\u0aa4\u0acd\u0aa8\u0ac0\u0aa8\u0ac1\u0a82|\u0aaa\u0aa4\u0abf\u0aa8\u0ac1\u0a82|\u0aac\u0abe\u0ab3\u0a95\u0aa8\u0ac1\u0a82|\u0aa6\u0ac0\u0a95\u0ab0\u0abe\u0aa8\u0ac1\u0a82|\u0aa6\u0ac0\u0a95\u0ab0\u0ac0\u0aa8\u0ac1\u0a82)\s+\u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+?)(?:\s+\u0a9b\u0ac7|\s+\u0ab0\u0ab9\u0ac7\u0ab6\u0ac7|$)/iu,
    /([\p{L}\p{M} ]+?)\s+\u0aa8\u0abe\u0aae\u0ac7\s+(?:\u0aac\u0ac1\u0a95|\u0aac\u0ac1\u0a95\u0abf\u0a82\u0a97|\u0a85\u0aaa\u0acb\u0a87\u0aa8\u0acd\u0a9f)/iu
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const rawCandidate = match?.[2] ?? match?.[1];
    if (rawCandidate) {
      const candidate = cleanGujaratiPatientNameCandidate(rawCandidate);
      if (candidate) {
        return candidate;
      }
    }
  }

  const shortRelationPattern = /^(?:\u0aae\u0abe\u0ab0\u0abe|\u0aae\u0abe\u0ab0\u0ac0|\u0aae\u0abe\u0ab0\u0ac1\u0a82)\s+(?:\u0a95\u0abe\u0a95\u0abe|\u0a95\u0abe\u0a95\u0ac0|\u0aae\u0abe\u0aae\u0abe|\u0aae\u0abe\u0aae\u0ac0|\u0aae\u0aae\u0acd\u0aae\u0ac0|\u0aaa\u0aaa\u0acd\u0aaa\u0abe|\u0aaa\u0aa4\u0abf|\u0aaa\u0aa4\u0acd\u0aa8\u0ac0|\u0aad\u0abe\u0a88|\u0aac\u0ab9\u0ac7\u0aa8|\u0aac\u0abe\u0ab3\u0a95|\u0aa6\u0ac0\u0a95\u0ab0\u0acb|\u0aa6\u0ac0\u0a95\u0ab0\u0ac0)\s+([\p{L}\p{M} ]+)$/iu;
  const shortRelationMatch = normalized.match(shortRelationPattern);
  if (shortRelationMatch?.[1]) {
    const candidate = cleanGujaratiPatientNameCandidate(shortRelationMatch[1]);
    if (candidate) {
      return candidate;
    }
  }

  const direct = cleanGujaratiPatientNameCandidate(normalized);
  return direct && direct.split(/\s+/).length <= 3 ? direct : null;
}

function isPatientNameCueOnly(transcript: string): boolean {
  const cleaned = String(transcript || "")
    .toLowerCase()
    .replace(/[.,!?;:à¥¤]/g, " ")
    .replace(/(àª®àª¾àª°à«àª‚|àª®àª¾àª°à«|àª®àª¾àª°à«‚|àª®àª¾àª°à«‚àª‚|àª¨àª¾àª®|àª›à«‡|àª¦àª°à«àª¦à«€àª¨à«àª‚|àª¦àª°à«àª¦à«€àª¨à«|àª¦àª°à«àª¦à«€|àª•àª¹à«‹|àª¬àª¤àª¾àªµà«‹|àªœà«€|àª¹àª¾)/gu, " ")
    .replace(/\b(mera|mere|my|name|naam|patient|is|hai|ji|haan|ha)\b/giu, " ")
    .replace(/(à¤®à¥‡à¤°à¤¾|à¤®à¥‡à¤°à¥‡|à¤¨à¤¾à¤®|à¤¹à¥ˆ|à¤®à¤°à¥€à¤œà¤¼|à¤®à¤°à¥€à¤œ|à¤°à¥‹à¤—à¥€|à¤œà¥€|à¤¹à¤¾à¤|à¤¹à¤¾à¤‚)/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return !cleaned;
}

function isPromptLikePatientName(transcript: string): boolean {
  const normalized = String(transcript || "")
    .toLowerCase()
    .replace(/[.,!?;:à¥¤]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return false;
  }

  return [
    /^દર્દીનું નામ$/u,
    /^દર્દીનુ નામ$/u,
    /^દર્દીનું નામ છે$/u,
    /^દર્દીનુ નામ છે$/u,
    /^દર્દીનું$/u,
    /^દર્દીનુ$/u,
    /^દર્દી નામ$/u,
    /^પેશન્ટનું નામ$/u,
    /^પેશન્ટનુ નામ$/u,
    /^પેશન્ટનું નામ છે$/u,
    /^પેશન્ટનુ નામ છે$/u,
    /^પેશન્ટ$/u,
    /^દર્દી$/u,
    /^જેનું નામ$/u,
    /^જેનુ નામ$/u,
    /^એનું નામ$/u,
    /^એનુ નામ$/u,
    /^patient nu name$/iu,
    /^patient name che$/iu,
    /^patient name$/iu,
    /^patient ka name$/iu,
    /^dardi nu naam$/iu,
    /^dardi nu nam$/iu,
    /^dardi naam$/iu,
    /^dardi nu naam che$/iu,
    /^jenu naam$/iu,
    /^enu naam$/iu,
    /^name$/iu,
    /^naam$/iu,
    /^mera naam$/iu,
    /^mera$/iu,
    /^my name$/iu,
    /^his name$/iu,
    /^her name$/iu,
    /^their name$/iu
  ].some((pattern) => pattern.test(normalized));
}

function isPromptLikeDoctorPreference(transcript: string): boolean {
  const normalized = String(transcript || "").toLowerCase().replace(/[.,!?;:à¥¤]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  return [
    "which doctor would you like",
    "doctor preference",
    "specific doctor",
    "do you want a specific doctor",
    "kaunsa doctor",
    "konsa doctor",
    "koun sa doctor",
    "kis doctor",
    "koi doctor",
    "કયા ડોક્ટર",
    "કોઈ ચોક્કસ ડોક્ટર",
    "ચોક્કસ ડોક્ટર",
    "ડોક્ટર પસંદગી",
    "કયા ડૉક્ટર",
    "કયો ડૉક્ટર",
    "डॉक्टर पसंद",
    "कौन से डॉक्टर",
    "किस डॉक्टर"
  ].some((phrase) => normalized.includes(phrase));
}

function isPromptLikeDateRequest(transcript: string): boolean {
  const normalized = String(transcript || "").toLowerCase().replace(/[.,!?;:à¥¤]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  return [
    "which day would you like",
    "which day do you want",
    "kis din ka appointment",
    "kis din chahiye",
    "kis din",
    "which date",
    "કયા દિવસે એપોઇન્ટમેન્ટ જોઈએ",
    "કયા દિવસે જોઈએ",
    "કયા દિવસે",
    "किस दिन का अपॉइंटमेंट",
    "किस दिन चाहिए",
    "किस दिन"
  ].some((phrase) => normalized.includes(phrase));
}

function isPromptLikeTimeRequest(transcript: string): boolean {
  const normalized = String(transcript || "").toLowerCase().replace(/[.,!?;:à¥¤]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  return [
    "which time slot",
    "what time slot",
    "do you prefer morning afternoon or evening",
    "morning afternoon evening",
    "kaunsa slot",
    "konsa slot",
    "कौन सा स्लॉट",
    "कौन सा time",
    "કયો slot",
    "કયો સમય",
    "મોર્નિંગ આફ્ટરનૂન ઈવનિંગ"
  ].some((phrase) => normalized.includes(phrase));
}

function isPromptLikeMobileRequest(transcript: string): boolean {
  const normalized = String(transcript || "").toLowerCase().replace(/[.,!?;:à¥¤]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  return [
    "mobile number",
    "phone number",
    "what is your mobile number",
    "please tell me the mobile number",
    "કૃપા કરીને mobile number કહો",
    "mobile number કહો",
    "mobail number",
    "मोबाइल नंबर",
    "फोन नंबर"
  ].some((phrase) => normalized.includes(phrase));
}

function isPromptLikePatientType(transcript: string): boolean {
  const normalized = String(transcript || "").toLowerCase().replace(/[.,!?;:à¥¤]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  return [
    "new patient or follow up",
    "new patient",
    "follow up",
    "first time or follow up",
    "pehli baar ya follow up",
    "કરતા પહેલી વાર",
    "નવો દર્દી",
    "ફોલો અપ",
    "नया मरीज",
    "फॉलो अप"
  ].some((phrase) => normalized.includes(phrase));
}

function isPlainYesNoUtterance(transcript: string): boolean {
  const normalized = String(transcript || "")
    .toLowerCase()
    .replace(/[.,!?;:à¥¤]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || !mapYesNo(normalized)) {
    return false;
  }

  const fillerTokens = new Set([
    "yes", "no", "nah", "nope", "haan", "ha", "nahi", "nahin", "ji", "jee",
    "na", "mat", "theek", "thik", "hai", "bilkul",
    "હા", "હાં", "ના", "નહી", "નહીં", "જી", "બરાબર", "સાચું", "સાચુ", "સહી",
    "हाँ", "हा", "नहीं", "नही", "ना", "जी", "ठीक", "है", "बिलकुल"
  ]);

  return normalized
    .split(" ")
    .filter(Boolean)
    .every((token) => fillerTokens.has(token));
}

function extractPatientNameFromEmbeddedCue(transcript: string): string | null {
  const normalized = normalizePatientNameText(transcript);
  if (!normalized) {
    return null;
  }

  const patterns = [
    /^(?:[\p{L}\p{M} ]+?\s+)?\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1\u0a82 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+)$/iu,
    /^(?:[\p{L}\p{M} ]+?\s+)?\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+)$/iu,
    /^(?:[\p{L}\p{M} ]+?\s+)?\u0aa6\u0ab0\u0acd\u0aa6\u0ac0 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+)$/iu,
    /^(?:[\p{L}\p{M} ]+?\s+)?\u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f\u0aa8\u0ac1\u0a82 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+)$/iu,
    /^(?:[\p{L}\p{M} ]+?\s+)?\u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+)$/iu,
    /^(?:[\p{L}\p{M} ]+?\s+)?patient name\s+([\p{L}\p{M} ]+)$/iu,
    /^(?:[\p{L}\p{M} ]+?\s+)?dardi nu naam\s+([\p{L}\p{M} ]+)$/iu,
    /^(?:[\p{L}\p{M} ]+?\s+)?(?:mera naam|my name)\s+([\p{L}\p{M} ]+)$/iu
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const candidate = cleanExtractedPatientName(match[1]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extractPatientName(transcript: string): string | null {
  if (isPromptLikePatientName(transcript)) {
    return null;
  }

  if (isPlainYesNoUtterance(transcript)) {
    return null;
  }

  const embeddedCueName = extractPatientNameFromEmbeddedCue(transcript);
  if (embeddedCueName) {
    return embeddedCueName;
  }

  const gujaratiName = extractGujaratiPatientName(transcript);
  if (gujaratiName) {
    return gujaratiName;
  }

  if (isPatientNameCueOnly(transcript)) {
    return null;
  }

  const cleanedCandidate = cleanPatientName(transcript);

  if (cleanedCandidate) {
    return cleanedCandidate;
  }

  const patterns = [
    /mera naam\s+([\p{L}\p{M} ]+?)\s+hai/iu,
    /mera naam\s+([\p{L}\p{M} ]+)/iu,
    /(?:mere|meri|my|his|her|their)\s+(?:father|mother|mom|mum|dad|wife|husband|son|daughter|child|kid|baby|brother|sister|uncle|aunt|grandfather|grandmother|patient)\s+name is\s+([\p{L}\p{M} ]+)/iu,
    /(?:mere|meri)\s+(?:papa|mummy|mammi|maa|baap|pitaji|mataji|beta|beti|bachche|bachcha|bhai|behen|kaka|kaki|mama|mami|patni|pati)\s+ka\s+naam\s+([\p{L}\p{M} ]+?)\s+hai/iu,
    /(?:mere|meri)\s+(?:papa|mummy|mammi|maa|baap|pitaji|mataji|beta|beti|bachche|bachcha|bhai|behen|kaka|kaki|mama|mami|patni|pati)\s+ka\s+naam\s+([\p{L}\p{M} ]+)/iu,
    /(?:mere|meri)\s+(?:papa|mummy|mammi|maa|baap|pitaji|mataji|beta|beti|bachche|bachcha|bhai|behen|kaka|kaki|mama|mami|patni|pati)\s+([\p{L}\p{M} ]+)$/iu,
    /(?:my|his|her|their)\s+(?:father|mother|mom|mum|dad|wife|husband|son|daughter|child|kid|baby|brother|sister|uncle|aunt|grandfather|grandmother)\s+([\p{L}\p{M} ]+)$/iu,
    /my name is\s+([\p{L}\p{M} ]+)/iu,
    /patient name\s+([\p{L}\p{M} ]+)/iu,
    /\u0aae\u0abe\u0ab0\u0ac1\u0a82 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+?)\s+\u0a9b\u0ac7/iu,
    /\u0aae\u0abe\u0ab0\u0ac1 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+?)\s+\u0a9b\u0ac7/iu,
    /\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1\u0a82 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+?)\s+\u0a9b\u0ac7/iu,
    /\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+?)\s+\u0a9b\u0ac7/iu,
    /\u0aa6\u0ab0\u0acd\u0aa6\u0ac0 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+?)\s+\u0a9b\u0ac7/iu,
    /\u0aae\u0abe\u0ab0\u0ac1\u0a82 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+)/iu,
    /\u0aae\u0abe\u0ab0\u0ac1 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+)/iu,
    /\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1\u0a82 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+)/iu,
    /\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+)/iu,
    /\u0aa6\u0ab0\u0acd\u0aa6\u0ac0 \u0aa8\u0abe\u0aae\s+([\p{L}\p{M} ]+)/iu,
    /àª®àª¾àª°à«àª‚ àª¨àª¾àª®\s+([\p{L}\p{M} ]+?)\s+àª›à«‡/iu,
    /àª®àª¾àª°à« àª¨àª¾àª®\s+([\p{L}\p{M} ]+?)\s+àª›à«‡/iu,
    /àª®àª¾àª°à«àª‚ àª¨àª¾àª®\s+([\p{L}\p{M} ]+)/iu,
    /àª®àª¾àª°à« àª¨àª¾àª®\s+([\p{L}\p{M} ]+)/iu,
    /à¤®à¥‡à¤°à¤¾ à¤¨à¤¾à¤®\s+([\p{L}\p{M} ]+?)\s+à¤¹à¥ˆ/iu,
    /à¤®à¥‡à¤°à¤¾ à¤¨à¤¾à¤®\s+([\p{L}\p{M} ]+)/iu
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (match?.[1]) {
      const candidate = cleanExtractedPatientName(match[1]);
      if (candidate) {
        return candidate;
      }
    }
  }

  const cleaned = transcript
    .replace(/[.,!?;:à¥¤]/g, " ")
    .replace(/\b(àª®àª¾àª°à«àª‚|àª®àª¾àª°à«|àª¨àª¾àª®|àª›à«‡|àª¦àª°à«àª¦à«€)\b/gu, " ")
    .replace(/\b(mera|mere|meri|naam|hai|my|name|is|patient|his|her|their|father|mother|mom|mum|dad|wife|husband|son|daughter|child|kid|baby|brother|sister|uncle|aunt|grandfather|grandmother|papa|mummy|mammi|maa|baap|pitaji|mataji|beta|beti|bachche|bachcha|bhai|behen|kaka|kaki|mama|mami|patni|pati)\b/giu, " ")
    .replace(/\b(à¤®à¥‡à¤°à¤¾|à¤®à¥‡à¤°à¥‡|à¤®à¥‡à¤°à¥€|à¤¨à¤¾à¤®|à¤¹à¥ˆ|à¤ªà¤¾à¤ªà¤¾|à¤®à¤®à¥à¤®à¥€|à¤®à¤¾à¤|à¤¬à¤¾à¤ª|à¤ªà¤¿à¤¤à¤¾à¤œà¥€|à¤®à¤¾à¤¤à¤¾à¤œà¥€|à¤¬à¥‡à¤Ÿà¤¾|à¤¬à¥‡à¤Ÿà¥€|à¤¬à¤šà¥à¤šà¥‡|à¤¬à¤šà¥à¤šà¤¾|à¤­à¤¾à¤ˆ|à¤¬à¤¹à¤¨|à¤ªà¤¤à¥à¤¨à¥€|à¤ªà¤¤à¤¿)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || /\d/.test(cleaned)) {
    return null;
  }

  const words = cleaned.split(" ").filter(Boolean);

  return words.length >= 1 && words.length <= 3 ? cleanExtractedPatientName(cleaned) : null;
}

function cleanExtractedPatientName(value: string): string | null {
  const candidate = String(value || "")
    .replace(/[.,!?;:à¥¤]/g, " ")
    .replace(/\b(àª®àª¾àª°à«àª‚|àª®àª¾àª°à«|àª¨àª¾àª®|àª›à«‡|àª¦àª°à«àª¦à«€|àª¹àª¾|àªœà«€|àª®àª¾àª°àª¾|àª®àª¾àª°à«€|àª•àª¾àª•àª¾àª¨à«àª‚|àª®àª¾àª®àª¾àª¨à«àª‚|àª®àª®à«àª®à«€àª¨à«àª‚|àªªàªªà«àªªàª¾àª¨à«àª‚|àª­àª¾àªˆàª¨à«àª‚|àª¬àª¹à«‡àª¨àª¨à«àª‚|àªªàª¤à«àª¨à«€àª¨à«àª‚|àªªàª¤àª¿àª¨à«àª‚|àª¬àª¾àª³àª•àª¨à«àª‚|àª¦à«€àª•àª°àª¾àª¨à«àª‚|àª¦à«€àª•àª°à«€àª¨à«àª‚)\b/gu, " ")
    .replace(/\b(ji|jee|haan|ha|mera|mere|meri|naam|name|my|his|her|their|is|hai|patient|father|mother|mom|mum|dad|wife|husband|son|daughter|child|kid|baby|brother|sister|uncle|aunt|grandfather|grandmother|kaka|kaki|mama|mami|bhai|behen)\b/giu, " ")
    .replace(/\b(à¤œà¥€|à¤¹à¤¾à¤|à¤¹à¤¾à¤‚|à¤®à¥‡à¤°à¤¾|à¤®à¥‡à¤°à¥‡|à¤®à¥‡à¤°à¥€|à¤¨à¤¾à¤®|à¤¹à¥ˆ|à¤®à¥ˆà¤‚|à¤®à¥‡|à¤®à¥‡à¤‚|à¤ªà¤¾à¤ªà¤¾|à¤®à¤®à¥à¤®à¥€|à¤®à¤¾à¤|à¤¬à¤¾à¤ª|à¤ªà¤¿à¤¤à¤¾à¤œà¥€|à¤®à¤¾à¤¤à¤¾à¤œà¥€|à¤¬à¥‡à¤Ÿà¤¾|à¤¬à¥‡à¤Ÿà¥€|à¤¬à¤šà¥à¤šà¤¾|à¤¬à¤šà¥à¤šà¥‡|à¤­à¤¾à¤ˆ|à¤¬à¤¹à¤¨|à¤ªà¤¤à¥à¤¨à¥€|à¤ªà¤¤à¤¿|à¤°à¥‹à¤—à¥€|à¤®à¤°à¥€à¤œà¤¼|à¤®à¤°à¥€à¤œ)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!candidate || /\d/.test(candidate)) {
    return null;
  }

  if (isPromptLikePatientName(candidate)) {
    return null;
  }

  if ([
    "દર્દી",
    "દર્દીનું નામ",
    "દર્દીનુ નામ",
    "પેશન્ટ",
    "પેશન્ટનું નામ",
    "પેશન્ટનુ નામ",
    "જેનું નામ",
    "જેનુ નામ",
    "એનું નામ",
    "એનુ નામ",
    "patient",
    "patient name",
    "name",
    "naam",
    "my name",
    "mera naam",
    "his name",
    "her name"
  ].includes(candidate.toLowerCase())) {
    return null;
  }

  const words = candidate.split(" ").filter(Boolean);
  const looksLikeCueOnly = /^(mera|naam|name|my|patient|à¤œà¥€|à¤®à¥‡à¤°à¤¾|à¤¨à¤¾à¤®)$/iu.test(candidate);
  const looksLikeNameOnly = words.length <= 3 && !/(appointment|doctor|mobile|number|slot|book|àª…àªªà«‹àª‡àª¨à«àªŸàª®à«‡àª¨à«àªŸ|àªàªªà«‹àª‡àª¨à«àªŸàª®à«‡àª¨à«àªŸ|àª¡à«‹àª•à«àªŸàª°|àª¡à«‰àª•à«àªŸàª°|àª®à«‹àª¬àª¾àª‡àª²|àª®à«‹àª¬àª¾àªˆàª²|àª¨àª‚àª¬àª°|àª¸à«àª²à«‹àªŸ|à¤¬à¥à¤•|à¤¡à¥‰à¤•à¥à¤Ÿà¤°|à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ|à¤…à¤ªà¥‹à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ|à¤®à¥‹à¤¬à¤¾à¤‡à¤²|à¤¨à¤‚à¤¬à¤°|à¤¸à¥à¤²à¥‰à¤Ÿ)/iu.test(candidate);

  return !looksLikeCueOnly && looksLikeNameOnly ? candidate : null;
}

function cleanPatientName(transcript: string): string | null {
  const normalized = String(transcript || "")
    .replace(/[.,!?;:à¥¤]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || /\d/.test(normalized)) {
    return null;
  }

  if (isPromptLikePatientName(normalized)) {
    return null;
  }

  const hasNameCue = /\b(mera|name|naam|patient)\b/i.test(normalized) || /(àª®àª¾àª°à«àª‚|àª®àª¾àª°à«|àª¨àª¾àª®|à¤®à¥‡à¤°à¤¾|à¤¨à¤¾à¤®)/u.test(normalized);
  const candidate = normalized
    .replace(/\b(àª®àª¾àª°à«àª‚|àª®àª¾àª°à«|àª¨àª¾àª®|àª›à«‡|àª¦àª°à«àª¦à«€|àª¹àª¾|àªœà«€)\b/gu, " ")
    .replace(/\b(ji|jee|haan|ha|mera|naam|name|my|is|hai|patient)\b/giu, " ")
    .replace(/\b(à¤¬à¤¤à¤¾à¤‡à¤|à¤¬à¤¤à¤¾à¤¯à¥‡|à¤¬à¤¤à¤¾à¤à¤‚)\b/gu, " ")
    .replace(/\b(à¤œà¥€|à¤¹à¤¾à¤|à¤¹à¤¾à¤‚|à¤®à¥‡à¤°à¤¾|à¤¨à¤¾à¤®|à¤¹à¥ˆ|à¤®à¥ˆà¤‚|à¤®à¥‡|à¤®à¥‡à¤‚)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const cleaned = cleanExtractedPatientName(candidate);
  return cleaned && (hasNameCue || cleaned.split(" ").filter(Boolean).length === 1) ? cleaned : null;
}

function extractMobile(transcript: string): string | null {
  const digits = normalizeIndicDigits(normalizeSpokenDigits(transcript))
    .replace(/[à¥¦-à¥¯]/g, (digit) => String("à¥¦à¥§à¥¨à¥©à¥ªà¥«à¥¬à¥­à¥®à¥¯".indexOf(digit)))
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

  const spokenDigits = normalizeIndicDigits(normalizeSpokenDigits(transcript))
    .replace(/[à¥¦-à¥¯]/g, (digit) => String("à¥¦à¥§à¥¨à¥©à¥ªà¥«à¥¬à¥­à¥®à¥¯".indexOf(digit)))
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

function extractMobileDigitFragment(transcript: string): string {
  return normalizeIndicDigits(normalizeSpokenDigits(transcript))
    .replace(/[\u0966-\u096F]/g, (digit) => String("\u0966\u0967\u0968\u0969\u096A\u096B\u096C\u096D\u096E\u096F".indexOf(digit)))
    .replace(/\D/g, "");
}

function buildPartialMobilePrompt(digits: string, prompts?: ConversationPrompts): string {
  return renderPrompt((prompts ?? DEFAULT_PROMPTS).partialMobilePrompt, {
    digits,
    remainingDigits: Math.max(0, 10 - digits.length)
  });
}

function resolvePartialMobile(
  transcript: string,
  session: DemoSessionRecord,
  prompts?: ConversationPrompts
): { mobile: string; partialMobileDigits: null } | { partialMobileDigits: string; reply: string } | null {
  const fragment = extractMobileDigitFragment(transcript);
  const existing = (session.partialMobileDigits ?? "").replace(/\D/g, "");

  if (!fragment) {
    return null;
  }

  if (fragment.length >= 10) {
    return { mobile: normalizePhoneLast10(fragment) ?? fragment.slice(-10), partialMobileDigits: null };
  }

  if (!existing && fragment.length < 4) {
    return null;
  }

  if (existing && fragment.length === 1 && !hasExplicitMobileDigitCue(transcript)) {
    return null;
  }

  const combined = `${existing}${fragment}`;

  if (combined.length >= 10) {
    return { mobile: combined.slice(0, 10), partialMobileDigits: null };
  }

  return {
    partialMobileDigits: combined,
    reply: buildPartialMobilePrompt(combined, prompts)
  };
}

function hasExplicitMobileDigitCue(transcript: string): boolean {
  const value = normalizeIndicDigits(String(transcript || "")).toLowerCase();

  if (/\d/.test(value)) {
    return true;
  }

  return [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "shunya",
    "ek",
    "be",
    "tran",
    "char",
    "panch",
    "saat",
    "aath",
    "nav",
    "\u0ab6\u0ac2\u0aa8\u0acd\u0aaf",
    "\u0a8f\u0a95",
    "\u0aac\u0ac7",
    "\u0aa4\u0acd\u0ab0\u0aa3",
    "\u0a9a\u0abe\u0ab0",
    "\u0aaa\u0abe\u0a82\u0a9a",
    "\u0aaa\u0abe\u0a9a",
    "\u0a9b",
    "\u0ab8\u0abe\u0aa4",
    "\u0a86\u0aa0",
    "\u0aa8\u0ab5"
  ].some((cue) => value.includes(cue));
}

function normalizeIndicDigits(value: string): string {
  return String(value || "")
    .replace(/[\u0966-\u096F]/g, (digit) => String("\u0966\u0967\u0968\u0969\u096A\u096B\u096C\u096D\u096E\u096F".indexOf(digit)))
    .replace(/[\u0AE6-\u0AEF]/g, (digit) => String("\u0AE6\u0AE7\u0AE8\u0AE9\u0AEA\u0AEB\u0AEC\u0AED\u0AEE\u0AEF".indexOf(digit)));
}

function normalizeSpokenDigitsIntelligent(transcript: string): string {
  const digitWords: Record<string, string> = {
    zero: "0",
    ziro: "0",
    jiro: "0",
    oh: "0",
    o: "0",
    shunya: "0",
    sunya: "0",
    one: "1",
    won: "1",
    van: "1",
    ek: "1",
    two: "2",
    to: "2",
    too: "2",
    do: "2",
    three: "3",
    tree: "3",
    teen: "3",
    four: "4",
    for: "4",
    char: "4",
    chaar: "4",
    five: "5",
    faiv: "5",
    panch: "5",
    paanch: "5",
    six: "6",
    chhe: "6",
    che: "6",
    cha: "6",
    chha: "6",
    chhah: "6",
    seven: "7",
    saat: "7",
    sat: "7",
    eight: "8",
    aath: "8",
    ath: "8",
    aat: "8",
    nine: "9",
    nain: "9",
    nau: "9",
    no: "9",
    "\u0ab6\u0ac2\u0aa8\u0acd\u0aaf": "0",
    "\u0a9d\u0ac0\u0ab0\u0acb": "0",
    "\u0a9c\u0ac0\u0ab0\u0acb": "0",
    "\u0a8f\u0a95": "1",
    "\u0aac\u0ac7": "2",
    "\u0aa4\u0acd\u0ab0\u0aa3": "3",
    "\u0a9a\u0abe\u0ab0": "4",
    "\u0aaa\u0abe\u0a82\u0a9a": "5",
    "\u0aaa\u0abe\u0a9a": "5",
    "\u0a9b": "6",
    "\u0a9b\u0ac7": "6",
    "\u0ab8\u0abe\u0aa4": "7",
    "\u0a86\u0aa0": "8",
    "\u0a86\u0aa5": "8",
    "\u0aa8\u0ab5": "9",
    "\u0aa8\u0acc": "9",
    "\u0aaa\u0a82\u0aa6\u0ab0": "15",
    "\u0aaa\u0a82\u0aa6\u0ab0\u0ab9": "15",
    "\u0a9b\u0aa8\u0ac1": "96",
    "\u0a9b\u0aa8\u0ac1\u0a82": "96",
    "\u0a9b\u0aa8\u0acd\u0aa8\u0ac1": "96",
    "\u0a9b\u0aa8\u0acd\u0aa8\u0ac1\u0a82": "96",
    "\u0a9b\u0ac7\u0aa4\u0abe\u0ab2\u0ac0\u0ab8": "46",
    "\u0a9b\u0ac7\u0aa4\u0abe\u0ab2\u0ac0\u0ab6": "46",
    "\u0a9a\u0ac7\u0aa4\u0abe\u0ab2\u0ac0\u0ab8": "46",
    "\u0a9a\u0ac7\u0aa4\u0abe\u0ab2\u0ac0\u0ab6": "46",
    "\u0a9b\u0aa4\u0abe\u0ab2\u0ac0\u0ab8": "46",
    "\u0ab8\u0aa4\u0acd\u0aaf\u0acb\u0aa4\u0ac7\u0ab0": "77",
    "\u0ab8\u0abf\u0aa4\u0acd\u0aa4\u0acb\u0aa4\u0ac7\u0ab0": "77",
    "\u0ab8\u0aa4\u0acd\u0aa4\u0acb\u0aa4\u0ac7\u0ab0": "77",
    "\u0ab8\u0abf\u0aa4\u0acd\u0aa4\u0ac7\u0ab0": "77",
    "\u0a9a\u0abe\u0ab3\u0ac0\u0ab6": "40",
    "\u0a9a\u0abe\u0ab2\u0ac0\u0ab8": "40",
    "\u0936\u0942\u0928\u094d\u092f": "0",
    "\u091c\u0940\u0930\u094b": "0",
    "\u091c\u093c\u0940\u0930\u094b": "0",
    "\u090f\u0915": "1",
    "\u0935\u0928": "1",
    "\u0926\u094b": "2",
    "\u091f\u0942": "2",
    "\u0924\u0940\u0928": "3",
    "\u0925\u094d\u0930\u0940": "3",
    "\u091a\u093e\u0930": "4",
    "\u092b\u094b\u0930": "4",
    "\u092a\u093e\u0902\u091a": "5",
    "\u092a\u093e\u0901\u091a": "5",
    "\u092b\u093e\u0907\u0935": "5",
    "\u091b": "6",
    "\u091b\u0903": "6",
    "\u091b\u0939": "6",
    "\u0938\u093f\u0915\u094d\u0938": "6",
    "\u0938\u093e\u0924": "7",
    "\u0938\u0947\u0935\u0928": "7",
    "\u0906\u0920": "8",
    "\u090f\u091f": "8",
    "\u0928\u094c": "9",
    "\u0928\u093e\u0907\u0928": "9",
    "\u092a\u0902\u0926\u094d\u0930\u0939": "15",
    "\u091a\u093e\u0932\u0940\u0938": "40"
  };

  const repeatWords: Record<string, number> = {
    double: 2,
    dabal: 2,
    dabble: 2,
    "\u0aa1\u0aac\u0ab2": 2,
    "\u0921\u092c\u0932": 2,
    triple: 3,
    tripal: 3,
    "\u0a9f\u0acd\u0ab0\u0abf\u0aaa\u0ab2": 3,
    "\u091f\u094d\u0930\u093f\u092a\u0932": 3
  };

  const parts = normalizeIndicDigits(String(transcript || ""))
    .toLowerCase()
    .replace(/[.,!?;:\u0964à¥¤|/\\()[\]{}"'`~_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const normalizedParts: string[] = [];
  let pendingRepeat = 0;

  for (const part of parts) {
    const repeat = repeatWords[part];

    if (repeat) {
      pendingRepeat = repeat;
      continue;
    }

    const mapped = digitWords[part] ?? (/^\d+$/.test(part) ? part : null);

    if (mapped) {
      normalizedParts.push(pendingRepeat ? mapped.repeat(pendingRepeat) : mapped);
      pendingRepeat = 0;
      continue;
    }

    pendingRepeat = 0;
    normalizedParts.push(part);
  }

  return normalizedParts.join(" ");
}

function normalizeSpokenDigits(transcript: string): string {
  return normalizeSpokenDigitsIntelligent(transcript);
}

function mapPatientType(normalizedTranscript: string): string | null {
  if (
    normalizedTranscript.includes("\u0aa8\u0acd\u0aaf\u0ac1 \u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f")
    || normalizedTranscript.includes("\u0aa8\u0acd\u0aaf\u0ac2 \u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f")
    || normalizedTranscript.includes("\u0aa8\u0ab5\u0acb \u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f")
    || normalizedTranscript.includes("\u0aa8\u0ab5\u0abe \u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f")
    || normalizedTranscript.includes("\u0aa8\u0ab5\u0acb \u0aa6\u0ab0\u0acd\u0aa6\u0ac0")
    || normalizedTranscript.includes("\u0aa8\u0ab5\u0abe \u0aa6\u0ab0\u0acd\u0aa6\u0ac0")
    || normalizedTranscript.includes("first time")
    || normalizedTranscript.includes("first-time")
    || normalizedTranscript.includes("new visitor")
    || normalizedTranscript.includes("new case")
    ||
    normalizedTranscript.includes("àª¨à«àª¯à« àªªà«‡àª¶àª¨à«àªŸ")
    || normalizedTranscript.includes("àª¨à«àª¯à«‚ àªªà«‡àª¶àª¨à«àªŸ")
    || normalizedTranscript.includes("àª¨àªµà«‹ àªªà«‡àª¶àª¨à«àªŸ")
    || normalizedTranscript.includes("àª¨àªµàª¾ àªªà«‡àª¶àª¨à«àªŸ")
    || normalizedTranscript.includes("àª¨àªµà«‹ àª¦àª°à«àª¦à«€")
    || normalizedTranscript.includes("àª¨àªµàª¾ àª¦àª°à«àª¦à«€")
    || normalizedTranscript.includes("new àªªà«‡àª¶àª¨à«àªŸ")
    ||
    normalizedTranscript.includes("à¤¨à¤¯à¤¾ à¤®à¤°à¥€à¤œ")
    || normalizedTranscript.includes("à¤¨à¥à¤¯à¥‚ à¤ªà¥‡à¤¶à¥‡à¤‚à¤Ÿ")
    || normalizedTranscript.includes("à¤¨à¥à¤¯à¥‚ à¤ªà¥‡à¤¶à¥‡à¤‚à¤Ÿ à¤¹à¥ˆ")
    || normalizedTranscript.includes("gnu patient")
    || normalizedTranscript.includes("gnu")
    || normalizedTranscript.includes("nyu patient")
    || normalizedTranscript.includes("new base")
    || normalizedTranscript.includes("new pes")
    || normalizedTranscript.includes("à¤¨à¥à¤¯à¥‚ à¤ªà¥‡à¤¶à¥‡à¤‚à¤Ÿ")
    || normalizedTranscript.includes("à¤¨à¥à¤¯à¥‚ à¤ªà¥‡à¤¶")
    || normalizedTranscript.includes("new à¤ªà¥‡à¤¶")
    || normalizedTranscript.includes("à¤¨à¥à¤¯à¥‚ à¤ªà¥‡à¤¶")
    || normalizedTranscript.includes("પહેલી વાર")
    || normalizedTranscript.includes("પહેલીવાર")
    || normalizedTranscript.includes("પહેલી જ વાર")
    || normalizedTranscript.includes("પ્રથમ વાર")
    || normalizedTranscript.includes("નવી દર્દી")
    || normalizedTranscript.includes("નવો દર્દી")
    || normalizedTranscript.includes("નવદર્દી")
    || normalizedTranscript.includes("નવી પેશન્ટ")
    || normalizedTranscript.includes("નવો પેશન્ટ")
    || normalizedTranscript.includes("પહેલી વાર આવી")
    || normalizedTranscript.includes("પહેલી વાર આવી")
    || normalizedTranscript.includes("પહેલી વાર આવી રહ્યો")
    || normalizedTranscript.includes("પહેલી વાર આવી રહી")
    || normalizedTranscript.includes("first visit")
    || normalizedTranscript.includes("first timer")
  ) {
    return "new patient";
  }
  if (normalizedTranscript.includes("new patient") || normalizedTranscript.includes("à¤¨à¤¯à¤¾ à¤®à¤°à¥€à¤œ")) {
    return "new patient";
  }

  if (
    normalizedTranscript.includes("follow-up")
    || normalizedTranscript.includes("follow up")
    || normalizedTranscript.includes("follow")
    || normalizedTranscript.includes("old patient")
    || normalizedTranscript.includes("returning patient")
    || normalizedTranscript.includes("existing patient")
    || normalizedTranscript.includes("\u0aab\u0acb\u0ab2\u0acb \u0a85\u0aaa")
    || normalizedTranscript.includes("\u0aab\u0acb\u0ab2\u0acb\u0a85\u0aaa")
    || normalizedTranscript.includes("\u0a9c\u0ac2\u0aa8\u0acb \u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f")
    || normalizedTranscript.includes("\u0a9c\u0ac2\u0aa8\u0abe \u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f")
    || normalizedTranscript.includes("àª«à«‹àª²à«‹ àª…àªª")
    || normalizedTranscript.includes("àª«à«‹àª²à«‹àª…àªª")
    || normalizedTranscript.includes("àªœà«‚àª¨à«‹ àªªà«‡àª¶àª¨à«àªŸ")
    || normalizedTranscript.includes("àªœà«‚àª¨àª¾ àªªà«‡àª¶àª¨à«àªŸ")
    || normalizedTranscript.includes("à¤«à¥‰à¤²à¥‹ à¤…à¤ª")
    || normalizedTranscript.includes("à¤«à¥‰à¤²à¥‹")
    || normalizedTranscript.includes("ફોલો અપ")
    || normalizedTranscript.includes("ફોલોઅપ")
    || normalizedTranscript.includes("જૂના દર્દી")
    || normalizedTranscript.includes("જૂનો દર્દી")
    || normalizedTranscript.includes("ફરી બતાવવું")
    || normalizedTranscript.includes("બીજી વાર")
  ) {
    return "follow-up";
  }

  return null;
}

function mapConfirmation(normalizedTranscript: string): "confirm" | "change_doctor" | "change_time" | "cancel" | null {
  if (["yes", "confirm", "correct", "haan", "ha", "à¤¹à¤¾à¤", "à¤¸à¤¹à¥€ à¤¹à¥ˆ"].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "confirm";
  }

  if (normalizedTranscript.includes("change doctor") || normalizedTranscript.includes("doctor change")) {
    return "change_doctor";
  }

  if (normalizedTranscript.includes("change time") || normalizedTranscript.includes("time change")) {
    return "change_time";
  }

  if (normalizedTranscript.includes("cancel booking") || normalizedTranscript.includes("à¤¬à¥à¤•à¤¿à¤‚à¤— à¤•à¥ˆà¤‚à¤¸à¤²")) {
    return "cancel";
  }

  if (["kar do", "kar dijiye", "confirm kar", "à¤•à¤° à¤¦à¥‹", "à¤•à¤° à¤¦à¥€à¤œà¤¿à¤", "à¤•à¤° à¤¦à¥€à¤œà¤¿à¤¯à¥‡"].some((phrase) => normalizedTranscript.includes(phrase))) {
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
    if (mapped.includes("morning") || mapped.includes("à¤¸à¥à¤¬à¤¹") || mapped.includes("subah")) {
      return "morning";
    }

    if (mapped.includes("afternoon") || mapped.includes("à¤¦à¥‹à¤ªà¤¹à¤°")) {
      return "afternoon";
    }

    if (mapped.includes("evening") || mapped.includes("à¤¶à¤¾à¤®")) {
      return "evening";
    }

    return mapped;
  }

  if ([
    "morning",
    "early morning",
    "subah",
    "à¤¸à¥à¤¬à¤¹",
    "morning slot",
    "à¤®à¥‰à¤°à¥à¤¨à¤¿à¤‚à¤—"
  ].some((phrase) => normalized.includes(phrase))) {
    return "morning";
  }

  if ([
    "afternoon",
    "after noon",
    "dopahar",
    "à¤¦à¥‹à¤ªà¤¹à¤°",
    "afternoon slot",
    "à¤†à¤«à¥à¤Ÿà¤°à¤¨à¥‚à¤¨",
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
    "night",
    "raat",
    "raate",
    "raat ko",
    "ratre",
    "raatre",
    "રાત્રે",
    "રાતે",
    "રાત",
    "à¤¶à¤¾à¤®",
    "à¤¶à¤¾à¤® à¤•à¥‹",
    "evening slot",
    "à¤ˆà¤µà¤¨à¤¿à¤‚à¤—",
    "4 pm",
    "5 pm",
    "6 pm"
  ].some((phrase) => normalized.includes(phrase))) {
    return "evening";
  }

  if (normalized.includes("koi bhi time chalega") || normalized.includes("à¤•à¥‹à¤ˆ à¤­à¥€ à¤Ÿà¤¾à¤‡à¤® à¤šà¤²à¥‡à¤—à¤¾")) {
    return "morning";
  }

  return null;
}

const CALENDAR_MONTHS: Array<{ month: number; names: string[] }> = [
  { month: 0, names: ["january", "jan", "janavari", "januari", "janyuaari", "jaanuari", "àªœàª¾àª¨à«àª¯à«àª†àª°à«€", "àªœàª¾àª¨", "à¤œà¤¨à¤µà¤°à¥€", "à¤œà¤¨"] },
  { month: 1, names: ["february", "feb", "faravari", "februaari", "àª«à«‡àª¬à«àª°à«àª†àª°à«€", "àª«à«‡àª¬", "à¤«à¤¼à¤°à¤µà¤°à¥€", "à¤«à¤°à¤µà¤°à¥€", "à¤«à¤¼à¤°"] },
  { month: 2, names: ["march", "mar", "maarch", "àª®àª¾àª°à«àªš", "à¤®à¤¾à¤°à¥à¤š", "à¤®à¤¾à¤°"] },
  { month: 3, names: ["april", "apr", "aprail", "epril", "àªàªªà«àª°àª¿àª²", "àªàªªà«àª°à«€àª²", "àªàªªà«àª°àª¿àª²", "à¤…à¤ªà¥à¤°à¥ˆà¤²", "à¤…à¤ªà¥à¤°à¥ˆ"] },
  { month: 4, names: ["may", "mai", "àª®à«‡", "à¤®à¤ˆ"] },
  { month: 5, names: ["june", "jun", "àªœà«‚àª¨", "à¤œà¥‚à¤¨"] },
  { month: 6, names: ["july", "jul", "julai", "àªœà«àª²àª¾àªˆ", "àªœà«àª²àª¾àª‡", "à¤œà¥à¤²à¤¾à¤ˆ", "à¤œà¥à¤²"] },
  { month: 7, names: ["august", "aug", "agast", "ogast", "àª‘àª—àª¸à«àªŸ", "àª“àª—àª¸à«àªŸ", "à¤…à¤—à¤¸à¥à¤¤", "à¤…à¤—"] },
  { month: 8, names: ["september", "sept", "sep", "sitambar", "àª¸àªªà«àªŸà«‡àª®à«àª¬àª°", "àª¸àªªà«àªŸ", "à¤¸à¤¿à¤¤à¤‚à¤¬à¤°", "à¤¸à¤¿à¤¤"] },
  { month: 9, names: ["october", "oct", "aktoobar", "oktobar", "àª“àª•à«àªŸà«‹àª¬àª°", "àª“àª•à«àªŸ", "à¤…à¤•à¥à¤Ÿà¥‚à¤¬à¤°", "à¤…à¤•à¥à¤Ÿà¥‚"] },
  { month: 10, names: ["november", "nov", "navambar", "àª¨àªµà«‡àª®à«àª¬àª°", "àª¨àªµà«‡", "à¤¨à¤µà¤‚à¤¬à¤°", "à¤¨à¤µà¤®à¥à¤¬à¤°", "à¤¨à¤µ"] },
  { month: 11, names: ["december", "dec", "disambar", "àª¡àª¿àª¸à«‡àª®à«àª¬àª°", "àª¡àª¿àª¸", "à¤¦à¤¿à¤¸à¤‚à¤¬à¤°", "à¤¦à¤¿à¤¸à¤®à¥à¤¬à¤°", "à¤¦à¤¿à¤¸"] }
];

function normalizeCalendarText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[à¥¦-à¥¯]/g, (digit) => String("à¥¦à¥§à¥¨à¥©à¥ªà¥«à¥¬à¥­à¥®à¥¯".indexOf(digit)))
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/['â€™]/g, " ")
    .replace(/[,\u0964]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCalendarDate(date: Date): string {
  const weekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][date.getDay()];
  const month = CALENDAR_MONTHS[date.getMonth()].names[0];
  return `${weekday} ${date.getDate()} ${month} ${date.getFullYear()}`;
}

function formatIsoCalendarDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatCalendarDateOffset(offsetDays: number, now = new Date()): string {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  base.setDate(base.getDate() + offsetDays);
  return formatIsoCalendarDate(base);
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

function inferMonthYearForBareDay(day: number, now = new Date()): { month: number; year: number } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentMonthCandidate = validCalendarDate(day, now.getMonth(), now.getFullYear());
  if (currentMonthCandidate && currentMonthCandidate >= today) {
    return { month: now.getMonth(), year: now.getFullYear() };
  }

  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthCandidate = validCalendarDate(day, nextMonthDate.getMonth(), nextMonthDate.getFullYear());
  if (nextMonthCandidate) {
    return { month: nextMonthDate.getMonth(), year: nextMonthDate.getFullYear() };
  }

  return null;
}

function parseCalendarDateExpression(transcript: string): string | null {
  const normalized = normalizeCalendarText(transcript);
  const isoDate = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoDate) {
    const year = Number(isoDate[1]);
    const month = Number(isoDate[2]) - 1;
    const day = Number(isoDate[3]);
    const parsed = validCalendarDate(day, month, year);
    if (parsed) return formatIsoCalendarDate(parsed);
  }
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
      if (parsed) return formatIsoCalendarDate(parsed);
    }
  }

  const numericDate = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numericDate) {
    const day = Number(numericDate[1]);
    const month = Number(numericDate[2]) - 1;
    const yearValue = numericDate[3] ? Number(numericDate[3]) : inferYearForMonthDay(day, month);
    const year = yearValue < 100 ? 2000 + yearValue : yearValue;
    const parsed = validCalendarDate(day, month, year);
    if (parsed) return formatIsoCalendarDate(parsed);
  }

  const bareDayMatch = normalized.match(/\b(\d{1,2})\s*(tarikh|tarik|date|taarikh|તારીખ|તારિખ)\b/u);
  if (bareDayMatch) {
    const day = Number(bareDayMatch[1]);
    const inferred = inferMonthYearForBareDay(day);
    if (inferred) {
      const parsed = validCalendarDate(day, inferred.month, inferred.year);
      if (parsed) return formatIsoCalendarDate(parsed);
    }
  }

  const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekday = weekdayNames.find((day) => new RegExp(`\\b${day}\\b`, "i").test(normalized));
  if (!weekday) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let daysAhead = (weekdayNames.indexOf(weekday) - today.getDay() + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;
  if (isExplicitNextWeekDateRequest(normalized) && !isThisWeekDateRequest(normalized) && daysAhead < 7) {
    daysAhead += 7;
  }

  const parsed = new Date(today);
  parsed.setDate(today.getDate() + daysAhead);
  return formatIsoCalendarDate(parsed);
}

function isNextDateRequest(normalizedTranscript: string): boolean {
  return /\bnext\b/.test(normalizedTranscript)
    || normalizedTranscript.includes("\u0aa8\u0ac7\u0a95\u0acd\u0ab8\u0acd\u0a9f")
    || normalizedTranscript.includes("\u0a86\u0ab5\u0aa4\u0abe")
    || normalizedTranscript.includes("\u0a86\u0ab5\u0aa4\u0ac0")
    || normalizedTranscript.includes("\u0a85\u0a97\u0ab2\u0abe")
    || normalizedTranscript.includes("\u0a85\u0a97\u0ab2\u0ac7")
    || normalizedTranscript.includes("à¤¨à¥‡à¤•à¥à¤¸à¥à¤Ÿ")
    || normalizedTranscript.includes("à¤…à¤—à¤²à¥‡")
    || normalizedTranscript.includes("agle")
    || normalizedTranscript.includes("agla")
    || normalizedTranscript.includes("aavta")
    || normalizedTranscript.includes("avta")
    || normalizedTranscript.includes("next monday")
    || normalizedTranscript.includes("next tuesday")
    || normalizedTranscript.includes("next wednesday")
    || normalizedTranscript.includes("next thursday")
    || normalizedTranscript.includes("next friday")
    || normalizedTranscript.includes("next saturday")
    || normalizedTranscript.includes("next sunday");
}

function isThisWeekDateRequest(normalizedTranscript: string): boolean {
  return /\bthis\s+week\b/.test(normalizedTranscript)
    || /\bcurrent\s+week\b/.test(normalizedTranscript)
    || normalizedTranscript.includes("\u0a86 \u0ab5\u0ac0\u0a95")
    || normalizedTranscript.includes("\u0a86 \u0ab5\u0ac0\u0a95\u0aa8\u0abe")
    || normalizedTranscript.includes("\u0a86 \u0a85\u0aa0\u0ab5\u0abe\u0aa1\u0abf\u0aaf\u0ac7")
    || normalizedTranscript.includes("\u0a86 \u0a85\u0aa0\u0ab5\u0abe\u0aa1\u0abf\u0aaf\u0abe")
    || normalizedTranscript.includes("\u0a86 \u0a85\u0aa0\u0ab5\u0abe\u0aa1\u0abf\u0aaf\u0abe\u0aa8\u0abe")
    || normalizedTranscript.includes("\u0a86 \u0ab9\u0aaa\u0acd\u0aa4\u0abe")
    || normalizedTranscript.includes("\u0a86 \u0ab9\u0aaa\u0acd\u0aa4\u0abe\u0aa8\u0abe")
    || normalizedTranscript.includes("is hafte")
    || normalizedTranscript.includes("iss hafte")
    || normalizedTranscript.includes("is week");
}

function isExplicitNextWeekDateRequest(normalizedTranscript: string): boolean {
  return /\bnext\s+week\b/.test(normalizedTranscript)
    || normalizedTranscript.includes("agle hafte")
    || normalizedTranscript.includes("agale hafte")
    || normalizedTranscript.includes("aavta hafta")
    || normalizedTranscript.includes("aavta hafto")
    || normalizedTranscript.includes("aavta somvar")
    || normalizedTranscript.includes("aavta monday")
    || normalizedTranscript.includes("aavta mangalvar")
    || normalizedTranscript.includes("aavta tuesday")
    || normalizedTranscript.includes("aavta budhvar")
    || normalizedTranscript.includes("aavta budhwar")
    || normalizedTranscript.includes("aavta wednesday")
    || normalizedTranscript.includes("aavta guruwar")
    || normalizedTranscript.includes("aavta guruvar")
    || normalizedTranscript.includes("aavta thursday")
    || normalizedTranscript.includes("aavta shukrvar")
    || normalizedTranscript.includes("aavta friday")
    || normalizedTranscript.includes("aavta shanivar")
    || normalizedTranscript.includes("aavta shaniwar")
    || normalizedTranscript.includes("aavta saturday")
    || normalizedTranscript.includes("aavta ravivar")
    || normalizedTranscript.includes("aavta sunday")
    || normalizedTranscript.includes("આવતા સોમવારે")
    || normalizedTranscript.includes("આવતા મંગળવારે")
    || normalizedTranscript.includes("આવતા બુધવારે")
    || normalizedTranscript.includes("આવતા ગુરુવારે")
    || normalizedTranscript.includes("આવતા શુક્રવારે")
    || normalizedTranscript.includes("આવતા શનિવારે")
    || normalizedTranscript.includes("આવતા રવિવારે")
    || normalizedTranscript.includes("\u0a86\u0ab5\u0aa4\u0abe \u0a85\u0aa0\u0ab5\u0abe\u0aa1\u0abf\u0aaf\u0ac7")
    || normalizedTranscript.includes("\u0a86\u0ab5\u0aa4\u0abe \u0a85\u0aa0\u0ab5\u0abe\u0aa1\u0abf\u0aaf\u0abe")
    || normalizedTranscript.includes("\u0a86\u0ab5\u0aa4\u0abe \u0ab9\u0aaa\u0acd\u0aa4\u0abe")
    || normalizedTranscript.includes("next monday")
    || normalizedTranscript.includes("next tuesday")
    || normalizedTranscript.includes("next wednesday")
    || normalizedTranscript.includes("next thursday")
    || normalizedTranscript.includes("next friday")
    || normalizedTranscript.includes("next saturday")
    || normalizedTranscript.includes("next sunday")
    || normalizedTranscript.includes("\u0905\u0917\u0932\u0947 \u0939\u092b\u094d\u0924\u0947")
    || normalizedTranscript.includes("\u0905\u0917\u0932\u0947 \u0938\u092a\u094d\u0924\u093e\u0939");
}

function hasFutureDateCue(normalizedTranscript: string): boolean {
  return [
    "tomorrow",
    "aavti kal",
    "aavtikale",
    "aavti parso",
    "aavta",
    "agle",
    "next",
    "book",
    "booking",
    "schedule",
    "appointment",
    "visit",
    "aana",
    "karna",
    "karni",
    "karvo",
    "kaarna",
    "લેવું",
    "લેવી",
    "મળવું",
    "મળવા"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function hasPastDateCue(normalizedTranscript: string): boolean {
  return [
    "yesterday",
    "gai kal",
    "gai kale",
    "kal tha",
    "kal gaya",
    "kal gayi",
    "kal mila",
    "report",
    "test",
    "was",
    "tha",
    "thi",
    "gaya",
    "gayi",
    "gayi thi",
    "gaya tha",
    "lidhi",
    "liidhi",
    "le li",
    "dekh li"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function parseRelativeDateExpression(transcript: string): string | null {
  const normalized = normalizeCalendarText(transcript);

  if ([
    "today",
    "aaj",
    "aaje",
    "\u0a86\u0a9c",
    "\u0a86\u0a9c\u0ac7"
  ].some((phrase) => normalized.includes(phrase))) {
    return formatCalendarDateOffset(0);
  }

  if (/\bkal\b/.test(normalized)) {
    return hasPastDateCue(normalized) && !hasFutureDateCue(normalized)
      ? formatCalendarDateOffset(-1)
      : formatCalendarDateOffset(1);
  }

  if (/\bparso\b/.test(normalized)) {
    return hasPastDateCue(normalized) && !hasFutureDateCue(normalized)
      ? formatCalendarDateOffset(-2)
      : formatCalendarDateOffset(2);
  }

  if ([
    "tomorrow",
    "aavti kal",
    "aavtikale",
    "aavti kale",
    "kal subah",
    "kal sham",
    "\u0a86\u0ab5\u0aa4\u0ac0\u0a95\u0abe\u0ab2\u0ac7",
    "\u0a95\u0abe\u0ab2\u0ac7"
  ].some((phrase) => normalized.includes(phrase))) {
    return formatCalendarDateOffset(1);
  }

  if ([
    "yesterday",
    "gai kal",
    "gai kale",
    "\u0a97\u0a88\u0a95\u0abe\u0ab2\u0ac7"
  ].some((phrase) => normalized.includes(phrase))) {
    return formatCalendarDateOffset(-1);
  }

  if ([
    "day after tomorrow",
    "parsu",
    "aavti parso",
    "\u0a86\u0ab5\u0aa4\u0ac0 \u0aaa\u0ab0\u0ab8\u0acb",
    "\u0aaa\u0ab0\u0ab8\u0acb"
  ].some((phrase) => normalized.includes(phrase))) {
    return formatCalendarDateOffset(2);
  }

  if ([
    "day before yesterday",
    "pichla parso",
    "pichla parsso",
    "\u0aaa\u0abf\u0a9b\u0ab2\u0abe \u0aaa\u0ab0\u0ab8\u0acb"
  ].some((phrase) => normalized.includes(phrase))) {
    return formatCalendarDateOffset(-2);
  }

  return null;
}

function calendarDateForWeekday(weekday: string, normalizedTranscript: string): string {
  const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let daysAhead = (weekdayNames.indexOf(weekday) - today.getDay() + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;
  if (isExplicitNextWeekDateRequest(normalizedTranscript) && !isThisWeekDateRequest(normalizedTranscript)) {
    daysAhead += 7;
  }

  const parsed = new Date(today);
  parsed.setDate(today.getDate() + daysAhead);
  return formatIsoCalendarDate(parsed);
}

function mapDateFlexible(normalizedTranscript: string): string | null {
  const normalized = normalizedTranscript.toLowerCase();
  const relativeDate = parseRelativeDateExpression(normalized);

  if (relativeDate) {
    return relativeDate;
  }

  const calendarDate = parseCalendarDateExpression(normalized);

  if (calendarDate) {
    return calendarDate;
  }

  if (["મંગળવાર", "મંગળવારે", "tyuesday", "tuesday", "mangalvar", "mangalwaar"].some((phrase) => normalized.includes(phrase))) {
    return calendarDateForWeekday("tuesday", normalized);
  }

  if ([
    "\u0aac\u0ac1\u0aa7\u0ab5\u0abe\u0ab0",
    "\u0aac\u0ac1\u0aa7\u0ab5\u0abe\u0ab0\u0ac7",
    "\u0aac\u0ac1\u0aa1\u0ab5\u0abe\u0ab0",
    "\u0aac\u0ac1\u0aa1\u0ab5\u0abe\u0ab0\u0ac7",
    "\u0aac\u0ac1\u0aa6\u0ab5\u0abe\u0ab0",
    "\u0aac\u0ac1\u0aa6\u0ab5\u0abe\u0ab0\u0ac7",
    "\u0aad\u0ac1\u0aa7\u0ab5\u0abe\u0ab0",
    "\u0aad\u0ac1\u0aa7\u0ab5\u0abe\u0ab0\u0ac7"
  ].some((phrase) => normalized.includes(phrase))) {
    return calendarDateForWeekday("wednesday", normalized);
  }

  if ([
    "\u0a97\u0ac1\u0ab0\u0ac1\u0ab5\u0abe\u0ab0",
    "\u0a97\u0ac1\u0ab0\u0ac1\u0ab5\u0abe\u0ab0\u0ac7",
    "\u0a97\u0ac1\u0ab0\u0ac1\u0ab5\u0abe\u0ab0\u0aa8\u0abe",
    "\u0a86\u0ab5\u0aa4\u0abe \u0a97\u0ac1\u0ab0\u0ac1\u0ab5\u0abe\u0ab0\u0ac7",
    "\u0aa8\u0ac7\u0a95\u0acd\u0ab8\u0acd\u0a9f \u0a97\u0ac1\u0ab0\u0ac1\u0ab5\u0abe\u0ab0"
  ].some((phrase) => normalized.includes(phrase))) {
    return calendarDateForWeekday("thursday", normalized);
  }

  const dayAliases: Array<{ day: string; aliases: string[] }> = [
    {
      day: "monday",
      aliases: ["monday", "mon day", "manday", "munde", "monday ko", "mand ko", "mand", "somvar", "somwaar", "સોમવાર", "સોમવારે", "aavta somvar", "આવતા સોમવારે"]
    },
    {
      day: "tuesday",
      aliases: ["tuesday", "tues day", "tusday", "tyusday", "mangalvar", "mangalwaar", "mangalvaar", "mangal", "મંગળવાર", "મંગળવારે", "aavta mangalvar", "આવતા મંગળવારે"]
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
        "wensde",
        "wensdey",
        "wensde ko",
        "wenzday",
        "venusday",
        "vensday",
        "vensde",
        "vensde ko",
        "venasday",
        "wedensde",
        "wedensdey",
        "wed",
        "budhvar",
        "budhwar",
        "budhvaar",
        "budvar",
        "bhudhvar",
        "bhudvar",
        "bhudwar",
        "\u0aac\u0ac1\u0aa7\u0ab5\u0abe\u0ab0",
        "\u0aac\u0ac1\u0aa7\u0ab5\u0abe\u0ab0\u0ac7",
        "\u0a86\u0ab5\u0aa4\u0abe \u0aac\u0ac1\u0aa7\u0ab5\u0abe\u0ab0\u0ac7",
        "\u0a86\u0ab5\u0aa4\u0abe \u0aac\u0ac1\u0aa7\u0ab5\u0abe\u0ab0",
        "aavta budhvar",
        "aavta budhwar",
        "aavta budhvaar",
        "aavta bhudvar",
        "aavta bhudwar",
        "agle budhvar",
        "agle budhwar",
        "agle bhudvar",
        "agle bhudwar",
        "next budhvar",
        "next budhwar",
        "next wednesday",
        "બુધવાર",
        "બુધવારે",
        "આવતા બુધવારે",
        "વેન્સડે",
        "વેન્સડે છે",
        "વેન્સલે",
        "વેન્સલે છે",
        "વેનસલે",
        "\u092c\u0941\u0927\u0935\u093e\u0930",
        "\u092c\u0941\u0927\u0935\u093e\u0930 \u0915\u094b",
        "\u092c\u0941\u0927\u0935\u093e\u0930\u0947",
        "\u092c\u0941\u0927\u0935\u093e\u0930 \u092e\u0947\u0902",
        "\u0935\u0928\u094d\u0938\u0921\u0947",
        "\u0935\u0947\u0921\u0902\u0938\u0921\u0947",
        "\u0935\u0947\u0921\u0928\u0947\u0938\u0921\u0947",
        "\u0935\u0947\u0921\u0928\u0938\u0921\u0947",
        "\u0935\u0947\u0928\u0938\u0921\u0947",
        "\u0935\u0947\u0928\u0938\u0921\u0947 \u0915\u094b",
        "\u0935\u0947\u0928\u094d\u0938\u0921\u0947",
        "\u0935\u0947\u0902\u0938\u0921\u0947",
        "à¤¬à¥à¤§à¤µà¤¾à¤°",
        "à¤¬à¥à¤§à¤µà¤¾à¤° à¤•à¥‹",
        "à¤µà¥‡à¤¡à¤¨à¥‡à¤¸à¤¡à¥‡",
        "à¤µà¥‡à¤¡à¤¨à¥à¤¸à¤¡à¥‡",
        "à¤µà¥‡à¤¡à¤¨à¤¸à¤¡à¥‡",
        "à¤µà¥‡à¤¨à¤¸à¤¡à¥‡",
        "à¤µà¥‡à¤‚à¤¸à¤¡à¥‡",
        "à¤µà¥‡à¤¨à¥à¤¸à¤¡à¥‡",
        "à¤­à¥‚à¤¤à¤µà¤¾à¤¦"
      ]
    },
    {
      day: "thursday",
      aliases: ["thursday", "thurs day", "thusday", "thurday", "guruwar", "guruvar", "guruvaar", "gurwar", "gurovar", "aavta guruwar", "aavta guruvar", "aavta guruvaar", "aavta gurwar", "agle guruwar", "agle guruvar", "agle guruvaar", "agle gurwar", "next thursday", "next guruwar", "next guruvar", "ગુરુવાર", "ગુરુવારે", "આવતા ગુરુવારે"]
    },
    {
      day: "friday",
      aliases: ["friday", "fri day", "fraiday", "shukrawar", "shukrvar", "shukravar", "શુક્રવાર", "શુક્રવારે", "આવતા શુક્રવારે", "aavta shukravar", "aavta shukrvar"]
    },
    {
      day: "saturday",
      aliases: ["saturday", "satur day", "satday", "shanivar", "shaniwar", "શનિવાર", "શનિવારે", "આવતા શનિવારે", "aavta shanivar", "aavta shaniwar"]
    },
    {
      day: "sunday",
      aliases: ["sunday", "sun day", "ravivar", "raviwar", "રવિવાર", "રવિવારે", "આવતા રવિવારે", "aavta ravivar"]
    }
  ];

  const gujaratiSttDayAliases: Record<string, string[]> = {
    monday: [
      "\u0ab8\u0acb\u0aae\u0ab5\u0abe\u0ab0",
      "\u0ab8\u0acb\u0aae\u0ab5\u0abe\u0ab0\u0ac7",
      "\u0aae\u0a82\u0aa1\u0ac7",
      "\u0aae\u0aa8\u0acd\u0aa1\u0ac7",
      "\u0aae\u0abe\u0a82\u0aa1\u0ac7"
    ],
    friday: [
      "\u0ab6\u0ac1\u0a95\u0acd\u0ab0\u0ab5\u0abe\u0ab0",
      "\u0ab6\u0ac1\u0a95\u0acd\u0ab0\u0ab5\u0abe\u0ab0\u0ac7",
      "\u0aab\u0acd\u0ab0\u0abe\u0a87\u0aa1\u0ac7",
      "\u0aab\u0acd\u0ab0\u0abe\u0aaf\u0aa1\u0ac7"
    ],
    saturday: [
      "\u0ab6\u0aa8\u0abf\u0ab5\u0abe\u0ab0",
      "\u0ab6\u0aa8\u0abf\u0ab5\u0abe\u0ab0\u0ac7",
      "\u0ab6\u0aa8\u0abf\u0ab5\u0abe\u0ab0\u0aa8\u0abe",
      "\u0ab8\u0ac7\u0a9f\u0ab0\u0aa1\u0ac7",
      "\u0ab8\u0ac7\u0a9f\u0ab0\u0acd\u0aa1\u0ac7"
    ]
  };

  for (const entry of dayAliases) {
    entry.aliases.push(...(gujaratiSttDayAliases[entry.day] ?? []));
  }

  for (const entry of dayAliases) {
    if (entry.aliases.some((phrase) => normalized.includes(phrase))) {
      return calendarDateForWeekday(entry.day, normalized);
    }
  }

  const mapped = mapDate(normalized);

  if (mapped) {
    return mapped;
  }

  return null;
}

function normalizeResolvedDateValue(value: string | null | undefined): string | null {
  if (!value) return null;
  return mapDateFlexible(normalizeTranscript(value)) ?? value;
}

function mapConfirmationFlexible(normalizedTranscript: string): "confirm" | "change_doctor" | "change_time" | "cancel" | null {
  if ([
    "\u0a9c\u0ac0",
    "\u0a9c\u0ac0 \u0ab9\u0abe",
    "\u0ab9\u0abe",
    "\u0ab9\u0abe\u0a82",
    "\u0aac\u0ab0\u0abe\u0aac\u0ab0",
    "\u0ab8\u0abe\u0a9a\u0ac1\u0a82",
    "\u0ab8\u0abe\u0a9a\u0ac1",
    "\u0ab8\u0abe\u0a9a\u0ac0",
    "\u0ab8\u0ab9\u0ac0",
    "અહીંયા બધી રીતે સારી છે",
    "ahiya badhi rite sari chhe",
    "\u0a86 \u0aae\u0abe\u0ab9\u0abf\u0aa4\u0ac0 \u0ab8\u0abe\u0a9a\u0ac0",
    "\u0aae\u0abe\u0ab9\u0abf\u0aa4\u0ac0 \u0ab8\u0abe\u0a9a\u0ac0",
    "\u0a95\u0aa8\u0acd\u0aab\u0ab0\u0acd\u0aae \u0a95\u0ab0\u0ac0 \u0aa6\u0acb",
    "\u0a95\u0aa8\u0acd\u0aab\u0ab0\u0acd\u0aae \u0a95\u0ab0\u0acb",
    "\u0aac\u0ac1\u0a95\u0abf\u0a82\u0a97 \u0a95\u0aa8\u0acd\u0aab\u0ab0\u0acd\u0aae",
    "\u0a95\u0ab0\u0ac0 \u0aa6\u0acb"
  ].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "confirm";
  }

  if (matchCancelAppointmentIntent(normalizedTranscript)) {
    return "cancel";
  }

  const mapped = mapConfirmation(normalizedTranscript);

  if (mapped) {
    return mapped;
  }

  if ([
    "yup",
    "yeah",
    "ji",
    "ji haan",
    "theek hai",
    "thik hai",
    "sahi hai",
    "bilkul",
    "confirm",
    "ahiya badhi rite sari chhe",
    "kar do",
    "kar dijiye",
    "confirm karo",
    "confirm kar do",
    "confirm kar dijiye",
    "haan kar do",
    "à¤œà¥€",
    "à¤œà¥€ à¤¹à¤¾à¤",
    "à¤œà¥€ à¤¹à¤¾à¤‚",
    "à¤ à¥€à¤• à¤¹à¥ˆ",
    "à¤¸à¤¹à¥€ à¤¹à¥ˆ",
    "à¤•à¤° à¤¦à¥‹",
    "à¤•à¤° à¤¦à¥€à¤œà¤¿à¤",
    "à¤•à¤¨à¥à¤«à¤°à¥à¤® à¤•à¤° à¤¦à¥‹"
  ].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "confirm";
  }

  if (["haan", "ha", "han", "yes", "ok", "okay", "à¤¹à¤¾à¤", "à¤¹à¤¾à¤‚", "à¤¸à¤¹à¥€ à¤¹à¥ˆ"].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "confirm";
  }

  if (matchCancelAppointmentIntent(normalizedTranscript)) {
    return "cancel";
  }

  return null;
}

function wantsEarliestSlot(normalizedTranscript: string): boolean {
  return [
    "earliest",
    "earlyest",
    "early ist",
    "earliest slot",
    "available slot",
    "any available slot",
    "whatever is available",
    "first slot",
    "pehla slot",
    "sabse pehle",
    "available jo hai",
    "jo earliest",
    "jo early",
    "jo available",
    "\u0ab8\u0acc\u0aa5\u0ac0 \u0aaa\u0ab9\u0ac7\u0ab2\u0acb",
    "\u0aaa\u0ab9\u0ac7\u0ab2\u0acb \u0ab8\u0acd\u0ab2\u0acb\u0a9f",
    "\u0a9c\u0ac7 available \u0ab9\u0acb\u0aaf",
    "\u0a9c\u0ac7 \u0a89\u0aaa\u0ab2\u0aac\u0acd\u0aa7 \u0ab9\u0acb\u0aaf",
    "\u0a95\u0acb\u0a88 \u0aaa\u0aa3 \u0ab8\u0acd\u0ab2\u0acb\u0a9f",
    "\u0a95\u0acb\u0a88 \u0aaa\u0aa3 time"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function wantsAlternativeSlot(normalizedTranscript: string): boolean {
  return [
    "second slot",
    "another slot",
    "another available slot",
    "any other slot",
    "other available slot",
    "other slot",
    "different slot",
    "next slot",
    "later slot",
    "earlier slot",
    "different time",
    "another time",
    "any other time",
    "dusra slot",
    "doosra slot",
    "dusra available slot",
    "doosra available slot",
    "koi dusra slot",
    "koi aur slot",
    "koi dusra available slot",
    "koi aur available slot",
    "\u0aac\u0ac0\u0a9c\u0acb \u0ab8\u0acd\u0ab2\u0acb\u0a9f",
    "\u0aac\u0ac0\u0a9c\u0ac1\u0a82 \u0ab8\u0acd\u0ab2\u0acb\u0a9f",
    "\u0a95\u0acb\u0a88 \u0a85\u0aa8\u0acd\u0aaf \u0ab8\u0acd\u0ab2\u0acb\u0a9f",
    "\u0a95\u0acb\u0a88 \u0aac\u0ac0\u0a9c\u0acb \u0ab8\u0acd\u0ab2\u0acb\u0a9f",
    "\u0a95\u0acb\u0a88 \u0aac\u0ac0\u0a9c\u0acb \u0a9f\u0abe\u0a87\u0aae",
    "\u0a95\u0acb\u0a88 \u0a85\u0aa8\u0acd\u0aaf time",
    "\u0a95\u0acb\u0a88 \u0a85\u0aa8\u0acd\u0aaf available",
    "\u0aac\u0ac0\u0a9c\u0acb available",
    "\u0a85\u0ab2\u0a97 \u0ab8\u0acd\u0ab2\u0acb\u0a9f",
    "\u0aac\u0ac0\u0a9c\u0acb time",
    "\u0a85\u0ab2\u0a97 time",
    "\u0aaa\u0a9b\u0ac0\u0aa8\u0acb \u0ab8\u0acd\u0ab2\u0acb\u0a9f",
    "\u0aaa\u0ab9\u0ac7\u0ab2\u0abe\u0aa8\u0acb \u0ab8\u0acd\u0ab2\u0acb\u0a9f",
    "à¤¦à¥‚à¤¸à¤°à¤¾ à¤¸à¥à¤²à¥‰à¤Ÿ",
    "à¤¦à¥à¤¸à¤°à¤¾ à¤¸à¥à¤²à¥‰à¤Ÿ",
    "à¤…à¤—à¤²à¤¾ à¤¸à¥à¤²à¥‰à¤Ÿ",
    "à¤”à¤° à¤¸à¥à¤²à¥‰à¤Ÿ",
    "slot chahiye",
    "à¤¸à¥à¤²à¥‰à¤Ÿ à¤šà¤¾à¤¹à¤¿à¤",
    "à¤¸à¥à¤²à¥‰à¤—",
    "slot available",
    "à¤¸à¥à¤²à¥‰à¤Ÿ à¤…à¤µà¥‡à¤²à¥‡à¤¬à¤²",
    "à¤¦à¥‚à¤¸à¤°à¥‡ à¤¸à¥à¤²à¥‰à¤Ÿ",
    "à¤¦à¥à¤¸à¤°à¥‡ à¤¸à¥à¤²à¥‰à¤Ÿ",
    "à¤¦à¥‚à¤¸à¤°à¥‡ à¤¸à¥à¤²à¥‰à¤Ÿà¥à¤¸",
    "à¤¦à¥à¤¸à¤°à¥‡ à¤¸à¥à¤²à¥‰à¤Ÿà¥à¤¸",
    "à¤¦à¥‚à¤¸à¤°à¤¾ à¤¸à¥à¤²à¥‰à¤Ÿ à¤¬à¤¤à¤¾à¤‡à¤",
    "à¤¦à¥‚à¤¸à¤°à¥‡ à¤¸à¥à¤²à¥‰à¤Ÿà¥à¤¸ à¤¬à¤¤à¤¾à¤‡à¤",
    "à¤”à¤° à¤•à¥‹à¤ˆ à¤¸à¥à¤²à¥‰à¤Ÿ",
    "à¤•à¥‹à¤ˆ à¤¸à¥à¤²à¥‰à¤Ÿ",
    "à¤•à¥‹à¤ˆ à¤”à¤° à¤¸à¥à¤²à¥‰à¤Ÿ",
    "à¤•à¥‹à¤ˆ à¤¦à¥à¤¸à¤°à¤¾ à¤¸à¥à¤²à¥‰à¤Ÿ"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function wantsAnotherDay(normalizedTranscript: string): boolean {
  const hasKnownPhrase = [
    "another day",
    "other day",
    "different day",
    "next day",
    "shift to another day",
    "same doctor different day",
    "koi aur din",
    "dusra din",
    "doosra din",
    "alag din",
    "બીજો દિવસ",
    "બીજા દિવસે",
    "બીજો દહાડો",
    "બીજો દિન",
    "અન્ય દિવસ",
    "અલગ દિવસ",
    "બીજી તારીખ",
    "2જો દિવસ",
    "અને બીજો દિવસ",
    "અને બીજો દિવસ ચાલે",
    "બીજો દિવસ ચાલે",
    "બીજા દિવસ ચાલે",
    "bijo divas",
    "bija divase",
    "alag divas"
  ].some((phrase) => normalizedTranscript.includes(phrase));

  if (hasKnownPhrase) {
    return true;
  }

  return /(?:^|\s)(?:અને\s*)?(?:2જો|બીજો|બીજા|બીજી)\s+(?:દિવસ|દિવસે|દહાડો|દિન|તારીખ)(?:\s|$)/u.test(normalizedTranscript);
}

function mapYesNo(normalizedTranscript: string): "yes" | "no" | null {
  if ([
    "\u0aa8\u0abe",
    "\u0aa8\u0ab9\u0ac0",
    "\u0aa8\u0aa5\u0ac0",
    "\u0aa8\u0ab9\u0ac0\u0a82",
    "\u0aae\u0aa4 \u0a95\u0ab0\u0acb",
    "\u0ab0\u0ab9\u0ac7\u0ab5\u0abe \u0aa6\u0acb",
    "\u0aac\u0ac0\u0a9c\u0acb number",
    "\u0a85\u0ab2\u0a97 number"
  ].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "no";
  }

  if ([
    "\u0ab9\u0abe",
    "\u0ab9\u0abe\u0a82",
    "\u0a9c\u0ac0",
    "\u0a9c\u0ac0 \u0ab9\u0abe",
    "\u0aac\u0ab0\u0abe\u0aac\u0ab0",
    "\u0ab8\u0abe\u0a9a\u0ac1\u0a82",
    "\u0ab8\u0abe\u0a9a\u0ac1",
    "\u0ab8\u0abe\u0a9a\u0ac0",
    "\u0ab8\u0ab9\u0ac0",
    "અહીંયા બધી રીતે સારી છે",
    "ahiya badhi rite sari chhe",
    "\u0a9a\u0abe\u0ab2\u0ab6\u0ac7",
    "\u0a95\u0ab0\u0acb",
    "\u0a95\u0ab0\u0ac0 \u0aa6\u0acb",
    "\u0a86 \u0aa8\u0a82\u0aac\u0ab0",
    "\u0a86 \u0a9c number",
    "\u0a86 number",
    "\u0a8f \u0a9c number",
    "\u0a8f number",
    "\u0aae\u0abe\u0ab0\u0acb number"
  ].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "yes";
  }

  if ([
    "nope",
    "nah",
    "nai",
    "nahi chahiye",
    "mat karo",
    "mat kijiye",
    "rehne do",
    "chhodo",
    "à¤¨à¤¹à¥€à¤‚ à¤šà¤¾à¤¹à¤¿à¤",
    "à¤®à¤¤ à¤•à¤°à¥‹",
    "à¤®à¤¤ à¤•à¥€à¤œà¤¿à¤",
    "à¤°à¤¹à¤¨à¥‡ à¤¦à¥‹",
    "à¤›à¥‹à¤¡à¤¼à¥‹"
  ].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "no";
  }

  if (["à¤¨à¤¹à¥€à¤‚", "à¤¨à¤¹à¥€", "à¤¨à¤¾", "à¤®à¤¤"].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "no";
  }

  if ([
    "same number",
    "this number",
    "yahi number",
    "yehi number",
    "isi number",
    "bilkul",
    "confirm",
    "yup",
    "yeah",
    "ji",
    "ji haan",
    "theek hai",
    "thik hai",
    "sahi hai",
    "kar do",
    "kar dijiye",
    "chalega",
    "chal jayega",
    "à¤œà¥€",
    "à¤œà¥€ à¤¹à¤¾à¤",
    "à¤œà¥€ à¤¹à¤¾à¤‚",
    "à¤ à¥€à¤• à¤¹à¥ˆ",
    "à¤¸à¤¹à¥€ à¤¹à¥ˆ",
    "à¤•à¤° à¤¦à¥‹",
    "à¤•à¤° à¤¦à¥€à¤œà¤¿à¤",
    "à¤šà¤²à¥‡à¤—à¤¾",
    "à¤œà¥€",
    "à¤œà¥€ à¤¹à¤¾à¤",
    "à¤œà¥€ à¤¹à¤¾à¤‚",
    "à¤¹à¤¾à¤",
    "à¤¹à¤¾à¤‚",
    "à¤¯à¤¹à¥€",
    "à¤¯à¤¹à¥€ à¤¨à¤‚à¤¬à¤°",
    "à¤‡à¤¸à¥€ à¤¨à¤‚à¤¬à¤°",
    "à¤®à¥‡à¤°à¤¾ à¤•à¥‰à¤¨à¥à¤Ÿà¥ˆà¤•à¥à¤Ÿ à¤¨à¤‚à¤¬à¤°"
  ].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "yes";
  }
  if (["no", "nahi", "nahin", "à¤¨à¤¹à¥€à¤‚", "à¤¨à¤¹à¥€", "à¤¨à¤¾", "à¤®à¤¤", "alternate", "different", "à¤¦à¥‚à¤¸à¤°à¤¾", "à¤…à¤²à¤—"].some((phrase) => normalizedTranscript.includes(phrase))) {
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
    "use kari shako",
    "use kari sako",
    "use kari shako cho",
    "yuze kari shako",
    "yuz kari shako",
    "kar sakti",
    "kar sakte",
    "vapari shako",
    "vapri shako",
    "vaparva do",
    "aa j rakho",
    "ae j rakho",
    "યુઝ કરી શકો",
    "યુઝ કરી શકો છો",
    "યુઝ કરો",
    "વાપરી શકો",
    "વાપરી શકો છો",
    "વાપરો",
    "આ જ રાખો",
    "એ જ રાખો",
    "current number",
    "à¤¹à¤¾à¤",
    "à¤¹à¤¾à¤‚",
    "à¤œà¥€ à¤¹à¤¾à¤",
    "à¤œà¥€ à¤¹à¤¾à¤‚",
    "à¤¸à¤¹à¥€",
    "à¤¯à¥‚à¤œà¤¼",
    "à¤¯à¥‚à¤¸",
    "à¤‡à¤¸à¥à¤¤à¥‡à¤®à¤¾à¤²",
    "à¤•à¤°à¤¤à¥‡ à¤¹à¥ˆà¤‚",
    "à¤•à¤° à¤¸à¤•à¤¤à¥€",
    "à¤•à¤° à¤¸à¤•à¤¤à¥‡"
  ].some((phrase) => normalizedTranscript.includes(phrase))) {
    return "yes";
  }

  return null;
}

function hasEndConversationIntent(normalizedTranscript: string): boolean {
  return [
    "no thanks",
    "no thank you",
    "nahi thanks",
    "nahi thank you",
    "nahi dhanyavaad",
    "nahin dhanyavaad",
    "dhanyavaad",
    "thank you",
    "thanks",
    "bye",
    "goodbye",
    "\u0a86\u0aad\u0abe\u0ab0",
    "\u0a96\u0ac2\u0aac \u0a86\u0aad\u0abe\u0ab0",
    "\u0aa7\u0aa8\u0acd\u0aaf\u0ab5\u0abe\u0aa6",
    "\u0aac\u0ab8",
    "\u0aac\u0ab8 \u0a86\u0aad\u0abe\u0ab0",
    "\u0aa5\u0ac7\u0a82\u0a95 \u0aaf\u0ac1",
    "à¤¨à¤¹à¥€à¤‚ à¤§à¤¨à¥à¤¯à¤µà¤¾à¤¦",
    "à¤¨à¤¹à¥€ à¤§à¤¨à¥à¤¯à¤µà¤¾à¤¦",
    "à¤§à¤¨à¥à¤¯à¤µà¤¾à¤¦",
    "à¤¥à¥ˆà¤‚à¤• à¤¯à¥‚",
    "à¤¬à¤¸"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function buildConfirmationSummary(session: DemoSessionRecord, prompts: ConversationPrompts): string {
  const doctorName = formatDoctorNameForSpeech(session.selectedDoctor ?? "assigned doctor", prompts);
  const date = formatBookingDateForPrompt(session.preferredDate ?? "selected date", prompts);
  const time = session.preferredTime ?? "selected time";
  const timePhrase = formatBookingTimePhraseForPrompt(time, prompts);
  const patientName = session.patientName ?? "patient";
  const contactNumber = formatPhoneNumberForSpeech(session.contactNumber ?? "not provided", prompts);

  return renderPrompt(prompts.bookingConfirmationSummary, {
    confirmPrefix: prompts.confirmPrefix,
    date,
    time,
    timePhrase,
    doctor: doctorName,
    patientName,
    contactNumber
  });
}

function buildFinalSummary(session: DemoSessionRecord, appointmentId: string | null, prompts: ConversationPrompts): string {
  const doctorName = formatDoctorNameForSpeech(session.selectedDoctor ?? "assigned doctor", prompts);
  const shortReference = appointmentId ? appointmentId.slice(-4).toUpperCase() : "pending";
  const date = formatBookingDateForPrompt(session.preferredDate ?? "selected date", prompts);
  const time = session.preferredTime ?? "selected time";
  const timePhrase = formatBookingTimePhraseForPrompt(time, prompts);

  return renderPrompt(prompts.bookingFinalSummary, {
    bookingConfirmed: prompts.bookingConfirmed,
    date,
    time,
    timePhrase,
    doctor: doctorName,
    reference: shortReference
  });
}

function isGujaratiPromptSet(prompts: ConversationPrompts): boolean {
  return hasGujaratiText(`${prompts.askDate} ${prompts.confirmPrefix} ${prompts.bookingConfirmed}`);
}

function isEnglishPromptSet(prompts: ConversationPrompts): boolean {
  const sample = `${prompts.askDate} ${prompts.confirmPrefix} ${prompts.bookingConfirmed}`;
  return !hasGujaratiText(sample) && !hasDevanagariText(sample) && !looksHinglishPrompt(sample);
}

function isHindiPromptSet(prompts: ConversationPrompts): boolean {
  return hasDevanagariText(`${prompts.askDate} ${prompts.askTime} ${prompts.bookingFinalSummary}`);
}

const GUJARATI_DIGIT_WORDS = ["શૂન્ય", "એક", "બે", "ત્રણ", "ચાર", "પાંચ", "છ", "સાત", "આઠ", "નવ"];
const HINDI_DIGIT_WORDS = ["शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ"];
const GUJARATI_MONTHS_SPOKEN: Record<string, string> = {
  january: "જાન્યુઆરી",
  february: "ફેબ્રુઆરી",
  march: "માર્ચ",
  april: "એપ્રિલ",
  may: "મે",
  june: "જૂન",
  july: "જુલાઈ",
  august: "ઓગસ્ટ",
  september: "સપ્ટેમ્બર",
  october: "ઓક્ટોબર",
  november: "નવેમ્બર",
  december: "ડિસેમ્બર"
};
const HINDI_MONTHS_SPOKEN: Record<string, string> = {
  january: "जनवरी",
  february: "फ़रवरी",
  march: "मार्च",
  april: "अप्रैल",
  may: "मई",
  june: "जून",
  july: "जुलाई",
  august: "अगस्त",
  september: "सितंबर",
  october: "अक्टूबर",
  november: "नवंबर",
  december: "दिसंबर"
};
const GUJARATI_DAYS_SPOKEN: Record<string, string> = {
  monday: "સોમવારે",
  tuesday: "મંગળવારે",
  wednesday: "બુધવારે",
  thursday: "ગુરુવારે",
  friday: "શુક્રવારે",
  saturday: "શનિવારે",
  sunday: "રવિવારે"
};
const HINDI_DAYS_SPOKEN: Record<string, string> = {
  monday: "सोमवार",
  tuesday: "मंगलवार",
  wednesday: "बुधवार",
  thursday: "गुरुवार",
  friday: "शुक्रवार",
  saturday: "शनिवार",
  sunday: "रविवार"
};
const GUJARATI_DAY_NUMBER_WORDS: Record<number, string> = {
  1: "એક", 2: "બે", 3: "ત્રણ", 4: "ચાર", 5: "પાંચ", 6: "છ",
  7: "સાત", 8: "આઠ", 9: "નવ", 10: "દસ", 11: "અગિયાર", 12: "બાર",
  13: "તેર", 14: "ચૌદ", 15: "પંદર", 16: "સોળ", 17: "સત્તર", 18: "અઢાર",
  19: "ઓગણીસ", 20: "વીસ", 21: "એકવીસ", 22: "બાવીસ", 23: "તેવીસ", 24: "ચોવીસ",
  25: "પચ્ચીસ", 26: "છવીસ", 27: "સત્તાવીસ", 28: "અઠ્ઠાવીસ", 29: "ઓગણત્રીસ", 30: "ત્રીસ", 31: "એકત્રીસ"
};
const HINDI_DAY_NUMBER_WORDS: Record<number, string> = {
  1: "एक", 2: "दो", 3: "तीन", 4: "चार", 5: "पाँच", 6: "छह",
  7: "सात", 8: "आठ", 9: "नौ", 10: "दस", 11: "ग्यारह", 12: "बारह",
  13: "तेरह", 14: "चौदह", 15: "पंद्रह", 16: "सोलह", 17: "सत्रह", 18: "अठारह",
  19: "उन्नीस", 20: "बीस", 21: "इक्कीस", 22: "बाईस", 23: "तेईस", 24: "चौबीस",
  25: "पच्चीस", 26: "छब्बीस", 27: "सत्ताईस", 28: "अट्ठाईस", 29: "उनतीस", 30: "तीस", 31: "इकतीस"
};
const GUJARATI_HOUR_WORDS: Record<number, string> = {
  1: "એક", 2: "બે", 3: "ત્રણ", 4: "ચાર", 5: "પાંચ", 6: "છ",
  7: "સાત", 8: "આઠ", 9: "નવ", 10: "દસ", 11: "અગિયાર", 12: "બાર"
};
const HINDI_HOUR_WORDS: Record<number, string> = {
  1: "एक", 2: "दो", 3: "तीन", 4: "चार", 5: "पाँच", 6: "छह",
  7: "सात", 8: "आठ", 9: "नौ", 10: "दस", 11: "ग्यारह", 12: "बारह"
};

function formatGujaratiYear(year: number): string {
  if (year === 2026) return "બે હજાર છવીસ";
  if (year >= 2000 && year < 2100) {
    const suffix = year % 100;
    return suffix === 0 ? "બે હજાર" : `બે હજાર ${GUJARATI_DAY_NUMBER_WORDS[suffix] ?? String(suffix)}`;
  }
  return String(year);
}

function formatHindiYear(year: number): string {
  if (year === 2026) return "दो हजार छब्बीस";
  if (year >= 2000 && year < 2100) {
    const suffix = year % 100;
    return suffix === 0 ? "दो हजार" : `दो हजार ${HINDI_DAY_NUMBER_WORDS[suffix] ?? String(suffix)}`;
  }
  return String(year);
}

function spokenTimeContext(hours24: number, prompts: ConversationPrompts): string {
  if (isGujaratiPromptSet(prompts)) {
    if (hours24 < 12) return "સવારે";
    if (hours24 < 17) return "બપોરે";
    if (hours24 < 21) return "સાંજે";
    return "રાત્રે";
  }
  if (isHindiPromptSet(prompts)) {
    if (hours24 < 12) return "सुबह";
    if (hours24 < 17) return "दोपहर";
    if (hours24 < 21) return "शाम";
    return "रात";
  }
  return "";
}

function formatPhoneNumberForSpeech(value: string, prompts: ConversationPrompts): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return value;
  if (isGujaratiPromptSet(prompts)) {
    return digits.split("").map((digit) => GUJARATI_DIGIT_WORDS[Number(digit)] ?? digit).join(" ");
  }
  if (isHindiPromptSet(prompts)) {
    return digits.split("").map((digit) => HINDI_DIGIT_WORDS[Number(digit)] ?? digit).join(" ");
  }
  return value;
}

function formatSpokenTimeFromLabel(value: string, prompts: ConversationPrompts): string {
  const minutes = parseSlotMinutes(value);
  if (minutes === null) {
    if (isGujaratiPromptSet(prompts)) {
      if (value.toLowerCase() === "morning") return "સવારે";
      if (value.toLowerCase() === "afternoon") return "બપોરે";
      if (value.toLowerCase() === "evening") return "સાંજે";
    }
    if (isHindiPromptSet(prompts)) {
      if (value.toLowerCase() === "morning") return "सुबह";
      if (value.toLowerCase() === "afternoon") return "दोपहर";
      if (value.toLowerCase() === "evening") return "शाम";
    }
    return value;
  }

  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const hours12 = hours24 % 12 || 12;
  const nextHour12 = (hours12 % 12) + 1;

  if (isGujaratiPromptSet(prompts)) {
    const hourWord = GUJARATI_HOUR_WORDS[hours12] ?? String(hours12);
    const nextHourWord = GUJARATI_HOUR_WORDS[nextHour12] ?? String(nextHour12);
    const context = spokenTimeContext(hours24, prompts);
    if (mins === 0) return `${hourWord} વાગ્યે ${context}`;
    if (mins === 30) return `સાડા ${hourWord} વાગ્યે ${context}`;
    if (mins === 15) return `${hourWord} ને પંદર વાગ્યે ${context}`;
    if (mins === 45) return `${nextHourWord} વાગ્યાથી પંદર મિનિટ ઓછા ${context}`;
    const minuteWord = GUJARATI_DAY_NUMBER_WORDS[mins] ?? String(mins);
    return `${hourWord} ને ${minuteWord} મિનિટે ${context}`;
  }

  if (isHindiPromptSet(prompts)) {
    const hourWord = HINDI_HOUR_WORDS[hours12] ?? String(hours12);
    const nextHourWord = HINDI_HOUR_WORDS[nextHour12] ?? String(nextHour12);
    const context = spokenTimeContext(hours24, prompts);
    if (mins === 0) return `${context} ${hourWord} बजे`.trim();
    if (mins === 30) return `${context} साढ़े ${hourWord} बजे`.trim();
    if (mins === 15) return `${context} ${hourWord} बजकर पंद्रह मिनट`.trim();
    if (mins === 45) return `${context} ${nextHourWord} बजने में पंद्रह मिनट`.trim();
    const minuteWord = HINDI_DAY_NUMBER_WORDS[mins] ?? String(mins);
    return `${context} ${hourWord} बजकर ${minuteWord} मिनट`.trim();
  }

  return `at ${value}`;
}

function formatBookingDateForPrompt(value: string, prompts: ConversationPrompts): string {
  const normalized = value.toLowerCase();
  const isoDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const normalizedValue = isoDateMatch
    ? formatCalendarDate(new Date(Number(isoDateMatch[1]), Number(isoDateMatch[2]) - 1, Number(isoDateMatch[3])))
    : value;
  const normalizedDateText = normalizedValue.toLowerCase();
  const dateMatch = normalizedDateText.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i);
  const gujaratiDays: Record<string, string> = {
    monday: "\u0ab8\u0acb\u0aae\u0ab5\u0abe\u0ab0",
    tuesday: "\u0aae\u0a82\u0a97\u0ab3\u0ab5\u0abe\u0ab0",
    wednesday: "\u0aac\u0ac1\u0aa7\u0ab5\u0abe\u0ab0",
    thursday: "\u0a97\u0ac1\u0ab0\u0ac1\u0ab5\u0abe\u0ab0",
    friday: "\u0ab6\u0ac1\u0a95\u0acd\u0ab0\u0ab5\u0abe\u0ab0",
    saturday: "\u0ab6\u0aa8\u0abf\u0ab5\u0abe\u0ab0",
    sunday: "\u0ab0\u0ab5\u0abf\u0ab5\u0abe\u0ab0"
  };
  const gujaratiMonths: Record<string, string> = {
    january: "\u0a9c\u0abe\u0aa8\u0acd\u0aaf\u0ac1\u0a86\u0ab0\u0ac0",
    february: "\u0aab\u0ac7\u0aac\u0acd\u0ab0\u0ac1\u0a86\u0ab0\u0ac0",
    march: "\u0aae\u0abe\u0ab0\u0acd\u0a9a",
    april: "\u0a8f\u0aaa\u0acd\u0ab0\u0abf\u0ab2",
    may: "\u0aae\u0ac7",
    june: "\u0a9c\u0ac2\u0aa8",
    july: "\u0a9c\u0ac1\u0ab2\u0abe\u0a88",
    august: "\u0a91\u0a97\u0ab8\u0acd\u0a9f",
    september: "\u0ab8\u0aaa\u0acd\u0a9f\u0ac7\u0aae\u0acd\u0aac\u0ab0",
    october: "\u0a91\u0a95\u0acd\u0a9f\u0acb\u0aac\u0ab0",
    november: "\u0aa8\u0ab5\u0ac7\u0aae\u0acd\u0aac\u0ab0",
    december: "\u0aa1\u0abf\u0ab8\u0ac7\u0aae\u0acd\u0aac\u0ab0"
  };
  const hindiDays: Record<string, string> = {
    monday: "\u0938\u094b\u092e\u0935\u093e\u0930",
    tuesday: "\u092e\u0902\u0917\u0932\u0935\u093e\u0930",
    wednesday: "\u092c\u0941\u0927\u0935\u093e\u0930",
    thursday: "\u0917\u0941\u0930\u0941\u0935\u093e\u0930",
    friday: "\u0936\u0941\u0915\u094d\u0930\u0935\u093e\u0930",
    saturday: "\u0936\u0928\u093f\u0935\u093e\u0930",
    sunday: "\u0930\u0935\u093f\u0935\u093e\u0930"
  };
  const hindiMonths: Record<string, string> = {
    january: "\u091c\u0928\u0935\u0930\u0940",
    february: "\u092b\u0930\u0935\u0930\u0940",
    march: "\u092e\u093e\u0930\u094d\u091a",
    april: "\u0905\u092a\u094d\u0930\u0948\u0932",
    may: "\u092e\u0908",
    june: "\u091c\u0942\u0928",
    july: "\u091c\u0941\u0932\u093e\u0908",
    august: "\u0905\u0917\u0938\u094d\u0924",
    september: "\u0938\u093f\u0924\u0902\u092c\u0930",
    october: "\u0905\u0915\u094d\u091f\u0942\u092c\u0930",
    november: "\u0928\u0935\u0902\u092c\u0930",
    december: "\u0926\u093f\u0938\u0902\u092c\u0930"
  };

  if (isGujaratiPromptSet(prompts)) {
    if (dateMatch) {
      const day = Number(dateMatch[2]);
      return `${GUJARATI_DAYS_SPOKEN[dateMatch[1].toLowerCase()] ?? gujaratiDays[dateMatch[1].toLowerCase()]} ${GUJARATI_DAY_NUMBER_WORDS[day] ?? dateMatch[2]} ${GUJARATI_MONTHS_SPOKEN[dateMatch[3].toLowerCase()] ?? gujaratiMonths[dateMatch[3].toLowerCase()]} ${formatGujaratiYear(Number(dateMatch[4]))}`;
    }
    return gujaratiDays[normalizedDateText] ?? normalizedValue;
  }

  if (isHindiPromptSet(prompts)) {
    if (dateMatch) {
      const day = Number(dateMatch[2]);
      return `${HINDI_DAYS_SPOKEN[dateMatch[1].toLowerCase()] ?? hindiDays[dateMatch[1].toLowerCase()]} ${HINDI_DAY_NUMBER_WORDS[day] ?? dateMatch[2]} ${HINDI_MONTHS_SPOKEN[dateMatch[3].toLowerCase()] ?? hindiMonths[dateMatch[3].toLowerCase()]} ${formatHindiYear(Number(dateMatch[4]))}`;
    }
    return hindiDays[normalizedDateText] ?? normalizedValue;
  }

  if (dateMatch && isEnglishPromptSet(prompts)) {
    const weekday = dateMatch[1][0].toUpperCase() + dateMatch[1].slice(1).toLowerCase();
    const month = dateMatch[3][0].toUpperCase() + dateMatch[3].slice(1).toLowerCase();
    return `${weekday}, ${dateMatch[2]} ${month} ${dateMatch[4]}`;
  }

  return normalizedValue;
}

function formatBookingTimePhraseForPrompt(value: string, prompts: ConversationPrompts): string {
  const normalizedValue = String(value || "selected time").trim();
  if (!normalizedValue) return "selected time";

  return formatSpokenTimeFromLabel(normalizedValue, prompts);
}

function formatAvailabilityReplyForPrompt(reply: string, prompts: ConversationPrompts): string {
  return reply
    .replace(/\b(\d{4})[-/\s](\d{2})[-/\s](\d{2})\b/g, (_, year: string, month: string, day: string) =>
      formatBookingDateForPrompt(`${year}-${month}-${day}`, prompts)
    )
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})?\b/gi, (day) =>
      formatBookingDateForPrompt(day.toLowerCase(), prompts)
    )
    .replace(/\b(\d{1,2}(?::|\s)\d{2}\s*(?:am|pm))\b/gi, (time) => formatSpokenTimeFromLabel(time, prompts));
}

function stripDoctorTitle(name: string): string {
  return String(name || "assigned doctor").replace(/^dr\.?\s+/i, "").trim();
}

function shouldUseGujaratiSpeech(prompts?: ConversationPrompts): boolean {
  return prompts ? isGujaratiPromptSet(prompts) : true;
}

function formatDoctorNameForSpeech(name: string, prompts?: ConversationPrompts): string {
  const plainName = stripDoctorTitle(name);
  if (!shouldUseGujaratiSpeech(prompts)) {
    return plainName;
  }

  const normalized = plainName.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  const gujaratiDoctorNames: Record<string, string> = {
    "ananya sharma": "અનન્યા શર્મા",
    "rohan patel": "રોહન પટેલ",
    "meera shah": "મીરા શાહ",
    "pankaj shah": "પંકજ શાહ",
    "paresh shah": "પરેશ શાહ"
  };

  return gujaratiDoctorNames[normalized] ?? plainName;
}

function formatFeeAmountForSpeech(amount: number | string, prompts?: ConversationPrompts): string {
  const numericAmount = Number(amount);
  if (!shouldUseGujaratiSpeech(prompts) || !Number.isFinite(numericAmount)) {
    return `\u20b9${amount}`;
  }

  const gujaratiAmountWords: Record<number, string> = {
    100: "એકસો રૂપિયા",
    200: "બસો રૂપિયા",
    300: "ત્રણસો રૂપિયા",
    400: "ચારસો રૂપિયા",
    500: "પાંચસો રૂપિયા",
    600: "છસો રૂપિયા",
    700: "સાતસો રૂપિયા",
    800: "આઠસો રૂપિયા",
    900: "નવસો રૂપિયા",
    1000: "એક હજાર રૂપિયા",
    1200: "બારસો રૂપિયા",
    1500: "પંદરસો રૂપિયા",
    2000: "બે હજાર રૂપિયા"
  };

  return gujaratiAmountWords[numericAmount] ?? `\u20b9${amount}`;
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

function buildTimeLabel(hoursInput: number, minutesInput: number, marker: string | undefined): string | null {
  let hours = hoursInput;
  const minutes = minutesInput;

  if (hours < 1 || hours > 12 || minutes > 59) return null;

  if (
    marker === "pm"
    || (!marker && hours >= 12)
    || (!marker && hours >= 1 && hours <= 5)
    || (marker === "baje" && hours >= 12)
    || (marker === "baje" && hours >= 1 && hours <= 5)
  ) {
    if (hours < 12) hours += 12;
  } else if (marker === "am" && hours === 12) {
    hours = 0;
  }

  return formatTimeLabel(hours * 60 + minutes);
}

function extractExactTimeLabel(normalizedTranscript: string): string | null {
  const speechTimeText = normalizedTranscript
    .replace(/[\u0966-\u096F]/g, (digit) => String("\u0966\u0967\u0968\u0969\u096A\u096B\u096C\u096D\u096E\u096F".indexOf(digit)))
    .replace(/a\s*m|am|\u090f\s*\u090f\u092e|\u090f\u090f\u092e|\u090f\s*\u092e|\u090f\u092e/giu, " am ")
    .replace(/p\s*m|pm|\u092a\u0940\s*\u090f\u092e|\u092a\u0940\u090f\u092e|\u092a\u0940\s*\u092f\u092e|\u092a\u0940\u092f\u092e|\u092c\u0940\s*\u090f\u092e|\u092c\u0940\u090f\u092e|\u092c\u0940\s*\u092e|\u092c\u0940\u092e/giu, " pm ")
    .replace(/\u092c\u091c\u0947|baje|o clock/giu, " baje ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const compactMatch = speechTimeText.match(/\b(\d{3,4})\s*(am|pm|baje)?\b/i);
  if (compactMatch) {
    const digits = compactMatch[1];
    const label = buildTimeLabel(Number(digits.slice(0, -2)), Number(digits.slice(-2)), compactMatch[2]);
    if (label) return label;
  }

  const match = speechTimeText.match(/\b(\d{1,2})(?:\s*[:.]\s*(\d{2})|\s+(\d{2}))?\s*(am|pm|baje)?\b/i);
  if (!match) return null;

  return buildTimeLabel(Number(match[1]), Number(match[2] ?? match[3] ?? "0"), match[4]);
}

function extractExactTimeLabelLegacy(normalizedTranscript: string): string | null {
  const text = normalizedTranscript
    .replace(/[à¥¦-à¥¯]/g, (digit) => String("à¥¦à¥§à¥¨à¥©à¥ªà¥«à¥¬à¥­à¥®à¥¯".indexOf(digit)))
    .replace(/\b(a\s*m|à¤\s*à¤à¤®|à¤à¤à¤®)\b/giu, "am")
    .replace(/\b(p\s*m|à¤ªà¥€\s*à¤à¤®|à¤ªà¥€à¤à¤®)\b/giu, "pm")
    .replace(/\b(à¤¬à¤œà¥‡|baje|o clock)\b/giu, " baje ")
    .toLowerCase();
  const speechTimeText = text
    .replace(/[à¥¦-à¥¯]/g, (digit) => String("à¥¦à¥§à¥¨à¥©à¥ªà¥«à¥¬à¥­à¥®à¥¯".indexOf(digit)))
    .replace(/\b(à¤\s*à¤à¤®|à¤à¤à¤®|à¤à¤®)\b/giu, "am")
    .replace(/\b(à¤ªà¥€\s*à¤à¤®|à¤ªà¥€à¤à¤®)\b/giu, "pm");

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

function findActiveAppointmentForCallerByDoctor(
  appointments: AppointmentSnapshot[],
  callerNumber: string | null | undefined,
  doctorName: string,
  runtimeDoctors: RuntimeDoctor[]
): SessionAppointmentSnapshot | null {
  const caller = normalizePhoneLast10(callerNumber);
  if (!caller) return null;

  const normalizedDoctorName = doctorName.toLowerCase();
  const doctor = runtimeDoctors.find((entry) => entry.name.toLowerCase() === normalizedDoctorName);

  return (
    appointments.find((appointment) => {
      if (normalizePhoneLast10(appointment.phoneNumber) !== caller || !isActiveAppointment(appointment)) {
        return false;
      }

      const appointmentDoctor = resolveDoctorForAppointment(appointment, runtimeDoctors);
      return appointment.doctorId === doctor?.doctorId
        || appointmentDoctor?.name.toLowerCase() === normalizedDoctorName
        || appointment.doctorName?.toLowerCase() === normalizedDoctorName;
    })
    ?? null
  );
}

function activeAppointmentsForCaller(
  appointments: AppointmentSnapshot[],
  callerNumber: string | null | undefined
): SessionAppointmentSnapshot[] {
  const caller = normalizePhoneLast10(callerNumber);
  if (!caller) return [];

  return appointments.filter((appointment) => normalizePhoneLast10(appointment.phoneNumber) === caller && isActiveAppointment(appointment));
}

function appointmentMatchesDoctor(
  appointment: SessionAppointmentSnapshot,
  doctorName: string,
  runtimeDoctors: RuntimeDoctor[]
): boolean {
  const normalizedDoctorName = doctorName.toLowerCase();
  const doctor = runtimeDoctors.find((entry) => entry.name.toLowerCase() === normalizedDoctorName);
  const appointmentDoctor = resolveDoctorForAppointment(appointment, runtimeDoctors);

  return appointment.doctorId === doctor?.doctorId
    || appointmentDoctor?.name.toLowerCase() === normalizedDoctorName
    || appointment.doctorName?.toLowerCase() === normalizedDoctorName;
}

function appointmentMatchesTime(appointment: SessionAppointmentSnapshot, requestedTime: string): boolean {
  const requestedMinutes = parseSlotMinutes(requestedTime);
  const appointmentMinutes = parseSlotMinutes(appointment.appointmentDate);

  return requestedMinutes !== null && appointmentMinutes !== null && requestedMinutes === appointmentMinutes;
}

function normalizeLookupText(value: string | null | undefined): string {
  return normalizeIndicDigits(String(value ?? ""))
    .toLowerCase()
    .replace(/[.,!?;:()"'`]/g, " ")
    .replace(/\b(dr|doctor|appointment|booking|cancel|reschedule|schedule|with|for|at|on|the|a|an)\b/giu, " ")
    .replace(/\b(appointment|book|booking|cancel|reschedule|schedule|slot|time|patient|name|naam)\b/giu, " ")
    .replace(/\b(candel|candle|kendal|kendel)\b/giu, " ")
    .replace(/(\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1\u0a82|\u0aa6\u0ab0\u0acd\u0aa6\u0ac0\u0aa8\u0ac1|\u0aa6\u0ab0\u0acd\u0aa6\u0ac0|\u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f\u0aa8\u0ac1\u0a82|\u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f|\u0aa8\u0abe\u0aae\u0ac7|\u0aa8\u0abe\u0aae|\u0a95\u0ac7\u0aa8\u0acd\u0ab8\u0ab2|\u0a95\u0ac7\u0aa8\u0acd\u0aa1\u0ab2|\u0aac\u0ac1\u0a95\u0abf\u0a82\u0a97|\u0aac\u0ac1\u0a95)/gu, " ")
    .replace(/[\u0A82\u0A83]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLookupName(value: string | null | undefined): string {
  return normalizeLookupText(value)
    .replace(/\b(ji|jee|bhai|ben|sir|madam)\b/giu, " ")
    .replace(/(\u0aad\u0abe\u0a88|\u0aad\u0abe\u0a87|\u0aac\u0ac7\u0aa8|\u0a9c\u0ac0|\u0aa8\u0ac0|\u0aa8\u0abe|\u0aa8\u0acb|\u0aa8\u0ac7|\u0aa8\u0ac1\u0a82|\u0aa8\u0ac1|\u0ab5\u0abe\u0ab3\u0ac0|\u0ab5\u0abe\u0ab3\u0abe|\u0ab5\u0abe\u0ab3\u0acb)$/gu, "")
    .replace(/(àª­àª¾àªˆ|àª­àª¾àª‡|àª¬à«‡àª¨|àªœà«€|àª¨à«€|àª¨àª¾|àª¨à«‹|àª¨à«‡|àª¨à«àª‚|àª¨à«|àªµàª¾àª³à«€|àªµàª¾àª³àª¾|àªµàª¾àª³à«‹)$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function appointmentPatientNameMatchesTranscript(
  appointment: SessionAppointmentSnapshot,
  normalizedTranscript: string
): boolean {
  const appointmentName = normalizeLookupName(appointment.patientName);
  if (!appointmentName) return false;

  const transcript = normalizeLookupText(normalizedTranscript);
  if (transcript.includes(appointmentName)) return true;

  const appointmentTokens = appointmentName.split(" ").filter((token) => token.length >= 2);
  if (appointmentTokens.length === 0) return false;

  const transcriptTokens = transcript.split(" ").filter((token) => token.length >= 2);
  return appointmentTokens.every((token) => transcriptTokens.some((candidate) => tokenLooksSimilar(token, candidate) || candidate.includes(token) || token.includes(candidate)));
}

function tokenLooksSimilar(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 3 || right.length < 3) return false;

  const maxDistance = Math.max(1, Math.floor(Math.min(left.length, right.length) / 4));
  return levenshteinDistance(left, right) <= maxDistance;
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const previous: number[] = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current: number[] = new Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}

function findMentionedPatientNameFromAppointments(
  appointments: SessionAppointmentSnapshot[],
  normalizedTranscript: string
): string | null {
  const directName = extractPatientName(normalizedTranscript);
  if (directName) return directName;

  const match = appointments.find((appointment) => appointmentPatientNameMatchesTranscript(appointment, normalizedTranscript));
  return match?.patientName ?? null;
}

function hasExplicitPatientNameCue(value: string): boolean {
  const normalized = normalizePatientNameText(value).toLowerCase();
  return containsAny(normalized, [
    "patient name",
    "patient",
    "name",
    "naam",
    "\u0aa6\u0ab0\u0acd\u0aa6\u0ac0",
    "\u0aaa\u0ac7\u0ab6\u0aa8\u0acd\u0a9f",
    "\u0aa8\u0abe\u0aae"
  ]);
}

type AppointmentLookupSelection = {
  appointment: SessionAppointmentSnapshot | null;
  matchedAppointments: SessionAppointmentSnapshot[];
  requestedDoctor: string | null;
  requestedPatientName: string | null;
  requestedDate: string | null;
  requestedTime: string | null;
};

function requestedWeekdayCue(normalizedTranscript: string): string | null {
  const normalized = normalizedTranscript.toLowerCase();
  const entries: Array<{ day: string; aliases: string[] }> = [
    { day: "monday", aliases: ["monday", "somvar", "somwaar", "\u0ab8\u0acb\u0aae\u0ab5\u0abe\u0ab0", "\u0ab8\u0acb\u0aae\u0ab5\u0abe\u0ab0\u0ac7"] },
    { day: "tuesday", aliases: ["tuesday", "mangalvar", "mangalwaar", "\u0aae\u0a82\u0a97\u0ab3\u0ab5\u0abe\u0ab0", "\u0aae\u0a82\u0a97\u0ab3\u0ab5\u0abe\u0ab0\u0ac7"] },
    { day: "wednesday", aliases: ["wednesday", "budhvar", "budhwar", "\u0aac\u0ac1\u0aa7\u0ab5\u0abe\u0ab0", "\u0aac\u0ac1\u0aa7\u0ab5\u0abe\u0ab0\u0ac7"] },
    { day: "thursday", aliases: ["thursday", "guruvar", "guruwar", "\u0a97\u0ac1\u0ab0\u0ac1\u0ab5\u0abe\u0ab0", "\u0a97\u0ac1\u0ab0\u0ac1\u0ab5\u0abe\u0ab0\u0ac7"] },
    { day: "friday", aliases: ["friday", "shukrvar", "shukrawar", "\u0ab6\u0ac1\u0a95\u0acd\u0ab0\u0ab5\u0abe\u0ab0", "\u0ab6\u0ac1\u0a95\u0acd\u0ab0\u0ab5\u0abe\u0ab0\u0ac7"] },
    { day: "saturday", aliases: ["saturday", "shanivar", "shaniwar", "\u0ab6\u0aa8\u0abf\u0ab5\u0abe\u0ab0", "\u0ab6\u0aa8\u0abf\u0ab5\u0abe\u0ab0\u0ac7"] },
    { day: "sunday", aliases: ["sunday", "ravivar", "raviwar", "\u0ab0\u0ab5\u0abf\u0ab5\u0abe\u0ab0", "\u0ab0\u0ab5\u0abf\u0ab5\u0abe\u0ab0\u0ac7"] }
  ];

  return entries.find((entry) => entry.aliases.some((alias) => normalized.includes(alias)))?.day ?? null;
}

function appointmentMatchesDate(appointment: SessionAppointmentSnapshot, requestedDate: string, requestedWeekday: string | null): boolean {
  const appointmentDate = normalizeLookupText(appointment.appointmentDate);
  const requested = normalizeLookupText(requestedDate);

  if (requested && appointmentDate.includes(requested)) return true;
  if (requestedWeekday && appointmentDate.includes(requestedWeekday)) return true;

  const appointmentParsed = appointment.appointmentDate ? new Date(appointment.appointmentDate) : null;
  const requestedParsed = requestedDate ? new Date(requestedDate) : null;

  if (
    appointmentParsed
    && requestedParsed
    && !Number.isNaN(appointmentParsed.getTime())
    && !Number.isNaN(requestedParsed.getTime())
  ) {
    return appointmentParsed.toISOString().slice(0, 10) === requestedParsed.toISOString().slice(0, 10);
  }

  return false;
}

function selectActiveAppointmentForCaller(
  appointments: AppointmentSnapshot[],
  callerNumber: string | null | undefined,
  normalizedTranscript: string,
  runtimeDoctors: RuntimeDoctor[]
): AppointmentLookupSelection {
  const callerAppointments = activeAppointmentsForCaller(appointments, callerNumber);
  const allActiveAppointments = appointments.filter((appointment) => isActiveAppointment(appointment));
  const doctorPreference = mapDoctorPreference(normalizedTranscript, createNewSession("appointment-lookup-probe", callerNumber ?? undefined), runtimeDoctors);
  const ambiguousDoctorMatches = doctorPreference ? [] : mapAmbiguousDoctorPreference(normalizedTranscript, runtimeDoctors);
  const requestedDoctorCandidates = doctorPreference?.selectedDoctor
    ? [doctorPreference.selectedDoctor]
    : ambiguousDoctorMatches.map((doctor) => doctor.name);
  const requestedDoctor = doctorPreference?.selectedDoctor
    ?? (ambiguousDoctorMatches.length === 1 ? ambiguousDoctorMatches[0].name : commonDoctorLastName(ambiguousDoctorMatches));
  const requestedTime = mapTimeFlexible(normalizedTranscript);
  const requestedDate = mapDateFlexible(normalizedTranscript);
  const requestedWeekday = requestedWeekdayCue(normalizedTranscript);
  const rawDirectPatientName = extractPatientName(normalizedTranscript);
  const hasDoctorCue = requestedDoctorCandidates.length > 0 || Boolean(requestedDoctor);
  const directPatientName = rawDirectPatientName && (!hasDoctorCue || hasExplicitPatientNameCue(normalizedTranscript))
    ? rawDirectPatientName
    : null;
  const activeAppointments = callerAppointments.length > 0 || !directPatientName
    ? callerAppointments
    : allActiveAppointments;
  const requestedPatientName = directPatientName ?? findMentionedPatientNameFromAppointments(activeAppointments, normalizedTranscript);

  if (activeAppointments.length === 0) {
    return { appointment: null, matchedAppointments: [], requestedDoctor, requestedPatientName, requestedDate, requestedTime };
  }

  const scored = activeAppointments
    .map((appointment, index) => {
      const doctorMatch = requestedDoctorCandidates.some((doctorName) => appointmentMatchesDoctor(appointment, doctorName, runtimeDoctors));
      const timeMatch = requestedTime ? appointmentMatchesTime(appointment, requestedTime) : false;
      const dateMatch = requestedDate ? appointmentMatchesDate(appointment, requestedDate, requestedWeekday) : false;
      const patientMatch = appointmentPatientNameMatchesTranscript(appointment, normalizedTranscript);
      const hasSpecificCue = Boolean(requestedDoctorCandidates.length > 0 || requestedDate || requestedTime || requestedPatientName);

      if (requestedDoctorCandidates.length > 0 && !doctorMatch) return null;
      if (requestedDate && !dateMatch) return null;
      if (requestedTime && !timeMatch) return null;
      if (requestedPatientName && !patientMatch) return null;

      return {
        appointment,
        score: (doctorMatch ? 4 : 0) + (patientMatch ? 5 : 0) + (dateMatch ? 3 : 0) + (timeMatch ? 3 : 0) + (hasSpecificCue ? 0 : 1),
        index
      };
    })
    .filter((entry): entry is { appointment: SessionAppointmentSnapshot; score: number; index: number } => entry !== null)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return {
    appointment: scored[0]?.appointment ?? null,
    matchedAppointments: scored.map((entry) => entry.appointment),
    requestedDoctor,
    requestedPatientName,
    requestedDate,
    requestedTime
  };
}

function selectActiveAppointmentForCancel(
  appointments: AppointmentSnapshot[],
  callerNumber: string | null | undefined,
  normalizedTranscript: string,
  runtimeDoctors: RuntimeDoctor[]
): AppointmentLookupSelection {
  return selectActiveAppointmentForCaller(appointments, callerNumber, normalizedTranscript, runtimeDoctors);
}

function hasCancelLookupCue(normalizedTranscript: string, runtimeDoctors: RuntimeDoctor[]): boolean {
  return Boolean(
    extractPatientName(normalizedTranscript)
    || mapDoctorPreference(normalizedTranscript, createNewSession("cancel-cue-probe", undefined), runtimeDoctors)
    || mapAmbiguousDoctorPreference(normalizedTranscript, runtimeDoctors).length > 0
    || mapDateFlexible(normalizedTranscript)
    || mapTimeFlexible(normalizedTranscript)
  );
}

function buildNoActiveAppointmentReply(selection: AppointmentLookupSelection, fallback: string, prompts?: ConversationPrompts): string {
  const parts = [
    selection.requestedPatientName ? `${selection.requestedPatientName} patient` : null,
    selection.requestedDoctor ? `Dr. ${stripDoctorTitle(selection.requestedDoctor)}` : null,
    selection.requestedDate ? `${selection.requestedDate}` : null,
    selection.requestedTime ? `${selection.requestedTime} slot` : null
  ].filter(Boolean);

  if (parts.length > 0) {
    return renderPrompt((prompts ?? DEFAULT_PROMPTS).noActiveAppointmentSpecific, {
      criteria: parts.join(", "),
      patientName: selection.requestedPatientName ?? "",
      doctor: selection.requestedDoctor ? stripDoctorTitle(selection.requestedDoctor) : "",
      date: selection.requestedDate ?? "",
      time: selection.requestedTime ?? ""
    });
  }

  return fallback;

  return parts.length > 0
    ? `àª† number àªªàª° ${parts.join(", ")} àª®àª¾àªŸà«‡ àª•à«‹àªˆ active appointment àª®àª³à«€ àª¨àª¥à«€.`
    : fallback;
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

function buildAppointmentSpeech(appointment: SessionAppointmentSnapshot, runtimeDoctors: RuntimeDoctor[], prompts?: ConversationPrompts): string {
  const doctorName = formatDoctorNameForSpeech(appointmentDoctorName(appointment, runtimeDoctors), prompts);
  const appointmentDate = prompts
    ? formatAvailabilityReplyForPrompt(appointment.appointmentDate ?? "selected slot", prompts)
    : (appointment.appointmentDate ?? "selected slot");
  const connector = prompts && isGujaratiPromptSet(prompts) ? "\u0aaa\u0ab0" : "par";
  return `${appointmentDate} ${connector} ${doctorName}`;
}

function buildAppointmentSpeechWithPatient(appointment: SessionAppointmentSnapshot, runtimeDoctors: RuntimeDoctor[], prompts?: ConversationPrompts): string {
  const appointmentSpeech = buildAppointmentSpeech(appointment, runtimeDoctors, prompts);
  const patientName = appointment.patientName?.trim();

  if (!patientName) {
    return appointmentSpeech;
  }

  return prompts && isGujaratiPromptSet(prompts)
    ? `${appointmentSpeech}, \u0aa8\u0abe\u0aae ${patientName}`
    : `${appointmentSpeech}, patient ${patientName}`;
}

function buildCancelPatientNamePrompt(selection: AppointmentLookupSelection, prompts: ConversationPrompts): string {
  const isGujarati = isGujaratiPromptSet(prompts);
  const criteria = [
    selection.requestedDoctor ? formatDoctorNameForSpeech(selection.requestedDoctor, prompts) : null,
    selection.requestedDate ? formatAvailabilityReplyForPrompt(selection.requestedDate, prompts) : null,
    selection.requestedTime ?? null
  ].filter(Boolean).join(isGujarati ? " " : " ");

  return renderPrompt(prompts.cancelAskPatientName, {
    criteria: criteria || (isGujarati ? "\u0a86 booking" : "this booking"),
    doctor: selection.requestedDoctor ? formatDoctorNameForSpeech(selection.requestedDoctor, prompts) : "",
    date: selection.requestedDate ?? "",
    time: selection.requestedTime ?? ""
  });
}

function orderedSlotsByTime(slots: string[]): string[] {
  return [...slots].sort((left, right) => {
    const leftMinutes = parseSlotMinutes(left);
    const rightMinutes = parseSlotMinutes(right);
    if (leftMinutes === null && rightMinutes === null) return 0;
    if (leftMinutes === null) return 1;
    if (rightMinutes === null) return -1;
    return leftMinutes - rightMinutes;
  });
}

function wantsLaterOfferedSlot(normalizedTranscript: string): boolean {
  return [
    "baad wala",
    "baad vala",
    "bad wala",
    "bad vala",
    "baad wala jo",
    "later one",
    "later slot",
    "last slot",
    "second slot",
    "dusra",
    "doosra",
    "dusra wala",
    "doosra wala",
    "afternoon wala",
    "afternoon ka",
    "\u092c\u093e\u0926 \u0935\u093e\u0932\u093e",
    "\u092c\u093e\u0926 \u0935\u093e\u0932\u093e \u091c\u094b",
    "\u0926\u0942\u0938\u0930\u093e",
    "\u0926\u0941\u0938\u0930\u093e",
    "\u0926\u0942\u0938\u0930\u093e \u0935\u093e\u0932\u093e",
    "\u0906\u092b\u094d\u091f\u0930\u0928\u0942\u0928 \u0935\u093e\u0932\u093e",
    "\u0906\u0916\u093f\u0930\u0940",
    "\u0932\u093e\u0938\u094d\u091f"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function wantsEarlierOfferedSlot(normalizedTranscript: string): boolean {
  return [
    "pehla",
    "pehla wala",
    "first slot",
    "first one",
    "morning wala",
    "morning ka",
    "subah wala",
    "\u092a\u0939\u0932\u093e",
    "\u092a\u0939\u0932\u0947 \u0935\u093e\u0932\u093e",
    "\u0938\u0941\u092c\u0939 \u0935\u093e\u0932\u093e",
    "\u092e\u0949\u0930\u094d\u0928\u093f\u0902\u0917 \u0935\u093e\u0932\u093e"
  ].some((phrase) => normalizedTranscript.includes(phrase));
}

function requestedSpokenHour(normalizedTranscript: string): number | null {
  const hourAliases: Array<{ hour: number; aliases: string[] }> = [
    { hour: 1, aliases: ["one", "wan", "won", "\u0935\u0928", "\u090f\u0915"] },
    { hour: 2, aliases: ["two", "too", "tu", "\u091f\u0942", "\u0926\u094b"] },
    { hour: 3, aliases: ["three", "\u0925\u094d\u0930\u0940", "\u0924\u0940\u0928"] },
    { hour: 4, aliases: ["four", "for", "\u092b\u094b\u0930", "\u091a\u093e\u0930"] },
    { hour: 5, aliases: ["five", "\u092b\u093e\u0907\u0935", "\u092a\u093e\u0902\u091a"] },
    { hour: 10, aliases: ["ten", "\u091f\u0947\u0928", "\u0926\u0938"] },
    { hour: 12, aliases: ["twelve", "\u091f\u094d\u0935\u0947\u0932\u094d\u0935", "\u092c\u093e\u0930\u0939"] }
  ];

  for (const entry of hourAliases) {
    if (entry.aliases.some((alias) => normalizedTranscript.includes(alias))) {
      return entry.hour;
    }
  }

  return null;
}

function matchOfferedSlotByHour(normalizedTranscript: string, slots: string[]): string | null {
  const requestedHour = requestedSpokenHour(normalizedTranscript);
  if (requestedHour === null) return null;

  const matches = slots.filter((slot) => {
    const minutes = parseSlotMinutes(slot);
    if (minutes === null) return false;
    const slotHour = Math.floor(minutes / 60) % 12 || 12;
    return slotHour === requestedHour;
  });

  return matches.length === 1 ? matches[0] : null;
}

function matchOfferedSlot(normalizedTranscript: string, offeredSlots: string[] | undefined): string | null {
  const slots = offeredSlots ?? [];
  if (!slots.length) return null;

  const orderedSlots = orderedSlotsByTime(slots);

  if (wantsLaterOfferedSlot(normalizedTranscript)) {
    return orderedSlots[orderedSlots.length - 1] ?? null;
  }

  if (wantsEarlierOfferedSlot(normalizedTranscript)) {
    return orderedSlots[0] ?? null;
  }

  const spokenHourSlot = matchOfferedSlotByHour(normalizedTranscript, slots);
  if (spokenHourSlot) return spokenHourSlot;

  const requested = mapTimeFlexible(normalizedTranscript);
  if (!requested) return null;

  if (["morning", "afternoon", "evening"].includes(requested)) {
    return slots.find((slot) => slotBucket(slot) === requested) ?? slots[0] ?? null;
  }

  const requestedMinutes = parseSlotMinutes(requested);
  if (requestedMinutes === null) return null;

  const exactSlot = slots.find((slot) => parseSlotMinutes(slot) === requestedMinutes);
  if (exactSlot) return exactSlot;

  const requestedHour = Math.floor(requestedMinutes / 60) % 12 || 12;
  const sameHourSlots = slots.filter((slot) => {
    const slotMinutes = parseSlotMinutes(slot);
    return slotMinutes !== null && (Math.floor(slotMinutes / 60) % 12 || 12) === requestedHour;
  });

  return sameHourSlots.length === 1 ? sameHourSlots[0] : null;
}

function rescheduleAlternativeSlots(session: DemoSessionRecord): string[] {
  const currentSlot = session.reschedule_confirmed_slot?.time ?? session.preferredTime ?? null;
  const currentMinutes = parseSlotMinutes(currentSlot);
  return (session.reschedule_available_slots ?? []).filter((slot) => {
    const slotMinutes = parseSlotMinutes(slot);
    return currentMinutes === null || slotMinutes === null || slotMinutes !== currentMinutes;
  });
}

function buildRescheduleSlotOptionsReply(day: string | null | undefined, slots: string[], prompts: ConversationPrompts): string {
  const slotText = slotChoiceText(slots, prompts);
  const formattedDay = formatBookingDateForPrompt(day ?? "selected day", prompts);
  if (isGujaratiPromptSet(prompts)) {
    return `${formattedDay} પર ${slotText} available છે. કયો slot રાખું?`;
  }
  if (hasDevanagariText(`${prompts.askDate} ${prompts.rescheduleAskSlot}`)) {
    return `${formattedDay} को ${slotText} available है. कौन सा slot रखूं?`;
  }
  if (isEnglishPromptSet(prompts)) {
    return `${formattedDay} has ${slotText} available. Which slot should I keep?`;
  }
  return `${formattedDay} ko ${slotText} available hai. Kaunsa slot rakh doon?`;
}

function nextAlternativeSlot(session: DemoSessionRecord): string | null {
  const slots = session.availabilityOfferedSlots ?? [];
  if (!slots.length) {
    return null;
  }

  const currentMinutes = parseSlotMinutes(session.preferredTime);
  const alternatives = slots.filter((slot) => parseSlotMinutes(slot) !== currentMinutes);
  return alternatives[0] ?? null;
}

function resolveBookingSlotCorrection(
  session: DemoSessionRecord,
  normalizedTranscript: string,
  runtimeDoctors: RuntimeDoctor[],
  appointments: AppointmentSnapshot[],
  prompts: ConversationPrompts,
  intelligence: Required<IntelligenceSettings>
): { session: DemoSessionRecord; reply: string; stage: BookingStage; action: string } | null {
  if (!session.selectedDoctor || !session.preferredDate) {
    return null;
  }

  const requestedTime =
    matchOfferedSlot(normalizedTranscript, session.availabilityOfferedSlots)
    ?? (wantsAlternativeSlot(normalizedTranscript) ? nextAlternativeSlot(session) : null)
    ?? mapTimeFlexible(normalizedTranscript);

  if (!requestedTime) {
    return null;
  }

  const selectedDoctor = runtimeDoctors.find((doctor) => doctor.name === session.selectedDoctor) ?? null;
  const updated = updateSession(session, {
    preferredTime: requestedTime,
    availabilityCheckKey: null,
    availabilityOfferedDate: null,
    availabilityOfferedTime: null,
    availabilityOfferedSlots: []
  });
  const resolution = resolveAvailability({
    doctor: selectedDoctor as AvailabilityRuntimeDoctor | null,
    requestedDay: updated.preferredDate,
    requestedTime,
    appointments,
    prompts: prompts as AvailabilityPromptTemplates
  });

  if (!resolution) {
    return null;
  }

  const availabilityReply = formatAvailabilityReplyForPrompt(resolution.reply, prompts);

  if (resolution.status === "available") {
    const availableSession = updateSession(updated, {
      preferredDate: normalizeResolvedDateValue(resolution.selectedDate) ?? updated.preferredDate,
      preferredTime: resolution.selectedTime ?? updated.preferredTime,
      availabilityCheckKey: resolution.checkKey,
      availabilityOfferedSlots: resolution.offeredSlots
    });
    const next = askNextMissingField(availableSession, runtimeDoctors, prompts, intelligence);

    return {
      session: next.session,
      reply: `${availabilityReply} ${next.reply}`,
      stage: next.stage,
      action: "change_slot_available"
    };
  }

  if (resolution.status === "time_full") {
    const normalizedOfferedDate = normalizeResolvedDateValue(resolution.offeredDate);
    const offeredDifferentDay = normalizedOfferedDate && normalizedOfferedDate !== updated.preferredDate;
    const offeredSession = updateSession(updated, {
      preferredTime: null,
      availabilityCheckKey: resolution.checkKey,
      availabilityOfferedDate: normalizedOfferedDate ?? updated.preferredDate,
      availabilityOfferedTime: resolution.offeredTime ?? null,
      availabilityOfferedSlots: resolution.offeredSlots
    });

    return {
      session: offeredSession,
      reply: availabilityReply,
      stage: offeredDifferentDay ? "waiting_for_date" : "waiting_for_time",
      action: offeredDifferentDay ? "change_slot_next_day_offered" : "change_slot_time_full"
    };
  }

  return null;
}

function buildRescheduleConfirmation(
  appointment: SessionAppointmentSnapshot | null | undefined,
  session: DemoSessionRecord,
  runtimeDoctors: RuntimeDoctor[],
  prompts: ConversationPrompts
): string {
  const doctorName = formatDoctorNameForSpeech(appointmentDoctorName(appointment, runtimeDoctors), prompts);
  return renderPrompt(prompts.rescheduleConfirm, {
    day: formatBookingDateForPrompt(session.reschedule_new_day ?? "selected day", prompts),
    slot: session.reschedule_confirmed_slot?.time ?? "selected slot",
    doctor: doctorName
  });
}

function resolveRescheduleSlotCorrection(
  session: DemoSessionRecord,
  normalizedTranscript: string,
  existingBooking: SessionAppointmentSnapshot | null | undefined,
  runtimeDoctors: RuntimeDoctor[],
  appointments: AppointmentSnapshot[],
  prompts: ConversationPrompts
): { session: DemoSessionRecord; reply: string; stage: BookingStage; action: string } | null {
  if (!existingBooking || !session.reschedule_new_day) {
    return null;
  }

  const selectedDoctor = resolveDoctorForAppointment(existingBooking, runtimeDoctors);
  if (!selectedDoctor) {
    return null;
  }

  const requestedDay = mapDateFlexible(normalizedTranscript) ?? session.reschedule_new_day;
  const requestedTime = mapTimeFlexible(normalizedTranscript);
  const selectedSlot = requestedTime ? matchOfferedSlot(normalizedTranscript, session.reschedule_available_slots) : null;

  if (selectedSlot) {
    const updated = updateSession(session, {
      ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
      reschedule_existing: existingBooking,
      reschedule_new_day: requestedDay,
      preferredDate: requestedDay,
      preferredTime: selectedSlot,
      reschedule_confirmed_slot: { time: selectedSlot }
    });

    return {
      session: updated,
      reply: buildRescheduleConfirmation(existingBooking, updated, runtimeDoctors, prompts),
      stage: "reschedule_confirming",
      action: "reschedule_slot_changed"
    };
  }

  if (!requestedTime && wantsAlternativeSlot(normalizedTranscript)) {
    const alternativeSlots = rescheduleAlternativeSlots(session);

    if (alternativeSlots.length > 0) {
      return {
        session: updateSession(session, { reschedule_confirmed_slot: null, preferredTime: null }),
        reply: buildRescheduleSlotOptionsReply(session.reschedule_new_day, alternativeSlots, prompts),
        stage: "reschedule_waiting_for_new_slot",
        action: "reschedule_list_alternative_slots"
      };
    }

    return {
      session,
      reply: `${renderPrompt(prompts.availabilitySlotsFullNoNext, { day: session.reschedule_new_day })} ${buildRescheduleConfirmation(existingBooking, session, runtimeDoctors, prompts)}`,
      stage: "reschedule_confirming",
      action: "reschedule_no_alternative_slots"
    };
  }

  if (!requestedTime) {
    return null;
  }

  const resolution = resolveAvailability({
    doctor: selectedDoctor as AvailabilityRuntimeDoctor,
    requestedDay,
    requestedTime,
    appointments,
    prompts: prompts as AvailabilityPromptTemplates
  });

  if (resolution?.status === "available") {
    const resolvedSlot = resolution.selectedTime ?? resolution.offeredSlots[0] ?? requestedTime;
    const resolvedDay = normalizeResolvedDateValue(resolution.selectedDate) ?? requestedDay;
    const updated = updateSession(session, {
      ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
      reschedule_existing: existingBooking,
      reschedule_new_day: resolvedDay,
      reschedule_available_slots: resolution.offeredSlots.length ? resolution.offeredSlots : [resolvedSlot],
      preferredDate: resolvedDay,
      preferredTime: resolvedSlot,
      reschedule_confirmed_slot: { time: resolvedSlot }
    });

    return {
      session: updated,
      reply: buildRescheduleConfirmation(existingBooking, updated, runtimeDoctors, prompts),
      stage: "reschedule_confirming",
      action: "reschedule_slot_changed"
    };
  }

  if (resolution?.status === "time_full" || resolution?.status === "day_unavailable") {
    const offeredDay = normalizeResolvedDateValue(resolution.offeredDate) ?? requestedDay;
    const offeredSlots = resolution.offeredSlots;
    const updated = updateSession(session, {
      ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
      reschedule_existing: existingBooking,
      reschedule_new_day: offeredDay,
      reschedule_available_slots: offeredSlots,
      reschedule_confirmed_slot: null,
      preferredDate: null,
      preferredTime: null
    });
    const slotFollowup = offeredSlots.length ? ` ${buildRescheduleSlotOptionsReply(offeredDay, offeredSlots, prompts)}` : "";

    return {
      session: updated,
      reply: `${formatAvailabilityReplyForPrompt(resolution.reply, prompts)}${slotFollowup}`,
      stage: offeredSlots.length ? "reschedule_waiting_for_new_slot" : "reschedule_waiting_for_new_day",
      action: resolution.status === "time_full" ? "reschedule_requested_time_unavailable" : "reschedule_requested_day_unavailable"
    };
  }

  return null;
}

function buildRescheduleFinal(
  appointment: SessionAppointmentSnapshot | null | undefined,
  session: DemoSessionRecord,
  runtimeDoctors: RuntimeDoctor[],
  prompts: ConversationPrompts
): string {
  const doctorName = formatDoctorNameForSpeech(appointmentDoctorName(appointment, runtimeDoctors), prompts);
  const shortReference = appointmentIdOf(appointment) ? appointmentIdOf(appointment)!.slice(-4).toUpperCase() : "pending";
  return renderPrompt(prompts.rescheduleFinal, {
    day: formatBookingDateForPrompt(session.reschedule_new_day ?? "selected day", prompts),
    slot: session.reschedule_confirmed_slot?.time ?? "selected slot",
    doctor: doctorName,
    reference: shortReference
  });
}

function buildCancelConfirmation(appointment: SessionAppointmentSnapshot, runtimeDoctors: RuntimeDoctor[], prompts: ConversationPrompts): string {
  return renderPrompt(prompts.cancelConfirm, {
    appointment: buildAppointmentSpeechWithPatient(appointment, runtimeDoctors, prompts),
    patientName: appointment.patientName ?? ""
  });
}

function maskMobile(value: string): string {
  return value.length >= 4 ? `છેલ્લા 4 અંક ${value.slice(-4)}` : value;
}

function spokenPhoneNumber(value: string): string {
  const digits = normalizePhoneLast10(value) ?? value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function buildCallerNumberConfirmation(ani: string, prompts: ConversationPrompts): string {
  return renderPrompt(prompts.callerNumberConfirmation, { maskedNumber: maskMobile(ani), number: ani });
}

function buildCallerReuseConfirmation(ani: string, prompts: ConversationPrompts): string {
  return renderPrompt(prompts.callerReuseConfirmation, { maskedNumber: maskMobile(ani), number: ani });
}

function buildPhoneReadbackConfirmation(number: string, prompts: ConversationPrompts): string {
  const spoken = spokenPhoneNumber(number);
  if (isGujaratiPromptSet(prompts)) {
    return `${spoken} - સાચું છે?`;
  }
  if (hasDevanagariText(`${prompts.askDate} ${prompts.askTime} ${prompts.bookingFinalSummary}`)) {
    return `${spoken} - सही है?`;
  }
  return `${spoken} - is that correct?`;
}

function callerRequestsExistingNumber(normalizedTranscript: string): boolean {
  return [
    "same number",
    "this number",
    "use this number",
    "use same number",
    "yahi number",
    "yehi number",
    "isi number",
    "આ જ નંબર",
    "આ નંબર વાપરો",
    "આ જ વાપરો",
    "આ નંબર",
    "એ જ નંબર"
  ].some((phrase) => normalizedTranscript.includes(phrase.toLowerCase()));
}

function isAbsoluteIsoDate(value: string | null | undefined): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function sanitizeSpeechPunctuation(reply: string): string {
  return reply
    .replace(/[`*_#~|<>]/g, " ")
    .replace(/[,:;!?()[\]{}\\\/]+/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeReplyForSpeech(reply: string, prompts: ConversationPrompts): string {
  let nextReply = formatAvailabilityReplyForPrompt(reply, prompts);

  if (isGujaratiPromptSet(prompts)) {
    nextReply = nextReply
      .replace(/\bDoctor\b/gi, "ડોક્ટર")
      .replace(/\bdepartment\b/gi, "વિભાગ")
      .replace(/\bbooking\b/gi, "અપોઇન્ટમેન્ટ")
      .replace(/\bcontact number\b/gi, "સંપર્ક નંબર")
      .replace(/\bappointment booked\b/gi, "અપોઇન્ટમેન્ટ નક્કી થઈ ગઈ છે")
      .replace(/\bReference last 4\b/gi, "રેફરન્સના છેલ્લાં 4")
      .replace(/\bSMS notification\b/gi, "SMS સૂચના")
      .replace(/\bpar\b/gi, "પર")
      .replace(/\bko\b/gi, "ને")
      .replace(/\bya\b/gi, "અથવા");
  } else if (hasDevanagariText(`${prompts.askDate} ${prompts.askTime} ${prompts.bookingFinalSummary}`)) {
    nextReply = nextReply
      .replace(/\bDoctor\b/gi, "डॉक्टर")
      .replace(/\bdepartment\b/gi, "विभाग")
      .replace(/\bbooking\b/gi, "अपॉइंटमेंट")
      .replace(/\bcontact number\b/gi, "संपर्क नंबर")
      .replace(/\bappointment booked\b/gi, "अपॉइंटमेंट बुक हो गई है")
      .replace(/\bReference last 4\b/gi, "रेफरेंस के आख़िरी 4")
      .replace(/\bSMS notification\b/gi, "SMS सूचना")
      .replace(/\bpar\b/gi, "पर")
      .replace(/\bko\b/gi, "को")
      .replace(/\bya\b/gi, "या");
  } else {
    nextReply = nextReply
      .replace(/\bSMS notification\b/gi, "SMS notification")
      .replace(/\bReference last 4\b/gi, "Reference last 4");
  }

  nextReply = sanitizeSpeechPunctuation(nextReply);
  return nextReply.replace(/\s+/g, " ").trim();
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

function slotChoiceText(slots: string[] | undefined, prompts?: ConversationPrompts): string {
  const usable = (slots ?? []).slice(0, 2).map((slot) => prompts ? formatSpokenTimeFromLabel(slot, prompts) : slot);
  const joiner = prompts && isGujaratiPromptSet(prompts)
    ? "અથવા"
    : prompts && hasDevanagariText(`${prompts.askTime} ${prompts.rescheduleAskSlot}`)
      ? "या"
      : prompts && isEnglishPromptSet(prompts)
        ? "or"
        : "ya";
  const fallback = prompts && isEnglishPromptSet(prompts)
    ? "morning or afternoon"
    : prompts && isGujaratiPromptSet(prompts)
      ? "સવારે અથવા બપોરે"
      : prompts && hasDevanagariText(`${prompts.askTime} ${prompts.rescheduleAskSlot}`)
        ? "सुबह या दोपहर"
        : "morning ya afternoon";
  return usable.length > 0 ? usable.join(` ${joiner} `) : fallback;
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
        slotChoices: slotChoiceText(session.availabilityOfferedSlots ?? memory.lastSuggestedSlots, prompts)
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
  const lastReply = session.botResponseHistory.at(-1)?.text?.trim().toLowerCase();

  if (stage === "waiting_for_time") {
    const slots = session.availabilityOfferedSlots?.length ? session.availabilityOfferedSlots : memory.lastSuggestedSlots;
    const baseReply = slots?.length
      ? renderPrompt(prompts.recoveryTimeWithSlots, { slotChoices: slotChoiceText(slots, prompts) })
      : prompts.recoveryTimeGeneric;
    if (lastReply === baseReply.trim().toLowerCase()) {
      return slots?.length
        ? `${baseReply} ${isGujaratiPromptSet(prompts) ? "ઉદાહરણ તરીકે પહેલો કે પછીનો સ્લોટ કહી શકો." : "Jaise pehla ya baad wala slot bol sakte hain."}`
        : `${baseReply} ${isGujaratiPromptSet(prompts) ? "ઉદાહરણ તરીકે સવાર કે બપોર કહો." : "Jaise morning ya afternoon bol dijiye."}`;
    }
    return baseReply;
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
    if (lastReply === prompts.recoveryMobile.trim().toLowerCase()) {
      return isGujaratiPromptSet(prompts)
        ? "મોબાઇલ નંબર ધીરે ધીરે કહો. ઉદાહરણ તરીકે 98 25 10 24 67."
        : "Mobile number dheere dheere batayein. Jaise 98 25 10 24 67.";
    }
    return prompts.recoveryMobile;
  }

  if (stage === "waiting_for_patient_type") {
    if (lastReply === prompts.askPatientType.trim().toLowerCase()) {
      return isGujaratiPromptSet(prompts)
        ? "દાખલા તરીકે કહો - નવો દર્દી કે ફોલો અપ?"
        : "Jaise batayein - new patient ya follow-up?";
    }
    return prompts.askPatientType;
  }

  if (stage === "confirming") {
    return prompts.recoveryConfirmation;
  }

  return promptForStage(stage, prompts);
}

function askNextMissingField(
  session: DemoSessionRecord,
  runtimeDoctors: RuntimeDoctor[],
  prompts: ConversationPrompts,
  intelligence: Required<IntelligenceSettings>
): { reply: string; stage: BookingStage; action: string; session: DemoSessionRecord } {
  if (!session.selectedDoctor && !session.selectedSpecialization) {
    return {
      reply: buildDoctorPreferenceSelectionPrompt(session, runtimeDoctors, prompts),
      stage: "waiting_for_doctor_preference",
      action: "ask_missing_doctor_preference_first",
      session
    };
  }

  if (session.selectedSpecialization && !session.selectedDoctor) {
    const lastDoctor = getConversationMemory(session).lastDoctor;
    if (lastDoctor) {
      return { reply: renderPrompt(prompts.confirmRememberedDoctor, { doctor: lastDoctor }), stage: "waiting_for_doctor_preference", action: "ask_confirm_last_doctor", session };
    }
    return {
      reply: buildDoctorPreferenceSelectionPrompt(session, runtimeDoctors, prompts),
      stage: "waiting_for_doctor_preference",
      action: "ask_missing_doctor_preference",
      session
    };
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

  if (!session.contactNumber && session.bookingContactConfirmationPending && session.pendingContactNumber) {
    return {
      reply: buildPhoneReadbackConfirmation(session.pendingContactNumber, prompts),
      stage: "waiting_for_mobile",
      action: "confirm_mobile_readback",
      session
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
  const doctorPrompt = isPromptLikeDoctorPreference(normalizedTranscript);
  const datePrompt = isPromptLikeDateRequest(normalizedTranscript);
  const timePrompt = isPromptLikeTimeRequest(normalizedTranscript);
  const mobilePrompt = isPromptLikeMobileRequest(normalizedTranscript);
  const patientTypePrompt = isPromptLikePatientType(normalizedTranscript);
  const namePrompt = isPromptLikePatientName(transcript);

  if (!doctorPrompt) {
    const doctor = mapDoctorPreference(normalizedTranscript, next, runtimeDoctors);
    if (
      doctor
      && doctor.doctorPreference === "specific_doctor"
      && doctor.selectedDoctor !== next.selectedDoctor
    ) {
      const selectedDoctor = runtimeDoctors.find((runtimeDoctor) => runtimeDoctor.name === doctor.selectedDoctor) ?? null;
      next = updateSession(next, {
        doctorPreference: doctor.doctorPreference,
        selectedDoctor: doctor.selectedDoctor,
        selectedSpecialization: selectedDoctor?.specialization ?? next.selectedSpecialization
      });
    }

    const specialization = mapSpecialization(normalizedTranscript, runtimeDoctors);
    if (specialization && !next.selectedSpecialization) {
      const matchingDoctors = runtimeDoctors.filter((runtimeDoctor) => runtimeDoctor.specialization === specialization.specialization);
      next = updateSession(next, {
        selectedSpecialization: specialization.specialization,
        ...(matchingDoctors.length === 1 && !next.selectedDoctor
          ? {
              selectedDoctor: matchingDoctors[0].name,
              doctorPreference: "specific_doctor"
            }
          : {})
      });
    }
  }

  if (!datePrompt) {
    const date = mapDateFlexible(normalizedTranscript);
    if (date && !next.preferredDate) {
      next = updateSession(next, { preferredDate: date });
    }
  }

  if (!timePrompt) {
    const time = mapTimeFlexible(normalizedTranscript);
    if (time && !next.preferredTime) {
      next = updateSession(next, { preferredTime: time });
    }
  }

  if (!patientTypePrompt) {
    const patientType = mapPatientType(normalizedTranscript);
    if (patientType && !next.patientType) {
      next = updateSession(next, { patientType });
    }
  }

  if (!mobilePrompt) {
    const mobile = resolveMobile(transcript, next.callerNumber, next.contactNumber);
    if (mobile && !next.contactNumber) {
      next = updateSession(next, {
        pendingContactNumber: mobile,
        contactNumber: null,
        partialMobileDigits: null,
        bookingContactConfirmed: false,
        bookingContactConfirmationPending: true
      });
    }
  }

  if (!namePrompt) {
    const hasNameCue = /\b(mera|name|naam|patient)\b/i.test(transcript) || /(àª®àª¾àª°à«àª‚|àª®àª¾àª°à«|àª¨àª¾àª®|à¤®à¥‡à¤°à¤¾|à¤¨à¤¾à¤®)/u.test(transcript);
    if (hasNameCue && !next.patientName) {
      const patientName = extractPatientName(transcript);
      if (patientName) {
        next = updateSession(next, { patientName });
      }
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

  const availabilityReply = formatAvailabilityReplyForPrompt(resolution.reply, prompts);

  if (resolution.status === "available") {
    const updated = updateSession(session, {
      preferredDate: normalizeResolvedDateValue(resolution.selectedDate) ?? session.preferredDate,
      preferredTime: resolution.selectedTime ?? session.preferredTime,
      availabilityCheckKey: resolution.checkKey,
      availabilityOfferedDate: null,
      availabilityOfferedTime: null,
      availabilityOfferedSlots: resolution.offeredSlots
    });
    const next = askNextMissingField(updated, runtimeDoctors, prompts, intelligence);
    return {
      session: next.session,
      reply: `${availabilityReply} ${next.reply}`,
      stage: next.stage,
      action: "availability_available"
    };
  }

  if (resolution.status === "time_full") {
    const normalizedOfferedDate = normalizeResolvedDateValue(resolution.offeredDate);
    const offeredDifferentDay = normalizedOfferedDate && normalizedOfferedDate !== session.preferredDate;
    const updated = updateSession(session, {
      preferredTime: null,
      availabilityCheckKey: resolution.checkKey,
      availabilityOfferedDate: normalizedOfferedDate ?? session.preferredDate,
      availabilityOfferedTime: resolution.offeredTime ?? null,
      availabilityOfferedSlots: resolution.offeredSlots
    });
    return {
      session: updated,
      reply: availabilityReply,
      stage: offeredDifferentDay ? "waiting_for_date" : "waiting_for_time",
      action: offeredDifferentDay ? "availability_next_day_time_offered" : "availability_time_full"
    };
  }

  if (resolution.status === "day_unavailable") {
    const updated = updateSession(session, {
      preferredDate: null,
      preferredTime: null,
      availabilityCheckKey: resolution.checkKey,
      availabilityOfferedDate: normalizeResolvedDateValue(resolution.offeredDate) ?? null,
      availabilityOfferedTime: resolution.offeredTime ?? null,
      availabilityOfferedSlots: resolution.offeredSlots
    });
    return {
      session: updated,
      reply: availabilityReply,
      stage: "waiting_for_date",
      action: "availability_day_unavailable"
    };
  }

  if (resolution.status === "booking_disabled") {
    return {
      session: updateSession(session, { availabilityCheckKey: resolution.checkKey }),
      reply: availabilityReply,
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

function snapshotSession(session: DemoSessionRecord): DemoSessionRecord {
  return {
    ...session,
    availabilityOfferedSlots: [...(session.availabilityOfferedSlots ?? [])],
    reschedule_available_slots: [...(session.reschedule_available_slots ?? [])],
    conversationMemory: session.conversationMemory
      ? {
        ...session.conversationMemory,
        lastSuggestedSlots: [...(session.conversationMemory.lastSuggestedSlots ?? [])]
      }
      : undefined,
    transcriptHistory: [...session.transcriptHistory],
    analysisHistory: [...(session.analysisHistory ?? [])],
    analysisSummary: session.analysisSummary ?? null,
    botResponseHistory: [...session.botResponseHistory],
    usageLedger: [...(session.usageLedger ?? [])],
    qualityTrace: [...(session.qualityTrace ?? [])],
    qualitySummary: session.qualitySummary
      ? {
        ...session.qualitySummary,
        tags: [...session.qualitySummary.tags]
      }
      : undefined
  };
}

// ADDED:
function findDoctorForInferredSpecialization(specialization: string, runtimeDoctors: RuntimeDoctor[]): RuntimeDoctor | null {
  const doctorList = runtimeDoctors.length > 0 ? runtimeDoctors : FALLBACK_DOCTORS;
  const normalizedSpecialization = specialization.toLowerCase();

  return doctorList.find((doctor) => doctor.specialization.toLowerCase() === normalizedSpecialization)
    ?? doctorList.find((doctor) => doctor.specialization.toLowerCase().includes(normalizedSpecialization))
    ?? null;
}

// ADDED:
function resolveInferenceReplyLanguage(clinicSettings: ClinicSettings | null | undefined, prompts: ConversationPrompts): "en" | "hi" | "gu" {
  const configuredLanguage = resolveConfiguredPromptLanguage(clinicSettings);

  if (configuredLanguage) return configuredLanguage;

  const promptSample = `${prompts.askDate} ${prompts.askMobile} ${prompts.goodbyeMessage}`;

  if (/[\u0A80-\u0AFF]/u.test(promptSample)) {
    return "gu";
  }

  if (/\b(aap|kripya|theek|bata|chahiye|karni|karna|namaste)\b/i.test(promptSample)) {
    return "hi";
  }

  return "en";
}

// ADDED:
function buildLocalizedInferenceReply(
  inferenceResult: NonNullable<ReturnType<typeof inferCondition>>,
  clinicSettings: ClinicSettings | null | undefined,
  prompts: ConversationPrompts
): string {
  const language = resolveInferenceReplyLanguage(clinicSettings, prompts);

  if (inferenceResult.isEmergency) {
    if (language === "gu") {
      return "આ લક્ષણો ગંભીર હોઈ શકે છે. હું તમને તરત emergency સાથે connect કરું છું.";
    }

    if (language === "hi") {
      return "Yeh symptoms serious ho sakte hain. Main aapko turant emergency se connect kar rahi hoon.";
    }

    return inferenceResult.reply;
  }

  if (inferenceResult.condition === "Cardiac Symptoms") {
    if (language === "gu") {
      return "છાતીમાં દુખાવો અને સોજા માટે available cardiologist સાથે appointment લેવી સારી રહેશે. કયા દિવસનો slot જોવું?";
    }

    if (language === "hi") {
      return "Chest pain aur swelling ke liye available cardiologist se appointment lena best rahega. Kaunsa din check karoon?";
    }
  }

  if (inferenceResult.condition === "Stomach Pain") {
    if (language === "gu") {
      return "પેટના દુખાવા માટે General Medicine અથવા family physician સારું રહેશે. હું available doctor માટે appointment જોઈ શકું છું.";
    }

    if (language === "hi") {
      return "Pet dard ke liye General Medicine ya family physician best rahega. Main available doctor ke liye appointment dekh sakti hoon.";
    }
  }

  if (language === "gu") {
    return `${inferenceResult.specialization} માટે available doctor સાથે appointment લેવી સારી રહેશે. કયા દિવસનો slot જોવું?`;
  }

  if (language === "hi") {
    return `${inferenceResult.specialization} ke available doctor se appointment lena best rahega. Kaunsa din check karoon?`;
  }

  return inferenceResult.reply;
}

function resolveTurnConfidence(
  aiConfidence: number | null | undefined,
  intentLayerConfidence: number | null | undefined,
  inferenceConfidence: number | null | undefined
): number | null {
  const candidates = [aiConfidence, intentLayerConfidence, inferenceConfidence].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function resolveTurnAnalysis(session: DemoSessionRecord, input: {
  transcript: string;
  detectedIntent: string;
  confidence: number | null;
  inferenceResult: ReturnType<typeof inferCondition>;
  intentLayer: HospitalIntentResult;
  qualitySummary: DemoSessionRecord["qualitySummary"];
  stage: BookingStage;
  action: string;
}): CallTurnAnalysis {
  const qualitySummary = input.qualitySummary;
  const date = session.preferredDate ?? session.reschedule_new_day ?? session.availabilityOfferedDate ?? null;
  const time = session.preferredTime ?? session.availabilityOfferedTime ?? session.reschedule_confirmed_slot?.time ?? null;
  const doctor = session.selectedDoctor ?? input.inferenceResult?.doctorSuggestion ?? input.intentLayer.entities.doctor_name ?? null;
  const symptom = input.inferenceResult?.condition ?? input.intentLayer.entities.symptom ?? null;
  const language = detectIntentLanguage(input.transcript);
  const score = qualitySummary?.score ?? 100;
  const severity = qualitySummary?.severity ?? "info";
  const needsReview = score < 85 || (input.confidence !== null && input.confidence < 0.72) || (qualitySummary?.highIssueCount ?? 0) > 0;

  return {
    turn: (session.analysisHistory?.length ?? 0) + 1,
    detectedIntent: input.detectedIntent,
    confidence: input.confidence,
    symptom,
    doctor,
    date,
    time,
    language,
    severity,
    score,
    needsReview,
    transcript: input.transcript,
    stage: input.stage,
    action: input.action,
    createdAt: nowIso()
  };
}

function summarizeCallSession(session: DemoSessionRecord): string | null {
  const analysisHistory = session.analysisHistory ?? [];
  const latestTurn = analysisHistory[analysisHistory.length - 1] ?? null;
  const outcome =
    session.bookingStage === "booked"
      ? "booked"
      : session.bookingStage === "rescheduled"
        ? "rescheduled"
        : session.bookingStage === "cancelled"
          ? "cancelled"
          : session.callStatus === "transferred"
            ? "transferred"
            : session.latestIntent ?? "in_progress";

  const summaryParts: string[] = [];

  if (latestTurn) {
    summaryParts.push(`Latest intent: ${latestTurn.detectedIntent.replace(/_/g, " ")}.`);
    if (latestTurn.confidence !== null) {
      summaryParts.push(`Confidence ${Math.round(latestTurn.confidence * 100)}%.`);
    }
  }

  if (outcome === "booked") {
    summaryParts.push(
      `Appointment booked with ${session.selectedDoctor ?? "the selected doctor"}${session.preferredDate ? ` on ${session.preferredDate}` : ""}${session.preferredTime ? ` at ${session.preferredTime}` : ""}.`
    );
  } else if (outcome === "rescheduled") {
    summaryParts.push(
      `Appointment rescheduled with ${session.selectedDoctor ?? "the selected doctor"}${session.preferredDate ? ` on ${session.preferredDate}` : ""}${session.preferredTime ? ` at ${session.preferredTime}` : ""}.`
    );
  } else if (outcome === "cancelled") {
    summaryParts.push(`Appointment cancelled${session.selectedDoctor ? ` for ${session.selectedDoctor}` : ""}.`);
  } else if (outcome === "transferred") {
    summaryParts.push("Call transferred to the reception team.");
  } else if (session.bookingResult) {
    summaryParts.push(session.bookingResult.endsWith(".") ? session.bookingResult : `${session.bookingResult}.`);
  }

  if (session.patientName) {
    summaryParts.push(`Patient: ${session.patientName}.`);
  }

  if (latestTurn?.needsReview) {
    summaryParts.push("Needs review.");
  }

  return summaryParts.length > 0 ? summaryParts.join(" ") : null;
}

function resolveTranscriptIntent(
  aiIntent: string,
  aiIntents: string[] | null | undefined,
  intentLayer: HospitalIntentResult,
  inferenceResult: ReturnType<typeof inferCondition>,
  confidenceThreshold = 0.6
): string {
  const hasAiIntent = (intent: string) => aiIntent === intent || Boolean(aiIntents?.includes(intent));
  if (inferenceResult?.isEmergency) return "emergency";
  if (hasDetectedIntent(intentLayer, "HUMAN_ESCALATION", confidenceThreshold) || hasAiIntent("human_escalation")) return "human_escalation";
  if (hasDetectedIntent(intentLayer, "RESCHEDULE_APPOINTMENT", confidenceThreshold) || hasAiIntent("reschedule_appointment")) return "reschedule_appointment";
  if (hasDetectedIntent(intentLayer, "CANCEL_APPOINTMENT", confidenceThreshold) || hasAiIntent("cancel_appointment")) return "cancel_appointment";
  if (hasDetectedIntent(intentLayer, "CLINIC_INFO", 0.6) || hasAiIntent("clinic_info")) return "ask_clinic_info";
  if (hasDetectedIntent(intentLayer, "PAYMENT_BILLING", 0.6) || hasAiIntent("ask_doctor_fee")) return "ask_doctor_fee";
  if (hasDetectedIntent(intentLayer, "BOOK_APPOINTMENT", confidenceThreshold) || hasAiIntent("book_appointment") || inferenceResult) return "book_appointment";
  if (hasDetectedIntent(intentLayer, "GOODBYE", 0.6) || hasAiIntent("goodbye")) return "goodbye";
  return aiIntent || "unknown";
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
          analysisHistory: session.analysisHistory ?? [],
          analysisSummary: session.analysisSummary ?? summarizeCallSession(session),
          qualityTrace: session.qualityTrace ?? [],
          qualitySummary: session.qualitySummary ?? {
            score: 100,
            severity: "info",
            issueCount: 0,
            highIssueCount: 0,
            tags: [],
            updatedAt: null
          },
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
    const callerLanguage = detectIntentLanguage(input.transcript);
    // ADDED:
    let inferenceResult: ReturnType<typeof inferCondition> = null;
    // ADDED:
    try {
      // ADDED:
      inferenceResult = inferCondition(normalizedTranscript);
    // ADDED:
    } catch (_error) {
      // ADDED: silent fail
    }
    const clinicResponse = await fetchJson<{ data: ClinicSettings }>(`${input.doctorServiceUrl}/clinic-settings`);
    const runtimeConfigResponse = await fetchJson<{ data: RuntimeConfigResponse }>(`${input.doctorServiceUrl}/runtime-config`);
    const clinicSettings = clinicResponse?.data;
    const runtimeDoctors = runtimeConfigResponse?.data.doctors ?? FALLBACK_DOCTORS;
    const intelligence = resolveIntelligenceSettings(clinicSettings);
    const intentLayer = detectHospitalIntentLayer(normalizedTranscript, runtimeDoctors);
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
    const cancelIntentRequested = hasDetectedIntent(intentLayer, "CANCEL_APPOINTMENT", intelligence.confidenceThreshold) || matchCancelAppointmentIntent(normalizedTranscript);
    const cancelContinuationRequested = session.latestIntent === "cancel_appointment"
      && hasCancelLookupCue(normalizedTranscript, runtimeDoctors);
    // ADDED:
    if (
      inferenceResult
      && !inferenceResult.isEmergency
      && !cancelIntentRequested
      && !cancelContinuationRequested
      && !["confirming", "reschedule_confirming", "cancel_confirming", "booked", "cancelled"].includes(session.bookingStage)
    ) {
      // ADDED:
      session = updateSession(session, {
        // ADDED:
        selectedSpecialization: inferenceResult.specialization,
        selectedDoctor: session.selectedDoctor,
        doctorPreference: session.doctorPreference,
        bookingStage: session.preferredDate ? session.bookingStage : "waiting_for_doctor_preference"
      });
    }
    if (normalizedTranscript) {
      session = resetSilenceMemory(session);
    }
    if (!getConversationMemory(session).callerSeenBefore && validAniNumber(session.callerNumber)) {
      const callerSeenBefore = await hasUsedCallerNumberBefore(session.callerNumber, session.sessionId);
      session = rememberConversation(session, { callerSeenBefore });
    } else {
      session = rememberConversation(session);
    }

    const qualityBeforeSession = snapshotSession(session);
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
    // ADDED:
    } else if (hasDetectedIntent(intentLayer, "EMERGENCY", 0.8) || inferenceResult?.isEmergency === true) {
      // ADDED:
      reply = inferenceResult
        ? buildLocalizedInferenceReply(inferenceResult, clinicSettings, prompts)
        : clinicSettings?.emergencyMessage ?? FALLBACK_MESSAGES.emergency;
      // ADDED:
      action = "emergency_escalation";
      // ADDED:
      latestIntent = "emergency";
      // ADDED:
      stage = "fallback";
    // ADDED:
    } else if (inferenceResult) {
      // ADDED:
      reply = buildLocalizedInferenceReply(inferenceResult, clinicSettings, prompts);
      // ADDED:
      action = "symptom_triage_appointment";
      // ADDED:
      latestIntent = "book_appointment";
      // ADDED:
      stage = session.bookingStage;
    } else if (normalizedTranscript.includes("emergency")) {
      reply = clinicSettings?.emergencyMessage ?? FALLBACK_MESSAGES.emergency;
      action = "emergency_escalation";
      latestIntent = "emergency";
      stage = "fallback";
    } else if (hasDetectedIntent(intentLayer, "HUMAN_ESCALATION", intelligence.confidenceThreshold) || matchHumanTransferIntent(normalizedTranscript)) {
      const transferPrefix = prompts.transferMessage.replace("the configured clinic number", "").trim();
      reply = `${transferPrefix} ${clinicSettings?.transferNumber ?? "the configured clinic number"}.`.trim();
      action = "transfer_call";
      latestIntent = "human_escalation";
      stage = "fallback";
      session = updateSession(session, { callStatus: "transferred" });
    } else if (
      (cancelIntentRequested || cancelContinuationRequested)
      && !["confirming", "reschedule_confirming", "cancel_confirming"].includes(session.bookingStage)
    ) {
      const cancelSelection = selectActiveAppointmentForCancel(appointmentSnapshots, session.callerNumber, normalizedTranscript, runtimeDoctors);
      const existingBooking = cancelSelection.appointment;

      if (cancelSelection.matchedAppointments.length > 1 && !cancelSelection.requestedPatientName) {
        reply = buildCancelPatientNamePrompt(cancelSelection, prompts);
        stage = "cancel_confirming";
        action = "ask_cancel_patient_name";
        session = updateSession(session, {
          cancel_booking: null,
          cancel_lookup_doctor: cancelSelection.requestedDoctor,
          cancel_lookup_date: cancelSelection.requestedDate,
          cancel_lookup_time: cancelSelection.requestedTime
        });
      } else if (existingBooking) {
        session = updateSession(session, {
          ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
          cancel_booking: existingBooking,
          cancel_lookup_doctor: null,
          cancel_lookup_date: null,
          cancel_lookup_time: null
        });
        reply = buildCancelConfirmation(existingBooking, runtimeDoctors, prompts);
        stage = "cancel_confirming";
        action = "cancel_existing_booking_found";
      } else {
        session = updateSession(session, {
          cancel_lookup_doctor: cancelSelection.requestedDoctor ?? session.cancel_lookup_doctor ?? null,
          cancel_lookup_date: cancelSelection.requestedDate ?? session.cancel_lookup_date ?? null,
          cancel_lookup_time: cancelSelection.requestedTime ?? session.cancel_lookup_time ?? null
        });
        const hasCancelDetails = Boolean(
          cancelSelection.requestedPatientName
          || cancelSelection.requestedDoctor
          || cancelSelection.requestedDate
          || cancelSelection.requestedTime
        );
        reply = hasCancelDetails
          ? buildNoActiveAppointmentReply(cancelSelection, prompts.cancelNoActiveBooking, prompts)
          : prompts.cancelAskDetails;
        stage = "cancel_confirming";
        action = hasCancelDetails ? "cancel_no_active_booking" : "ask_cancel_details";
      }

      latestIntent = "cancel_appointment";
    } else if (
      (hasDetectedIntent(intentLayer, "RESCHEDULE_APPOINTMENT", intelligence.confidenceThreshold) || matchRescheduleIntent(normalizedTranscript))
      && ![
        "confirming",
        "reschedule_waiting_for_new_day",
        "reschedule_waiting_for_new_slot",
        "reschedule_confirming",
        "cancel_confirming"
      ].includes(session.bookingStage)
    ) {
      const rescheduleSelection = selectActiveAppointmentForCaller(appointmentSnapshots, session.callerNumber, normalizedTranscript, runtimeDoctors);
      const existingBooking = rescheduleSelection.appointment;

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
        reply = buildNoActiveAppointmentReply(rescheduleSelection, prompts.rescheduleNoActiveBooking, prompts);
        stage = "waiting_for_intent";
        action = "reschedule_no_active_booking";
      }

      latestIntent = "reschedule_appointment";
    } else if (
      hasDetectedIntent(intentLayer, "PAYMENT_BILLING", 0.6)
      && canAnswerGlobalInfoIntent(session.bookingStage)
    ) {
      const feeReply = buildDoctorFeeReply(normalizedTranscript, session, runtimeDoctors, clinicSettings, prompts);
      reply = feeReply.reply;
      action = feeReply.action;
      stage = session.bookingStage === "greeting" ? "waiting_for_intent" : session.bookingStage;
      latestIntent = "ask_doctor_fee";
    } else if (
      hasDetectedIntent(intentLayer, "CLINIC_INFO", 0.6)
      && canAnswerGlobalInfoIntent(session.bookingStage)
    ) {
      const infoReply = buildClinicInfoReply(normalizedTranscript, clinicSettings, session, runtimeDoctors, prompts);
      reply = infoReply.reply;
      action = infoReply.action;
      stage = session.bookingStage === "greeting" ? "waiting_for_intent" : session.bookingStage;
      latestIntent = "ask_clinic_info";
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
            if (cancelIntentRequested || cancelContinuationRequested) {
              const cancelSelection = selectActiveAppointmentForCancel(appointmentSnapshots, session.callerNumber, normalizedTranscript, runtimeDoctors);
              const existingBooking = cancelSelection.appointment;

              if (cancelSelection.matchedAppointments.length > 1 && !cancelSelection.requestedPatientName) {
                reply = buildCancelPatientNamePrompt(cancelSelection, prompts);
                stage = "cancel_confirming";
                action = "ask_cancel_patient_name";
                session = updateSession(session, {
                  cancel_booking: null,
                  cancel_lookup_doctor: cancelSelection.requestedDoctor,
                  cancel_lookup_date: cancelSelection.requestedDate,
                  cancel_lookup_time: cancelSelection.requestedTime
                });
              } else if (existingBooking) {
                session = updateSession(session, {
                  ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
                  cancel_booking: existingBooking,
                  cancel_lookup_doctor: null,
                  cancel_lookup_date: null,
                  cancel_lookup_time: null
                });
                reply = buildCancelConfirmation(existingBooking, runtimeDoctors, prompts);
                stage = "cancel_confirming";
                action = "cancel_existing_booking_found";
              } else {
                session = updateSession(session, {
                  cancel_lookup_doctor: cancelSelection.requestedDoctor ?? session.cancel_lookup_doctor ?? null,
                  cancel_lookup_date: cancelSelection.requestedDate ?? session.cancel_lookup_date ?? null,
                  cancel_lookup_time: cancelSelection.requestedTime ?? session.cancel_lookup_time ?? null
                });
                reply = buildNoActiveAppointmentReply(cancelSelection, prompts.cancelNoActiveBooking, prompts);
                stage = cancelSelection.requestedPatientName || cancelSelection.requestedDoctor || cancelSelection.requestedDate || cancelSelection.requestedTime
                  ? "cancel_confirming"
                  : "waiting_for_intent";
                action = "cancel_no_active_booking";
              }

              latestIntent = "cancel_appointment";
              break;
            }

            if (hasDetectedIntent(intentLayer, "RESCHEDULE_APPOINTMENT", intelligence.confidenceThreshold) || matchRescheduleIntent(normalizedTranscript)) {
              const rescheduleSelection = selectActiveAppointmentForCaller(appointmentSnapshots, session.callerNumber, normalizedTranscript, runtimeDoctors);
              const existingBooking = rescheduleSelection.appointment;

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
                reply = buildNoActiveAppointmentReply(rescheduleSelection, prompts.rescheduleNoActiveBooking, prompts);
                stage = "waiting_for_intent";
                action = "reschedule_no_active_booking";
              }

              latestIntent = "reschedule_appointment";
              break;
            }

            const ambiguousDoctorMatches = mapAmbiguousDoctorPreference(normalizedTranscript, runtimeDoctors);
            const directDoctor = mapDoctorPreference(normalizedTranscript, session, runtimeDoctors);
            const specialization = mapSpecialization(normalizedTranscript, runtimeDoctors);

            if (asksDoctorList(normalizedTranscript) || hasDetectedIntent(intentLayer, "DOCTOR_INFO", 0.6)) {
              reply = buildAvailableDoctorsReply(runtimeDoctors, prompts);
              stage = "waiting_for_specialization";
              action = "share_available_doctors";
              latestIntent = "book_appointment";
            } else if (ambiguousDoctorMatches.length > 0) {
              reply = buildDoctorDisambiguationPrompt(ambiguousDoctorMatches, prompts);
              stage = "waiting_for_doctor_preference";
              action = "clarify_doctor_preference";
              latestIntent = "book_appointment";
            } else if (directDoctor) {
              const selectedDoctor = runtimeDoctors.find((doctor) => doctor.name === directDoctor.selectedDoctor) ?? null;
              session = updateSession(session, {
                selectedSpecialization: selectedDoctor?.specialization ?? session.selectedSpecialization,
                selectedDoctor: directDoctor.selectedDoctor,
                doctorPreference: directDoctor.doctorPreference
              });
              const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
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
              const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
              if (next) {
                session = next.session;
                reply = next.reply;
                stage = next.stage;
                action = next.action === "ready_for_confirmation" ? "capture_specialization_ready" : "capture_specialization";
              } else {
                reply = buildDoctorPreferenceSelectionPrompt(session, runtimeDoctors, prompts);
                stage = "waiting_for_doctor_preference";
                action = "capture_specialization";
              }
              latestIntent = "book_appointment";
            } else if (
              hasDetectedIntent(intentLayer, "BOOK_APPOINTMENT", 0.6)
              || hasDetectedIntent(intentLayer, "CHECK_AVAILABILITY", 0.6)
              || matchIntentStart(normalizedTranscript)
            ) {
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
            if (next) {
              session = next.session;
              reply = next.reply;
              stage = next.stage;
              action = next.action === "ready_for_confirmation" ? "capture_booking_intent_ready" : "capture_booking_intent";
            } else {
              reply = buildDoctorPreferenceSelectionPrompt(session, runtimeDoctors, prompts);
              stage = "waiting_for_doctor_preference";
              action = "capture_booking_intent";
            }
            latestIntent = "book_appointment";
          } else if (intelligence.enabled && (session.selectedDoctor || session.selectedSpecialization || session.preferredDate || session.preferredTime)) {
            const next = askNextMissingField(session, runtimeDoctors, prompts, intelligence);
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
          const ambiguousDoctorMatches = mapAmbiguousDoctorPreference(normalizedTranscript, runtimeDoctors);
          const directDoctor = mapDoctorPreference(normalizedTranscript, session, runtimeDoctors);
          const specialization = mapSpecialization(normalizedTranscript, runtimeDoctors);

          if (asksDoctorList(normalizedTranscript) || hasDetectedIntent(intentLayer, "DOCTOR_INFO", 0.6)) {
            reply = buildAvailableDoctorsReply(runtimeDoctors, prompts);
            action = "share_available_doctors";
          } else if (ambiguousDoctorMatches.length > 0) {
            reply = buildDoctorDisambiguationPrompt(ambiguousDoctorMatches, prompts);
            stage = "waiting_for_doctor_preference";
            action = "clarify_doctor_preference";
          } else if (directDoctor) {
            const selectedDoctor = runtimeDoctors.find((doctor) => doctor.name === directDoctor.selectedDoctor) ?? null;
            session = updateSession(session, {
              selectedSpecialization: selectedDoctor?.specialization ?? session.selectedSpecialization,
              selectedDoctor: directDoctor.selectedDoctor,
              doctorPreference: directDoctor.doctorPreference
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? withExtraInstructions(prompts.askDate, prompts);
            stage = next?.stage ?? "waiting_for_date";
            action = "capture_doctor_preference";
          } else if (specialization) {
            session = updateSession(session, {
              selectedSpecialization: specialization.specialization
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? buildDoctorPreferenceSelectionPrompt(session, runtimeDoctors, prompts);
            stage = next?.stage ?? "waiting_for_doctor_preference";
            action = "capture_specialization";
          } else if (session.selectedDoctor || session.selectedSpecialization) {
            const next = askNextMissingField(session, runtimeDoctors, prompts, intelligence);
            session = next.session;
            reply = next.reply;
            stage = next.stage;
            action = "continue_booking_after_smart_capture";
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
          const specialization = acceptedRememberedDoctor ? null : mapSpecialization(normalizedTranscript, runtimeDoctors);
          const ambiguousDoctorMatches = acceptedRememberedDoctor ? [] : mapAmbiguousDoctorPreference(normalizedTranscript, runtimeDoctors);
          const preference = acceptedRememberedDoctor
            ? {
                doctorPreference: "specific_doctor",
                selectedDoctor: rememberedDoctor,
                doctorId: runtimeDoctors.find((doctor) => doctor.name === rememberedDoctor)?.doctorId ?? null
              }
            : mapDoctorPreference(normalizedTranscript, session, runtimeDoctors);

          if (ambiguousDoctorMatches.length > 0) {
            reply = buildDoctorDisambiguationPrompt(ambiguousDoctorMatches, prompts);
            stage = "waiting_for_doctor_preference";
            action = "clarify_doctor_preference";
          } else if (specialization) {
            const matchingDoctors = runtimeDoctors.filter((runtimeDoctor) => runtimeDoctor.specialization === specialization.specialization);
            const resolvedDoctor = matchingDoctors.length === 1 ? matchingDoctors[0] : null;
            session = updateSession(session, {
              selectedSpecialization: specialization.specialization,
              doctorPreference: resolvedDoctor ? "specific_doctor" : session.doctorPreference,
              selectedDoctor: resolvedDoctor?.name ?? session.selectedDoctor
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? buildDoctorPreferenceSelectionPrompt(session, runtimeDoctors, prompts);
            stage = next?.stage ?? "waiting_for_doctor_preference";
            action = "capture_specialization_from_doctor_preference";
          } else if (preference) {
            session = updateSession(session, {
              doctorPreference: preference.doctorPreference,
              selectedDoctor: preference.selectedDoctor
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
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
          const ambiguousDoctorMatches = mapAmbiguousDoctorPreference(normalizedTranscript, runtimeDoctors);
          const directDoctor = mapDoctorPreference(normalizedTranscript, session, runtimeDoctors);
          const specialization = mapSpecialization(normalizedTranscript, runtimeDoctors);
          const acceptedOffer = session.availabilityOfferedDate && mapYesNo(normalizedTranscript) === "yes";
          const rejectedOfferForAnotherDay = !!session.availabilityOfferedDate && wantsAnotherDay(normalizedTranscript);
          const offeredSlotSelection = session.availabilityOfferedDate
            ? matchOfferedSlot(normalizedTranscript, session.availabilityOfferedSlots)
            : null;
          const acceptedRememberedDay = !acceptedOffer && getConversationMemory(session).lastDay && mapYesNo(normalizedTranscript) === "yes";
          const date = acceptedOffer
            ? session.availabilityOfferedDate
            : acceptedRememberedDay
              ? getConversationMemory(session).lastDay
              : mapDateFlexible(normalizedTranscript);

          if (asksDoctorList(normalizedTranscript) || hasDetectedIntent(intentLayer, "DOCTOR_INFO", 0.6)) {
            reply = buildAvailableDoctorsReply(runtimeDoctors, prompts);
            stage = "waiting_for_doctor_preference";
            action = "share_available_doctors_during_date";
          } else if (ambiguousDoctorMatches.length > 0) {
            reply = buildDoctorDisambiguationPrompt(ambiguousDoctorMatches, prompts);
            stage = "waiting_for_doctor_preference";
            action = "clarify_doctor_preference_during_date";
          } else if (directDoctor && directDoctor.doctorPreference === "specific_doctor" && directDoctor.selectedDoctor !== session.selectedDoctor) {
            const selectedDoctor = runtimeDoctors.find((doctor) => doctor.name === directDoctor.selectedDoctor) ?? null;
            session = updateSession(session, {
              selectedSpecialization: selectedDoctor?.specialization ?? session.selectedSpecialization,
              selectedDoctor: directDoctor.selectedDoctor,
              doctorPreference: directDoctor.doctorPreference
            });

            if (date) {
              session = updateSession(session, {
                preferredDate: date,
                preferredTime: acceptedOffer ? session.availabilityOfferedTime ?? session.preferredTime : session.preferredTime,
                availabilityOfferedDate: acceptedOffer ? null : session.availabilityOfferedDate,
                availabilityOfferedTime: acceptedOffer ? null : session.availabilityOfferedTime,
                availabilityOfferedSlots: acceptedOffer ? [] : session.availabilityOfferedSlots
              });
              const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
              session = next?.session ?? session;
              reply = next?.reply ?? withExtraInstructions(prompts.askTime, prompts);
              stage = next?.stage ?? "waiting_for_time";
              action = "capture_doctor_and_date";
            } else {
              reply = withExtraInstructions(prompts.askDate, prompts);
              stage = "waiting_for_date";
              action = "capture_doctor_preference_during_date";
            }
          } else if (specialization && specialization.specialization !== session.selectedSpecialization) {
            session = updateSession(session, {
              selectedSpecialization: specialization.specialization,
              selectedDoctor: null,
              doctorPreference: null
            });
            reply = buildDoctorPreferenceSelectionPrompt(session, runtimeDoctors, prompts);
            stage = "waiting_for_doctor_preference";
            action = "capture_specialization_during_date";
          } else if (rejectedOfferForAnotherDay && !date) {
            session = updateSession(session, {
              preferredDate: null,
              preferredTime: null,
              availabilityOfferedDate: null,
              availabilityOfferedTime: null,
              availabilityOfferedSlots: []
            });
            reply = withExtraInstructions(prompts.askDate, prompts);
            stage = "waiting_for_date";
            action = "ask_new_date_after_rejecting_offer";
          } else if (session.availabilityOfferedDate && offeredSlotSelection) {
            session = updateSession(session, {
              preferredDate: session.availabilityOfferedDate,
              preferredTime: offeredSlotSelection,
              availabilityOfferedDate: null,
              availabilityOfferedTime: null,
              availabilityOfferedSlots: []
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? withExtraInstructions(prompts.askPatientName, prompts);
            stage = next?.stage ?? "waiting_for_patient_name";
            action = "capture_offered_date_and_time";
          } else if (date) {
            session = updateSession(session, {
              preferredDate: date,
              preferredTime: acceptedOffer ? session.availabilityOfferedTime ?? session.preferredTime : session.preferredTime,
              availabilityOfferedDate: acceptedOffer ? null : session.availabilityOfferedDate,
              availabilityOfferedTime: acceptedOffer ? null : session.availabilityOfferedTime,
              availabilityOfferedSlots: acceptedOffer ? [] : session.availabilityOfferedSlots
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
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
              preferredDate: acceptedOffer ? session.availabilityOfferedDate ?? session.preferredDate : session.preferredDate,
              preferredTime: time,
              availabilityOfferedDate: acceptedOffer ? null : session.availabilityOfferedDate,
              availabilityOfferedTime: acceptedOffer ? null : session.availabilityOfferedTime,
              availabilityOfferedSlots: acceptedOffer ? [] : session.availabilityOfferedSlots
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
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
          const slotCorrection = resolveBookingSlotCorrection(session, normalizedTranscript, runtimeDoctors, appointmentSnapshots, prompts, intelligence);

          if (slotCorrection) {
            session = slotCorrection.session;
            reply = slotCorrection.reply;
            stage = slotCorrection.stage;
            action = slotCorrection.action;
            break;
          }

          const patientName = extractPatientName(input.transcript);

          if (patientName) {
            session = updateSession(session, { patientName });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
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
          const reusableNumber = normalizePhoneLast10(session.pendingContactNumber ?? session.contactNumber ?? ani);

          if (!session.bookingContactConfirmationPending && callerRequestsExistingNumber(normalizedTranscript) && reusableNumber) {
            session = updateSession(session, {
              pendingContactNumber: reusableNumber,
              partialMobileDigits: null,
              bookingContactConfirmed: false,
              bookingContactConfirmationPending: true
            });
            reply = buildPhoneReadbackConfirmation(reusableNumber, prompts);
            stage = "waiting_for_mobile";
            action = "ask_confirm_existing_number";
            break;
          }

          if (!session.bookingContactConfirmationPending && callerRequestsExistingNumber(normalizedTranscript) && !reusableNumber) {
            reply = isGujaratiPromptSet(prompts)
              ? "સિસ્ટમમાં નંબર મળ્યો નથી. મોબાઇલ નંબર ધીરે ધીરે કહો."
              : "System mein number mila nahi. Mobile number dheere dheere batayein.";
            stage = "waiting_for_mobile";
            action = "ask_mobile_number_missing_existing";
            break;
          }

          if (yesNo === "yes" && reusableNumber) {
            session = updateSession(session, {
              contactNumber: reusableNumber,
              pendingContactNumber: null,
              partialMobileDigits: null,
              bookingContactConfirmed: true,
              bookingContactConfirmationPending: false
            });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
            session = next?.session ?? session;
            reply = next?.reply ?? withExtraInstructions(prompts.askPatientType, prompts);
            stage = next?.stage ?? "waiting_for_patient_type";
            action = "confirm_caller_number";
            break;
          }

          if (yesNo === "no") {
            session = updateSession(session, {
              contactNumber: null,
              pendingContactNumber: null,
              partialMobileDigits: null,
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
              pendingContactNumber: mobile,
              contactNumber: null,
              partialMobileDigits: null,
              bookingContactConfirmed: false,
              bookingContactConfirmationPending: true
            });
            reply = buildPhoneReadbackConfirmation(mobile, prompts);
            stage = "waiting_for_mobile";
            action = "capture_mobile_readback";
          } else {
            const partialMobile = resolvePartialMobile(input.transcript, session, prompts);

            if (partialMobile && "mobile" in partialMobile) {
              session = updateSession(session, {
                pendingContactNumber: partialMobile.mobile,
                contactNumber: null,
                partialMobileDigits: null,
                bookingContactConfirmed: false,
                bookingContactConfirmationPending: true
              });
              reply = buildPhoneReadbackConfirmation(partialMobile.mobile, prompts);
              stage = "waiting_for_mobile";
              action = "capture_mobile_partial_readback";
            } else if (partialMobile) {
              session = updateSession(session, {
                partialMobileDigits: partialMobile.partialMobileDigits,
                pendingContactNumber: null,
                bookingContactConfirmed: false,
                bookingContactConfirmationPending: false
              });
              reply = partialMobile.reply;
              stage = "waiting_for_mobile";
              action = "capture_partial_mobile";
            } else {
              reply = buildRecoveryPrompt("waiting_for_mobile", session, prompts);
              action = "reprompt_mobile";
            }
          }
          break;
        }

        case "waiting_for_patient_type": {
          const patientType = mapPatientType(normalizedTranscript);

          if (patientType) {
            session = updateSession(session, { patientType });
            const next = intelligence.askOnlyMissingFields ? askNextMissingField(session, runtimeDoctors, prompts, intelligence) : null;
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
            reply = buildDoctorPreferenceSelectionPrompt(session, runtimeDoctors, prompts);
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
            if (!isAbsoluteIsoDate(session.preferredDate)) {
              reply = withExtraInstructions(prompts.askDate, prompts);
              stage = "waiting_for_date";
              action = "reask_missing_absolute_date";
              break;
            }

            if (!normalizePhoneLast10(session.contactNumber)) {
              reply = withExtraInstructions(prompts.askMobile, prompts);
              stage = "waiting_for_mobile";
              action = "reask_missing_valid_mobile";
              break;
            }

            if (!session.patientName?.trim()) {
              reply = withExtraInstructions(prompts.askPatientName, prompts);
              stage = "waiting_for_patient_name";
              action = "reask_missing_patient_name";
              break;
            }

            const selectedDoctor = runtimeDoctors.find((doctor) => doctor.name === session.selectedDoctor) ?? null;
            const appointmentResponse = await fetchJson<{ data: { id?: string; appointmentId?: string } }>(`${input.appointmentServiceUrl}/appointments`, {
              method: "POST",
              headers: {
              "Content-Type": "application/json"
              },
              body: JSON.stringify({
                patientName: session.patientName ?? "Demo Patient",
                phoneNumber: normalizePhoneLast10(session.contactNumber) ?? "0000000000",
                appointmentDate: `${session.preferredDate} ${session.preferredTime ?? "morning"}`,
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
              reschedule_new_day: normalizeResolvedDateValue(resolution.offeredDate) ?? requestedDay,
              reschedule_available_slots: resolution.offeredSlots,
              reschedule_confirmed_slot: null
            });
            reply = formatAvailabilityReplyForPrompt(resolution.reply, prompts);
            stage = "reschedule_waiting_for_new_day";
            action = "reschedule_day_unavailable";
            break;
          }

          session = updateSession(session, {
            ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
            reschedule_existing: existingBooking,
            reschedule_new_day: normalizeResolvedDateValue(resolution.selectedDate) ?? requestedDay,
            reschedule_available_slots: resolution.offeredSlots,
            reschedule_confirmed_slot: null
          });
          reply = renderPrompt(prompts.rescheduleSlotsAvailable, {
            availabilityReply: formatAvailabilityReplyForPrompt(resolution.reply, prompts),
            slotChoices: slotChoiceText(resolution.offeredSlots, prompts)
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
              const resolvedDay = normalizeResolvedDateValue(resolution.selectedDate) ?? session.reschedule_new_day;
              session = updateSession(session, {
                ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
                reschedule_existing: existingBooking,
                reschedule_new_day: resolvedDay,
                reschedule_available_slots: resolution.offeredSlots.length ? resolution.offeredSlots : [resolvedSlot],
                preferredDate: resolvedDay,
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
                reschedule_new_day: normalizeResolvedDateValue(resolution.offeredDate) ?? session.reschedule_new_day,
                reschedule_available_slots: resolution.offeredSlots,
                reschedule_confirmed_slot: null,
                preferredDate: null,
                preferredTime: null
              });
              reply = formatAvailabilityReplyForPrompt(resolution.reply, prompts);
              stage = resolution.offeredSlots.length ? "reschedule_waiting_for_new_slot" : "reschedule_waiting_for_new_day";
              action = resolution.status === "time_full" ? "reschedule_requested_time_unavailable" : "reschedule_requested_day_unavailable";
              break;
            }

            reply = renderPrompt(prompts.rescheduleAskSlot, {
              slotChoices: slotChoiceText(session.reschedule_available_slots, prompts)
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
          const slotCorrection = confirmation === "confirm" || confirmation === "cancel"
            ? null
            : resolveRescheduleSlotCorrection(session, normalizedTranscript, existingBooking, runtimeDoctors, appointmentSnapshots, prompts);

          latestIntent = "reschedule_appointment";

          if (slotCorrection) {
            session = slotCorrection.session;
            reply = slotCorrection.reply;
            stage = slotCorrection.stage;
            action = slotCorrection.action;
            break;
          }

          if (confirmation === "change_time") {
            reply = renderPrompt(prompts.rescheduleAskSlot, {
              slotChoices: slotChoiceText(session.reschedule_available_slots, prompts)
            });
            stage = "reschedule_waiting_for_new_slot";
            action = "reschedule_change_slot";
            break;
          }

          if (confirmation === "change_doctor" || confirmation === "cancel" || mapYesNo(normalizedTranscript) === "no") {
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

          if (!appointmentId || !isAbsoluteIsoDate(session.reschedule_new_day) || !session.reschedule_confirmed_slot?.time) {
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
          const yesNo = mapYesNo(normalizedTranscript);
          let existingBooking = session.cancel_booking ?? findLatestActiveAppointmentForCaller(appointmentSnapshots, session.callerNumber);
          const plainConfirmation = confirmation === "confirm" || yesNo === "yes";
          const cancelLookupTranscript = [
            normalizedTranscript,
            session.cancel_lookup_doctor,
            session.cancel_lookup_date,
            session.cancel_lookup_time
          ].filter(Boolean).join(" ");
          const liveCancelSelection = selectActiveAppointmentForCancel(appointmentSnapshots, session.callerNumber, cancelLookupTranscript, runtimeDoctors);
          const hasLiveCancelCue = Boolean(
            liveCancelSelection.requestedDoctor
            || liveCancelSelection.requestedPatientName
            || liveCancelSelection.requestedDate
            || liveCancelSelection.requestedTime
          );
          const cancelSelection = plainConfirmation && !hasLiveCancelCue
            ? {
                appointment: existingBooking,
                matchedAppointments: existingBooking ? [existingBooking] : [],
                requestedDoctor: null,
                requestedPatientName: null,
                requestedDate: null,
                requestedTime: null
              }
            : liveCancelSelection;
          const hasCancelTargetCue = Boolean(cancelSelection.requestedDoctor || cancelSelection.requestedPatientName || cancelSelection.requestedDate || cancelSelection.requestedTime);
          const confirmsCancellation = plainConfirmation || (confirmation === "cancel" && !hasCancelTargetCue);

          if (hasCancelTargetCue && cancelSelection.matchedAppointments.length > 1 && !cancelSelection.requestedPatientName) {
            reply = buildCancelPatientNamePrompt(cancelSelection, prompts);
            stage = "cancel_confirming";
            action = "ask_cancel_patient_name";
            session = updateSession(session, {
              cancel_lookup_doctor: cancelSelection.requestedDoctor,
              cancel_lookup_date: cancelSelection.requestedDate,
              cancel_lookup_time: cancelSelection.requestedTime,
              cancel_booking: null
            });
            break;
          }

          if (hasCancelTargetCue) {
            existingBooking = cancelSelection.appointment;

            if (existingBooking) {
              session = updateSession(session, {
                ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
                cancel_booking: existingBooking,
                cancel_lookup_doctor: null,
                cancel_lookup_date: null,
                cancel_lookup_time: null
              });
            }
          }
          const appointmentId = appointmentIdOf(existingBooking);

          latestIntent = "cancel_appointment";

          if (hasCancelTargetCue && !existingBooking) {
            reply = buildNoActiveAppointmentReply(cancelSelection, prompts.cancelNoActiveBooking, prompts);
            stage = "cancel_confirming";
            action = "cancel_specific_booking_not_found";
            session = updateSession(session, {
              cancel_lookup_doctor: cancelSelection.requestedDoctor ?? session.cancel_lookup_doctor ?? null,
              cancel_lookup_date: cancelSelection.requestedDate ?? session.cancel_lookup_date ?? null,
              cancel_lookup_time: cancelSelection.requestedTime ?? session.cancel_lookup_time ?? null
            });
            break;
          }

          if (hasCancelTargetCue && existingBooking) {
            reply = buildCancelConfirmation(existingBooking, runtimeDoctors, prompts);
            stage = "cancel_confirming";
            action = "reprompt_cancel_confirmation";
            break;
          }

          if (yesNo === "no") {
            reply = prompts.cancelDeclined;
            stage = "waiting_for_intent";
            action = "cancel_declined";
            session = updateSession(session, {
              cancel_booking: null,
              cancel_lookup_doctor: null,
              cancel_lookup_date: null,
              cancel_lookup_time: null
            });
            break;
          }

          if (!confirmsCancellation) {
            reply = existingBooking
              ? buildCancelConfirmation(existingBooking, runtimeDoctors, prompts)
              : prompts.cancelAskDetails;
            stage = "cancel_confirming";
            action = existingBooking ? "reprompt_cancel_confirmation" : "ask_cancel_details";
            break;
          }

          if (!appointmentId) {
            reply = prompts.cancelAskDetails;
            stage = "cancel_confirming";
            action = "ask_cancel_details";
            session = updateSession(session, {
              cancel_lookup_doctor: null,
              cancel_lookup_date: null,
              cancel_lookup_time: null
            });
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
            appointment: buildAppointmentSpeechWithPatient(existingBooking!, runtimeDoctors, prompts),
            reference: appointmentId.slice(-4).toUpperCase()
          });
          stage = "cancelled";
          action = "cancel_existing_booking";
          session = updateSession(session, {
            ...appointmentSessionFields(existingBooking, runtimeDoctors, session),
            cancel_booking: existingBooking,
            cancel_lookup_doctor: null,
            cancel_lookup_date: null,
            cancel_lookup_time: null,
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
        session = updateSession(session, { callStatus: "transferred" });
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

    if (
      (hasEndConversationIntent(normalizedTranscript) || hasDetectedIntent(intentLayer, "GOODBYE", 0.6))
      && !["confirming", "reschedule_confirming", "cancel_confirming"].includes(stage)
    ) {
      reply = prompts.goodbyeMessage;
      action = "caller_goodbye";
      stage = "fallback";
      session = updateSession(session, { callStatus: "completed" });
    }

    if (shouldUseSemanticLlmFallback(action, intelligence)) {
      const semanticFallback = await applySemanticFallbackReply(
        input.transcript,
        { ...session, bookingStage: stage, latestIntent },
        clinicSettings,
        prompts,
        runtimeDoctors,
        reply,
        callerLanguage
      );
      reply = semanticFallback.reply;
      if (semanticFallback.intent !== "UNKNOWN") {
        latestIntent = semanticFallback.intent;
      }
      action = semanticFallback.action;
      session = appendLlmUsage(session, clinicSettings?.llmProviders, input.transcript, reply);
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
      session = appendLlmUsage(session, llmConfig, normalizedTranscript, reply);
    }

    reply = normalizeReplyForSpeech(reply, prompts);

    session = updateSession(session, {
      bookingStage: stage,
      latestIntent,
      botResponseHistory: [...session.botResponseHistory, createHistoryEntry("bot", reply)],
      transcriptHistory: [...session.transcriptHistory, createHistoryEntry("bot", reply)]
    });

    session = updateSession(session, appendCallQualityTrace({
      before: qualityBeforeSession,
      after: session,
      callerText: input.transcript,
      botReply: reply,
      action,
      intent: latestIntent
    }));

    session = updateSession(session, {
      analysisHistory: [...(session.analysisHistory ?? []), resolveTurnAnalysis(session, {
        transcript: input.transcript,
        detectedIntent: latestIntent,
        confidence: resolveTurnConfidence(null, intentLayer.confidence, inferenceResult?.confidence ?? null),
        inferenceResult,
        intentLayer,
        qualitySummary: session.qualitySummary,
        stage,
        action
      })]
    });
    session = updateSession(session, {
      analysisSummary: summarizeCallSession(session)
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
    const normalizedTranscript = normalizeTranscript(input.transcript);
    const callerLanguage = detectIntentLanguage(input.transcript);
    let inferenceResult: ReturnType<typeof inferCondition> = null;
    try {
      inferenceResult = inferCondition(normalizedTranscript);
    } catch (_error) {
      inferenceResult = null;
    }

    const [intentResponse, clinicResponse, runtimeConfigResponse, appointmentResponse] = await Promise.all([
      fetchJson<{ data: DetectIntentResult }>(`${input.aiServiceUrl}/detect-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: input.transcript })
      }),
      fetchJson<{ data: ClinicSettings }>(`${input.doctorServiceUrl}/clinic-settings`),
      fetchJson<{ data: RuntimeConfigResponse }>(`${input.doctorServiceUrl}/runtime-config`),
      fetchJson<{ data: AppointmentSnapshot[] }>(`${input.appointmentServiceUrl}/appointments`)
    ]);

    const aiIntent = intentResponse?.data.intent ?? "unknown";
    const aiIntents = Array.isArray(intentResponse?.data.intents) ? intentResponse?.data.intents : [];
    const aiConfidence = intentResponse?.data.confidence ?? null;
    const clinicSettings = clinicResponse?.data;
    const runtimeDoctors = runtimeConfigResponse?.data.doctors ?? FALLBACK_DOCTORS;
    const appointmentSnapshots = Array.isArray(appointmentResponse?.data) ? appointmentResponse.data : [];
    const intelligence = resolveIntelligenceSettings(clinicSettings);
    const intentLayer = detectHospitalIntentLayer(normalizedTranscript, runtimeDoctors);
    const prompts = resolveConversationPrompts(clinicSettings, runtimeDoctors, this.repository.getSession(input.sessionId) ?? createNewSession(input.sessionId, input.callerNumber));

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

    if (
      inferenceResult
      && !inferenceResult.isEmergency
      && !["confirming", "reschedule_confirming", "cancel_confirming", "booked", "cancelled"].includes(session.bookingStage)
    ) {
      session = updateSession(session, {
        selectedSpecialization: inferenceResult.specialization,
        selectedDoctor: session.selectedDoctor,
        doctorPreference: session.doctorPreference,
        bookingStage: session.preferredDate ? session.bookingStage : "waiting_for_doctor_preference"
      });
    }

    const qualityBeforeSession = snapshotSession(session);
    const resolvedIntent = resolveTranscriptIntent(aiIntent, aiIntents, intentLayer, inferenceResult, intelligence.confidenceThreshold);

    let reply = "I am sorry, I could not understand that yet.";
    let action = "clarify";
    let stage: BookingStage = session.bookingStage;
    let latestIntent = resolvedIntent;

    if (!normalizedTranscript) {
      reply = prompts.silenceRetryGeneric;
      action = "silence_retry";
      stage = session.bookingStage;
    } else if (resolvedIntent === "emergency") {
      reply = inferenceResult
        ? buildLocalizedInferenceReply(inferenceResult, clinicSettings, prompts)
        : clinicSettings?.emergencyMessage ?? FALLBACK_MESSAGES.emergency;
      action = "emergency_escalation";
      stage = "fallback";
    } else if (resolvedIntent === "human_escalation") {
      const transferPrefix = prompts.transferMessage.replace("the configured clinic number", "").trim();
      reply = `${transferPrefix} ${clinicSettings?.transferNumber ?? "the configured clinic number"}.`.trim();
      action = "transfer_call";
      stage = "fallback";
      latestIntent = "human_escalation";
      session = updateSession(session, { callStatus: "transferred" });
    } else if (resolvedIntent === "ask_clinic_info") {
      reply = `The consultation fee is ${clinicSettings?.consultationFee ?? "configured in admin"} and clinic timings are ${clinicSettings?.clinicTimings ?? "available at the clinic desk"}.`;
      action = "share_clinic_info";
      stage = session.bookingStage === "greeting" ? "waiting_for_intent" : session.bookingStage;
    } else if (resolvedIntent === "ask_doctor_fee") {
      reply = `The consultation fee is ${clinicSettings?.consultationFee ?? "configured in admin"}.`;
      action = "share_doctor_fee";
      stage = session.bookingStage === "greeting" ? "waiting_for_intent" : session.bookingStage;
    } else if (resolvedIntent === "reschedule_appointment") {
      reply = DEFAULT_PROMPTS.askDate;
      action = "create_reschedule_request";
      stage = "reschedule_waiting_for_new_day";
    } else if (resolvedIntent === "cancel_appointment") {
      reply = DEFAULT_PROMPTS.confirmPrefix;
      action = "create_cancel_request";
      stage = "cancel_confirming";
    } else if (resolvedIntent === "book_appointment") {
      reply = inferenceResult
        ? buildLocalizedInferenceReply(inferenceResult, clinicSettings, prompts)
        : DEFAULT_PROMPTS.askSpecialization;
      action = inferenceResult ? "symptom_triage_appointment" : "create_appointment_request";
      stage = session.bookingStage === "greeting" ? "waiting_for_intent" : session.bookingStage;
      latestIntent = "book_appointment";
    } else if (aiIntent === "book_appointment" || aiIntent === "unknown") {
      reply = DEFAULT_PROMPTS.askSpecialization;
      action = "create_appointment_request";
      latestIntent = "book_appointment";
      stage = "waiting_for_specialization";
    }

    if (shouldUseSemanticLlmFallback(action, intelligence)) {
      const semanticFallback = await applySemanticFallbackReply(
        input.transcript,
        { ...session, bookingStage: stage, latestIntent },
        clinicSettings,
        prompts,
        runtimeDoctors,
        reply,
        callerLanguage
      );
      reply = semanticFallback.reply;
      if (semanticFallback.intent !== "UNKNOWN") {
        latestIntent = semanticFallback.intent;
      }
      action = semanticFallback.action;
      session = appendLlmUsage(session, clinicSettings?.llmProviders, input.transcript, reply);
    }

    reply = normalizeReplyForSpeech(reply, prompts);

    const updatedSession = updateSession(session, {
      bookingStage: stage,
      latestIntent,
      transcriptHistory: [...session.transcriptHistory, createHistoryEntry("bot", reply)],
      botResponseHistory: [...session.botResponseHistory, createHistoryEntry("bot", reply)]
    });
    const qualitySession = updateSession(updatedSession, appendCallQualityTrace({
      before: qualityBeforeSession,
      after: updatedSession,
      callerText: input.transcript,
      botReply: reply,
      action,
      intent: latestIntent
    }));
    const analysisSession = updateSession(qualitySession, {
      analysisHistory: [...(qualitySession.analysisHistory ?? []), resolveTurnAnalysis(qualitySession, {
        transcript: input.transcript,
        detectedIntent: latestIntent,
        confidence: resolveTurnConfidence(aiConfidence, intentLayer.confidence, inferenceResult?.confidence ?? null),
        inferenceResult,
        intentLayer,
        qualitySummary: qualitySession.qualitySummary,
        stage,
        action
      })]
    });
    const summarizedSession = updateSession(analysisSession, {
      analysisSummary: summarizeCallSession(analysisSession)
    });
    this.repository.saveSession(summarizedSession);
    void syncSessionToDb(summarizedSession);

    return {
      sessionId: summarizedSession.sessionId,
      transcript: input.transcript,
      intent: latestIntent,
      action,
      reply,
      stage: summarizedSession.bookingStage,
      session: summarizedSession
    };
  }
}




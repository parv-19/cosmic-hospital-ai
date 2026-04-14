import crypto from "node:crypto";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

import { logger } from "@ai-hospital/shared-utils";

mongoose.set("bufferCommands", false);

let hasAttemptedConnection = false;
let mongoConnected = false;
let seedPromise: Promise<void> | null = null;

export async function connectMongo(uri: string): Promise<void> {
  if (hasAttemptedConnection) {
    return;
  }

  hasAttemptedConnection = true;

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000
    });
    mongoConnected = true;
    logger.info("MongoDB connected");
  } catch (error) {
    mongoConnected = false;
    logger.warn("MongoDB connection skipped; service will continue with placeholders.", error);
  }
}

export function isMongoReady(): boolean {
  return mongoConnected && mongoose.connection.readyState === 1;
}

function createPasswordHash(password: string): string {
  const salt = crypto.createHash("sha256").update(`seed:${password}`).digest("hex").slice(0, 32);
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    role: { type: String, enum: ["ADMIN", "DOCTOR", "READ_ONLY"], required: true },
    passwordHash: { type: String, required: true },
    doctorId: { type: String, default: null }
  },
  { timestamps: true }
);

const doctorSchema = new Schema(
  {
    doctorId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    specialization: { type: String, required: true },
    fee: { type: Number, required: true },
    clinicName: { type: String, required: true },
    active: { type: Boolean, default: true },
    language: { type: String, default: "en" },
    scheduleLabel: { type: String, default: "Mon-Sat 9:00 AM to 6:00 PM" },
    availability: {
      type: [
        {
          day: { type: String, required: true },
          start: { type: String, required: true },
          end: { type: String, required: true },
          blocked: { type: Boolean, default: false },
          leave: { type: Boolean, default: false }
        }
      ],
      default: []
    },
    contactNumber: { type: String, default: "" }
  },
  { timestamps: true }
);

const doctorBotSettingsSchema = new Schema(
  {
    doctorId: { type: String, required: true, unique: true, index: true },
    greetingMessage: { type: String, required: true },
    afterHoursMessage: { type: String, required: true },
    fallbackResponse: { type: String, required: true },
    language: { type: String, default: "en" },
    supportedIntents: { type: [String], default: ["book_appointment", "clinic_info", "human_escalation", "emergency"] },
    transferNumber: { type: String, required: true },
    bookingEnabled: { type: Boolean, default: true },
    emergencyMessage: { type: String, required: true },
    conversationPrompts: {
      askSpecialization: { type: String, default: "Aap kis doctor ya specialization ke liye appointment lena chahte hain?" },
      askDoctorPreference: { type: String, default: "Kya aap kisi specific doctor se milna chahte hain ya earliest available doctor chalega?" },
      askDate: { type: String, default: "Aapko kis din appointment chahiye?" },
      askTime: { type: String, default: "Aapko morning, afternoon, ya evening mein slot chahiye?" },
      askPatientName: { type: String, default: "Kripya apna naam batayein." },
      askMobile: { type: String, default: "Kripya apna mobile number batayein." },
      askPatientType: { type: String, default: "Kya yeh new patient hai ya follow-up?" },
      confirmPrefix: { type: String, default: "Main aapki details confirm karti hoon." },
      bookingConfirmed: { type: String, default: "Dhanyavaad. Aapki booking request dashboard par update kar di gayi hai." },
      bookingCancelled: {
        type: String,
        default: "The booking request has been cancelled in demo mode. If you want, we can start again with a new appointment request."
      },
      bookingAlreadyComplete: {
        type: String,
        default: "Your appointment request is already confirmed in demo mode. Thank you for calling."
      },
      bookingAlreadyCancelled: {
        type: String,
        default: "This demo booking was cancelled. You can start again by saying appointment book karna hai."
      },
      transferMessage: { type: String, default: "I will transfer you to reception at the configured clinic number." },
      goodbyeMessage: { type: String, default: "Thank you for calling. Goodbye." },
      extraInstructions: { type: String, default: "" }
    },
    llmProviders: {
      primaryProvider: { type: String, enum: ["mock", "openai", "claude", "sarvam"], default: "mock" },
      fallbackChain: { type: [String], default: [] },
      model: { type: String, default: "gpt-4o-mini" },
      apiKeyRef: { type: String, default: "OPENAI_API_KEY" },
      timeoutMs: { type: Number, default: 30000 },
      stream: { type: Boolean, default: false }
    },
    sttProviders: {
      primaryProvider: { type: String, enum: ["mock", "sarvam", "openai", "deepgram"], default: "sarvam" },
      fallbackChain: { type: [String], default: ["mock"] },
      model: { type: String, default: "saaras:v3" },
      apiKeyRef: { type: String, default: "SARVAM_API_KEY" },
      language: { type: String, default: "hi-IN" },
      timeoutMs: { type: Number, default: 10000 }
    },
    ttsProviders: {
      primaryProvider: { type: String, enum: ["mock", "sarvam", "openai", "elevenlabs"], default: "sarvam" },
      fallbackChain: { type: [String], default: ["mock"] },
      model: { type: String, default: "bulbul:v3" },
      voice: { type: String, default: "shubh" },
      apiKeyRef: { type: String, default: "SARVAM_API_KEY" },
      timeoutMs: { type: Number, default: 10000 }
    }
  },
  { timestamps: true }
);

const patientSchema = new Schema(
  {
    patientId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    phoneNumber: { type: String, required: true, index: true },
    lastDoctorId: { type: String, default: null }
  },
  { timestamps: true }
);

const appointmentSchema = new Schema(
  {
    appointmentId: { type: String, required: true, unique: true, index: true },
    patientId: { type: String, default: null },
    patientName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    doctorId: { type: String, default: null, index: true },
    doctorName: { type: String, default: null },
    appointmentDate: { type: String, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ["booked", "cancelled", "rescheduled"], default: "booked", index: true },
    source: { type: String, default: "telephony" }
  },
  { timestamps: true }
);

const transcriptSchema = new Schema(
  {
    speaker: { type: String, enum: ["caller", "bot"], required: true },
    text: { type: String, required: true },
    timestamp: { type: String, required: true }
  },
  { _id: false }
);

const callLogSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    callerNumber: { type: String, required: true },
    callStatus: { type: String, enum: ["active", "completed", "cancelled", "failed", "transferred"], default: "active" },
    bookingStage: { type: String, required: true },
    latestIntent: { type: String, default: null },
    selectedSpecialization: { type: String, default: null },
    selectedDoctor: { type: String, default: null },
    doctorId: { type: String, default: null, index: true },
    preferredDate: { type: String, default: null },
    preferredTime: { type: String, default: null },
    patientName: { type: String, default: null },
    patientType: { type: String, default: null },
    contactNumber: { type: String, default: null },
    bookingResult: { type: String, default: null },
    currentNode: { type: String, default: null },
    outcome: { type: String, default: "active", index: true },
    transcriptHistory: { type: [transcriptSchema], default: [] },
    startedAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    endedAt: { type: String, default: null }
  },
  { timestamps: false }
);

const doctorFaqSchema = new Schema(
  {
    faqId: { type: String, required: true, unique: true, index: true },
    doctorId: { type: String, default: null, index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    category: { type: String, default: "general" }
  },
  { timestamps: true }
);

const botFlowSchema = new Schema(
  {
    flowId: { type: String, required: true, unique: true, index: true },
    doctorId: { type: String, default: null, index: true },
    name: { type: String, required: true },
    definition: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

function getModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existingModel = mongoose.models[name] as Model<T> | undefined;

  if (existingModel) {
    return existingModel;
  }

  return mongoose.model<T>(name, schema) as Model<T>;
}

export type UserDocument = InferSchemaType<typeof userSchema>;
export type DoctorDocument = InferSchemaType<typeof doctorSchema>;
export type DoctorBotSettingsDocument = InferSchemaType<typeof doctorBotSettingsSchema>;
export type PatientDocument = InferSchemaType<typeof patientSchema>;
export type AppointmentDocument = InferSchemaType<typeof appointmentSchema>;
export type CallLogDocument = InferSchemaType<typeof callLogSchema>;
export type DoctorFaqDocument = InferSchemaType<typeof doctorFaqSchema>;
export type BotFlowDocument = InferSchemaType<typeof botFlowSchema>;

export const UserModel = getModel("User", userSchema);
export const DoctorModel = getModel("Doctor", doctorSchema);
export const DoctorBotSettingsModel = getModel("DoctorBotSettings", doctorBotSettingsSchema);
export const PatientModel = getModel("Patient", patientSchema);
export const AppointmentModel = getModel("Appointment", appointmentSchema);
export const CallLogModel = getModel("CallLog", callLogSchema);
export const DoctorFaqModel = getModel("DoctorFaq", doctorFaqSchema);
export const BotFlowModel = getModel("BotFlow", botFlowSchema);

const defaultAvailability = [
  { day: "Monday", start: "09:00", end: "17:00", blocked: false, leave: false },
  { day: "Tuesday", start: "09:00", end: "17:00", blocked: false, leave: false },
  { day: "Wednesday", start: "09:00", end: "17:00", blocked: false, leave: false },
  { day: "Thursday", start: "09:00", end: "17:00", blocked: false, leave: false },
  { day: "Friday", start: "09:00", end: "17:00", blocked: false, leave: false },
  { day: "Saturday", start: "10:00", end: "14:00", blocked: false, leave: false }
];

export async function ensurePlatformSeedData(): Promise<void> {
  if (!isMongoReady()) {
    return;
  }

  if (seedPromise) {
    await seedPromise;
    return;
  }

  seedPromise = (async () => {
    const doctorCount = await DoctorModel.countDocuments();

    if (doctorCount === 0) {
      await DoctorModel.insertMany([
        {
          doctorId: "doctor-1",
          name: "Dr. Ananya Sharma",
          specialization: "General Medicine",
          fee: 700,
          clinicName: "Sunrise Care Clinic",
          language: "en",
          scheduleLabel: "Mon-Sat, 9:00 AM to 6:00 PM",
          availability: defaultAvailability,
          contactNumber: "+91-99999-00001"
        },
        {
          doctorId: "doctor-2",
          name: "Dr. Rohan Patel",
          specialization: "Cardiology",
          fee: 1200,
          clinicName: "Sunrise Care Clinic",
          language: "en",
          scheduleLabel: "Mon-Fri, 10:00 AM to 5:00 PM",
          availability: defaultAvailability,
          contactNumber: "+91-99999-00002"
        },
        {
          doctorId: "doctor-3",
          name: "Dr. Meera Shah",
          specialization: "Dermatology",
          fee: 900,
          clinicName: "Sunrise Care Clinic",
          language: "en",
          scheduleLabel: "Tue-Sat, 11:00 AM to 7:00 PM",
          availability: defaultAvailability,
          contactNumber: "+91-99999-00003"
        }
      ]);
    }

    const doctors = await DoctorModel.find().lean<any[]>();

    for (const doctor of doctors) {
      await DoctorBotSettingsModel.updateOne(
        { doctorId: doctor.doctorId },
        {
          $setOnInsert: {
            doctorId: doctor.doctorId,
            greetingMessage: `Namaste. You have reached ${doctor.name} at ${doctor.clinicName}. Please tell me how I can help you today.`,
            afterHoursMessage: `The clinic is currently closed for ${doctor.name}. Please leave your preferred slot and the reception team will follow up.`,
            fallbackResponse: "I can help with appointments, doctor availability, clinic information, or connecting you to reception.",
            language: doctor.language,
            supportedIntents: ["book_appointment", "clinic_info", "human_escalation", "emergency"],
            transferNumber: doctor.contactNumber,
            bookingEnabled: true,
            emergencyMessage: "If this is a medical emergency, please contact emergency support immediately.",
            conversationPrompts: {
              askSpecialization: "Aap kis doctor ya specialization ke liye appointment lena chahte hain?",
              askDoctorPreference: "Kya aap kisi specific doctor se milna chahte hain ya earliest available doctor chalega?",
              askDate: "Aapko kis din appointment chahiye?",
              askTime: "Aapko morning, afternoon, ya evening mein slot chahiye?",
              askPatientName: "Kripya apna naam batayein.",
              askMobile: "Kripya apna mobile number batayein.",
              askPatientType: "Kya yeh new patient hai ya follow-up?",
              confirmPrefix: "Main aapki details confirm karti hoon.",
              bookingConfirmed: "Dhanyavaad. Aapki booking request dashboard par update kar di gayi hai.",
              bookingCancelled: "The booking request has been cancelled in demo mode. If you want, we can start again with a new appointment request.",
              bookingAlreadyComplete: "Your appointment request is already confirmed in demo mode. Thank you for calling.",
              bookingAlreadyCancelled: "This demo booking was cancelled. You can start again by saying appointment book karna hai.",
              transferMessage: "I will transfer you to reception at the configured clinic number.",
              goodbyeMessage: "Thank you for calling. Goodbye.",
              extraInstructions: ""
            },
            llmProviders: {
              primaryProvider: "mock",
              fallbackChain: ["openai"],
              model: "gpt-4o-mini",
              apiKeyRef: "OPENAI_API_KEY",
              timeoutMs: 30000,
              stream: false
            },
            sttProviders: {
              primaryProvider: "mock",
              fallbackChain: [],
              model: "saaras:v3",
              apiKeyRef: "SARVAM_API_KEY",
              language: "hi-IN",
              timeoutMs: 10000
            },
            ttsProviders: {
              primaryProvider: "mock",
              fallbackChain: [],
              model: "bulbul:v3",
              voice: "shubh",
              apiKeyRef: "SARVAM_API_KEY",
              timeoutMs: 10000
            }
          }
        },
        { upsert: true }
      );
    }

    const userCount = await UserModel.countDocuments();

    if (userCount === 0) {
      await UserModel.insertMany([
        {
          email: "admin@sunrise.test",
          name: "Platform Admin",
          role: "ADMIN",
          passwordHash: createPasswordHash("Admin@123"),
          doctorId: null
        },
        {
          email: "doctor@sunrise.test",
          name: "Dr. Ananya Sharma",
          role: "DOCTOR",
          passwordHash: createPasswordHash("Doctor@123"),
          doctorId: "doctor-1"
        },
        {
          email: "readonly@sunrise.test",
          name: "Read Only Analyst",
          role: "READ_ONLY",
          passwordHash: createPasswordHash("Viewer@123"),
          doctorId: null
        }
      ]);
    }

    const faqCount = await DoctorFaqModel.countDocuments();
    if (faqCount === 0) {
      await DoctorFaqModel.insertMany([
        {
          faqId: "faq-1",
          doctorId: null,
          category: "clinic",
          question: "What are the clinic timings?",
          answer: "The clinic is open Monday to Saturday, 9 AM to 6 PM."
        },
        {
          faqId: "faq-2",
          doctorId: "doctor-1",
          category: "fee",
          question: "What is the consultation fee?",
          answer: "Dr. Ananya Sharma charges Rs. 700 for consultation."
        }
      ]);
    }

    const flowCount = await BotFlowModel.countDocuments();
    if (flowCount === 0) {
      await BotFlowModel.insertMany([
        {
          flowId: "flow-1",
          doctorId: null,
          name: "default-booking-flow",
          definition: {
            start: "greeting",
            nodes: [
              { id: "greeting", next: "collect_specialization" },
              { id: "collect_specialization", next: "collect_slot" },
              { id: "collect_slot", next: "confirm_booking" }
            ]
          }
        }
      ]);
    }
  })();

  await seedPromise;
}

export { mongoose };

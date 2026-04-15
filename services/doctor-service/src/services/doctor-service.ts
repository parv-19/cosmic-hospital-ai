import {
  AppointmentModel,
  BotFlowModel,
  CallLogModel,
  DoctorBotSettingsModel,
  DoctorFaqModel,
  DoctorModel,
  PatientModel,
  UserModel,
  type AppointmentDocument,
  type CallLogDocument,
  type DoctorDocument
} from "@ai-hospital/shared-db";
import { hashPassword, signToken, verifyPassword } from "@ai-hospital/shared-utils";

const JWT_SECRET = process.env.JWT_SECRET ?? "ai-hospital-dev-secret";

type UserRole = "ADMIN" | "DOCTOR" | "READ_ONLY";

type AuthUser = {
  userId: string;
  email: string;
  role: UserRole;
  doctorId?: string | null;
};

type DoctorInput = {
  name: string;
  specialization: string;
  fee: number;
  clinicName: string;
  language?: string;
  scheduleLabel?: string;
  contactNumber?: string;
};

type AppointmentInput = {
  patientName: string;
  phoneNumber: string;
  appointmentDate: string;
  reason: string;
  doctorId?: string | null;
};

type SettingsInput = {
  doctorId?: string | null;
  greetingMessage?: string;
  afterHoursMessage?: string;
  fallbackResponse?: string;
  language?: string;
  supportedIntents?: string[];
  transferNumber?: string;
  bookingEnabled?: boolean;
  emergencyMessage?: string;
  fallbackPolicy?: "ask_again" | "transfer" | "end_call" | "create_callback";
  costDisplay?: {
    showSttCost?: boolean;
    showTtsCost?: boolean;
    showLlmCost?: boolean;
    showTotalCost?: boolean;
  };
  conversationPrompts?: {
    askSpecialization?: string;
    askDoctorPreference?: string;
    askDate?: string;
    askTime?: string;
    askPatientName?: string;
    askMobile?: string;
    askPatientType?: string;
    confirmPrefix?: string;
    bookingConfirmed?: string;
    bookingCancelled?: string;
    bookingAlreadyComplete?: string;
    bookingAlreadyCancelled?: string;
    transferMessage?: string;
    goodbyeMessage?: string;
    extraInstructions?: string;
  };
  llmProviders?: unknown;
  sttProviders?: unknown;
  ttsProviders?: unknown;
};

type FaqInput = {
  faqId?: string;
  doctorId?: string | null;
  question: string;
  answer: string;
  category?: string;
};

type FlowInput = {
  flowId?: string;
  doctorId?: string | null;
  name: string;
  definition: unknown;
};

type ProviderHealthInput = {
  service?: "llm" | "stt" | "tts";
  primaryProvider?: string;
  model?: string;
  voice?: string;
  apiKeyRef?: string;
};

type DoctorScopedUser = AuthUser & { doctorId?: string | null };

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDoctorSummary(doctor: any) {
  return {
    id: doctor.doctorId,
    doctorId: doctor.doctorId,
    name: doctor.name,
    specialty: doctor.specialization,
    specialization: doctor.specialization,
    fee: doctor.fee,
    clinicName: doctor.clinicName,
    active: doctor.active,
    language: doctor.language,
    scheduleLabel: doctor.scheduleLabel,
    availability: doctor.availability,
    contactNumber: doctor.contactNumber
  };
}

function toAppointmentSummary(appointment: any) {
  return {
    id: appointment.appointmentId,
    appointmentId: appointment.appointmentId,
    patientName: appointment.patientName,
    phoneNumber: appointment.phoneNumber,
    appointmentDate: appointment.appointmentDate,
    reason: appointment.reason,
    doctorId: appointment.doctorId,
    doctorName: appointment.doctorName,
    status: appointment.status,
    source: appointment.source,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt
  };
}

function toCallSummary(call: any) {
  return {
    id: call.sessionId,
    sessionId: call.sessionId,
    callerNumber: call.callerNumber,
    callStatus: call.callStatus,
    bookingStage: call.bookingStage,
    latestIntent: call.latestIntent,
    selectedSpecialization: call.selectedSpecialization,
    selectedDoctor: call.selectedDoctor,
    doctorId: call.doctorId,
    preferredDate: call.preferredDate,
    preferredTime: call.preferredTime,
    patientName: call.patientName,
    patientType: call.patientType,
    contactNumber: call.contactNumber,
    bookingResult: call.bookingResult,
    currentNode: call.currentNode ?? call.bookingStage,
    outcome: call.outcome,
    costSummary: call.costSummary ?? null,
    usageLedger: call.usageLedger ?? [],
    transcriptHistory: call.transcriptHistory,
    startedAt: call.startedAt,
    updatedAt: call.updatedAt,
    endedAt: call.endedAt,
    durationSeconds: Math.max(
      0,
      Math.round((new Date(call.endedAt ?? call.updatedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
    )
  };
}

function scopeDoctorFilter(user?: DoctorScopedUser): Record<string, unknown> {
  if (user?.role === "DOCTOR") {
    return { doctorId: user.doctorId ?? "doctor-1" };
  }

  return {};
}

export class DoctorService {
  async login(email: string, password: string) {
    const user = await UserModel.findOne({ email }).lean<any>();

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return null;
    }

    const token = signToken(
      {
        userId: String(user._id),
        email: user.email,
        role: user.role,
        doctorId: user.doctorId ?? null
      },
      JWT_SECRET
    );

    return {
      token,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        doctorId: user.doctorId ?? null
      }
    };
  }

  async getMe(user: AuthUser) {
    const record = await UserModel.findById(user.userId).lean<any>();

    if (!record) {
      return null;
    }

    return {
      id: String(record._id),
      email: record.email,
      name: record.name,
      role: record.role,
      doctorId: record.doctorId ?? null
    };
  }

  async getDoctor() {
    const doctor = await DoctorModel.findOne().sort({ createdAt: 1 }).lean<any>();

    if (!doctor) {
      return {
        id: "doctor-1",
        doctorId: "doctor-1",
        name: "Dr. Ananya Sharma",
        specialty: "General Medicine",
        specialization: "General Medicine",
        clinicName: "Sunrise Care Clinic",
        fee: 700,
        active: true
      };
    }

    return toDoctorSummary(doctor);
  }

  async getClinicSettings() {
    const doctor = await DoctorModel.findOne().sort({ createdAt: 1 }).lean<any>();
    const settings = doctor ? await DoctorBotSettingsModel.findOne({ doctorId: doctor.doctorId }).lean<any>() : null;

    return {
      clinicName: doctor?.clinicName ?? "Sunrise Care Clinic",
      greetingMessage: settings?.greetingMessage ?? "Welcome to Sunrise Care Clinic. How may I help you today?",
      clinicTimings: doctor?.scheduleLabel ?? "Mon-Sat, 9:00 AM to 6:00 PM",
      consultationFee: doctor?.fee ?? 700,
      transferNumber: settings?.transferNumber ?? "+91-99999-00000",
      emergencyMessage: settings?.emergencyMessage ?? "If this is a medical emergency, please contact emergency support immediately.",
      supportedLanguage: settings?.language ?? doctor?.language ?? "en",
      bookingEnabled: settings?.bookingEnabled ?? true,
      fallbackPolicy: settings?.fallbackPolicy ?? "ask_again",
      costDisplay: settings?.costDisplay ?? null,
      conversationPrompts: settings?.conversationPrompts ?? null,
      llmProviders: settings?.llmProviders ?? null,
      sttProviders: settings?.sttProviders ?? null,
      ttsProviders: settings?.ttsProviders ?? null
    };
  }

  checkProviderHealth(input: ProviderHealthInput) {
    const provider = String(input.primaryProvider ?? "").toLowerCase();
    const model = String(input.model ?? "").toLowerCase();
    const apiKeyRef = String(input.apiKeyRef ?? "").trim();
    const needsKey = provider !== "mock";
    const keyAvailable = !needsKey || Boolean(apiKeyRef && process.env[apiKeyRef]);
    const warnings: string[] = [];

    const allowedModels: Record<string, Record<string, string[]>> = {
      llm: {
        mock: ["mock"],
        openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
        claude: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest"],
        sarvam: ["sarvam-m"]
      },
      stt: {
        mock: ["mock"],
        sarvam: ["saaras:v2", "saaras:v3"],
        openai: ["whisper-1", "gpt-4o-mini-transcribe"],
        deepgram: ["nova-2", "nova-3"]
      },
      tts: {
        mock: ["mock"],
        sarvam: ["bulbul:v2", "bulbul:v3"],
        openai: ["gpt-4o-mini-tts", "tts-1"],
        elevenlabs: ["eleven_multilingual_v2"]
      }
    };

    const service = input.service ?? "llm";
    const validModels = allowedModels[service]?.[provider] ?? [];

    if (!validModels.includes(model)) {
      warnings.push(`${model || "selected model"} is not listed as compatible with ${provider || "selected provider"} for ${service}.`);
    }

    if (needsKey && !keyAvailable) {
      warnings.push(`${apiKeyRef || "API key ref"} is not available in server environment.`);
    }

    const sarvamBulbulV3Voices = ["aditya", "ritu", "ashutosh", "priya", "neha", "rahul", "pooja", "rohan", "simran", "kavya", "amit", "dev"];
    const sarvamBulbulV2Voices = ["anushka", "abhilash", "manisha", "vidya"];

    if (service === "tts" && provider === "sarvam" && model === "bulbul:v3" && input.voice && !sarvamBulbulV3Voices.includes(String(input.voice).toLowerCase())) {
      warnings.push(`${input.voice} is not in the configured Bulbul v3 voice list.`);
    }

    if (service === "tts" && provider === "sarvam" && model === "bulbul:v2" && input.voice && !sarvamBulbulV2Voices.includes(String(input.voice).toLowerCase())) {
      warnings.push(`${input.voice} is not in the configured Bulbul v2 voice list.`);
    }

    return {
      ok: warnings.length === 0,
      provider,
      service,
      model,
      keyRef: apiKeyRef,
      keyAvailable,
      warnings,
      note: "Health check validates compatibility and server-side secret availability without making a paid provider request."
    };
  }

  async getRuntimeConfig() {
    const [doctors, settings, faq, flows] = await Promise.all([
      DoctorModel.find({ active: true }).lean<any[]>(),
      DoctorBotSettingsModel.find().lean<any[]>(),
      DoctorFaqModel.find().lean<any[]>(),
      BotFlowModel.find().lean<any[]>()
    ]);

    const doctorMap = new Map(settings.map((item) => [item.doctorId, item]));

    return {
      doctors: doctors.map((doctor) => ({
        ...toDoctorSummary(doctor),
        botSettings: doctorMap.get(doctor.doctorId)
          ? {
              greetingMessage: doctorMap.get(doctor.doctorId)?.greetingMessage,
              afterHoursMessage: doctorMap.get(doctor.doctorId)?.afterHoursMessage,
              fallbackResponse: doctorMap.get(doctor.doctorId)?.fallbackResponse,
              language: doctorMap.get(doctor.doctorId)?.language,
              supportedIntents: doctorMap.get(doctor.doctorId)?.supportedIntents,
              transferNumber: doctorMap.get(doctor.doctorId)?.transferNumber,
              bookingEnabled: doctorMap.get(doctor.doctorId)?.bookingEnabled,
              emergencyMessage: doctorMap.get(doctor.doctorId)?.emergencyMessage,
              fallbackPolicy: doctorMap.get(doctor.doctorId)?.fallbackPolicy,
              costDisplay: doctorMap.get(doctor.doctorId)?.costDisplay,
              conversationPrompts: doctorMap.get(doctor.doctorId)?.conversationPrompts,
              llmProviders: doctorMap.get(doctor.doctorId)?.llmProviders,
              sttProviders: doctorMap.get(doctor.doctorId)?.sttProviders,
              ttsProviders: doctorMap.get(doctor.doctorId)?.ttsProviders
            }
          : null
      })),
      faq: faq.map((entry) => ({
        id: entry.faqId,
        faqId: entry.faqId,
        doctorId: entry.doctorId,
        question: entry.question,
        answer: entry.answer,
        category: entry.category
      })),
      flows: flows.map((flow) => ({
        id: flow.flowId,
        flowId: flow.flowId,
        doctorId: flow.doctorId,
        name: flow.name,
        definition: flow.definition
      }))
    };
  }

  async getDashboard(user: DoctorScopedUser) {
    const callFilter = scopeDoctorFilter(user);
    const appointmentFilter = scopeDoctorFilter(user);
    const [calls, appointments, doctors] = await Promise.all([
      CallLogModel.find(callFilter).lean<any[]>(),
      AppointmentModel.find(appointmentFilter).lean<any[]>(),
      DoctorModel.find().lean<any[]>()
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const todaysCalls = calls.filter((call) => (call.updatedAt ?? "").startsWith(today));
    const doctorStats = doctors.map((doctor) => {
      const doctorCalls = calls.filter((call) => call.doctorId === doctor.doctorId || call.selectedDoctor === doctor.name);
      return {
        doctorId: doctor.doctorId,
        doctorName: doctor.name,
        calls: doctorCalls.length,
        booked: doctorCalls.filter((call) => call.outcome === "booked").length,
        transferred: doctorCalls.filter((call) => call.outcome === "transferred").length,
        failed: doctorCalls.filter((call) => call.outcome === "failed").length
      };
    });

    return {
      totals: {
        callsToday: todaysCalls.length,
        booked: calls.filter((call) => call.outcome === "booked").length,
        transferred: calls.filter((call) => call.outcome === "transferred").length,
        failed: calls.filter((call) => call.outcome === "failed").length,
        activeCalls: calls.filter((call) => call.callStatus === "active").length,
        appointments: appointments.length,
        totalCost: Math.round(calls.reduce((sum, call) => sum + Number(call.costSummary?.totalCost ?? 0), 0) * 10000) / 10000
      },
      doctorStats
    };
  }

  async listDoctors(user: DoctorScopedUser) {
    const doctors = await DoctorModel.find(user.role === "DOCTOR" ? { doctorId: user.doctorId } : {}).sort({ createdAt: 1 }).lean<any[]>();
    return doctors.map((doctor) => toDoctorSummary(doctor));
  }

  async createDoctor(input: DoctorInput) {
    const doctorId = makeId("doctor");
    const doctor = await DoctorModel.create({
      doctorId,
      name: input.name,
      specialization: input.specialization,
      fee: input.fee,
      clinicName: input.clinicName,
      language: input.language ?? "en",
      scheduleLabel: input.scheduleLabel ?? "Mon-Sat, 9:00 AM to 6:00 PM",
      availability: [],
      contactNumber: input.contactNumber ?? ""
    });

    await DoctorBotSettingsModel.create({
      doctorId,
      greetingMessage: `Namaste. You have reached ${input.name}. Please tell me how I can help you today.`,
      afterHoursMessage: `The clinic is closed for ${input.name}. Please leave your preferred slot and we will call you back.`,
      fallbackResponse: "I can help with appointments, timings, fees, or connecting you to reception.",
      language: input.language ?? "en",
      supportedIntents: ["book_appointment", "clinic_info", "human_escalation", "emergency"],
      transferNumber: input.contactNumber ?? "+91-99999-00000",
      bookingEnabled: true,
      emergencyMessage: "If this is a medical emergency, please contact emergency support immediately.",
      fallbackPolicy: "ask_again",
      costDisplay: {
        showSttCost: true,
        showTtsCost: true,
        showLlmCost: true,
        showTotalCost: true
      },
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
      }
    });

    return toDoctorSummary(doctor.toObject());
  }

  async updateDoctor(doctorId: string, input: Partial<DoctorInput>, user: DoctorScopedUser) {
    const scopedDoctorId = user.role === "DOCTOR" ? user.doctorId : doctorId;
    const doctor = await DoctorModel.findOneAndUpdate(
      { doctorId: scopedDoctorId },
      {
        $set: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.specialization ? { specialization: input.specialization } : {}),
          ...(typeof input.fee === "number" ? { fee: input.fee } : {}),
          ...(input.clinicName ? { clinicName: input.clinicName } : {}),
          ...(input.language ? { language: input.language } : {}),
          ...(input.scheduleLabel ? { scheduleLabel: input.scheduleLabel } : {}),
          ...(input.contactNumber ? { contactNumber: input.contactNumber } : {})
        }
      },
      { new: true }
    ).lean();

    return doctor ? toDoctorSummary(doctor) : null;
  }

  async listAppointments(user: DoctorScopedUser, filters: { status?: string }) {
    const query: Record<string, unknown> = { ...scopeDoctorFilter(user) };

    if (filters.status) {
      query.status = filters.status;
    }

    const appointments = await AppointmentModel.find(query).sort({ createdAt: -1 }).lean<any[]>();
    return appointments.map((appointment) => toAppointmentSummary(appointment));
  }

  async createAppointment(input: AppointmentInput) {
    let patient = await PatientModel.findOne({ phoneNumber: input.phoneNumber });

    if (!patient) {
      patient = await PatientModel.create({
        patientId: makeId("patient"),
        name: input.patientName,
        phoneNumber: input.phoneNumber,
        lastDoctorId: input.doctorId ?? null
      });
    }

    const doctor = input.doctorId ? await DoctorModel.findOne({ doctorId: input.doctorId }).lean<any>() : null;
    const appointment = await AppointmentModel.create({
      appointmentId: makeId("appt"),
      patientId: patient.patientId,
      patientName: input.patientName,
      phoneNumber: input.phoneNumber,
      doctorId: input.doctorId ?? null,
      doctorName: doctor?.name ?? null,
      appointmentDate: input.appointmentDate,
      reason: input.reason,
      status: "booked",
      source: "telephony"
    });

    return toAppointmentSummary(appointment.toObject());
  }

  async cancelAppointment(appointmentId: string) {
    const appointment = await AppointmentModel.findOneAndUpdate(
      { appointmentId },
      { $set: { status: "cancelled" } },
      { new: true }
    ).lean();

    return appointment ? toAppointmentSummary(appointment) : null;
  }

  async rescheduleAppointment(appointmentId: string, appointmentDate: string) {
    const appointment = await AppointmentModel.findOneAndUpdate(
      { appointmentId },
      { $set: { status: "rescheduled", appointmentDate } },
      { new: true }
    ).lean();

    return appointment ? toAppointmentSummary(appointment) : null;
  }

  async listCalls(user: DoctorScopedUser) {
    const calls = await CallLogModel.find(scopeDoctorFilter(user)).sort({ updatedAt: -1 }).lean<any[]>();
    return calls.map((call) => toCallSummary(call));
  }

  async getTranscript(sessionId: string, user: DoctorScopedUser) {
    const call = await CallLogModel.findOne({ sessionId, ...scopeDoctorFilter(user) }).lean<any>();
    return call ? toCallSummary(call) : null;
  }

  async listLiveCalls(user: DoctorScopedUser) {
    const calls = await CallLogModel.find({ ...scopeDoctorFilter(user), callStatus: "active" }).sort({ updatedAt: -1 }).lean<any[]>();
    return calls.map((call) => toCallSummary(call));
  }

  async getSettings(user: DoctorScopedUser) {
    const doctorFilter = user.role === "DOCTOR" ? { doctorId: user.doctorId } : {};
    const [doctors, settings] = await Promise.all([
      DoctorModel.find(doctorFilter).sort({ createdAt: 1 }).lean(),
      DoctorBotSettingsModel.find(doctorFilter).lean<any[]>()
    ]);
    const doctorMap = new Map(doctors.map((doctor) => [doctor.doctorId, doctor]));

    return settings.map((setting) => ({
      doctorId: setting.doctorId,
      doctorName: doctorMap.get(setting.doctorId)?.name ?? setting.doctorId,
      greetingMessage: setting.greetingMessage,
      afterHoursMessage: setting.afterHoursMessage,
      fallbackResponse: setting.fallbackResponse,
      language: setting.language,
      supportedIntents: setting.supportedIntents,
      transferNumber: setting.transferNumber,
      bookingEnabled: setting.bookingEnabled,
      emergencyMessage: setting.emergencyMessage,
      fallbackPolicy: setting.fallbackPolicy ?? "ask_again",
      costDisplay: setting.costDisplay ?? null,
      conversationPrompts: setting.conversationPrompts ?? null,
      llmProviders: setting.llmProviders ?? null,
      sttProviders: setting.sttProviders ?? null,
      ttsProviders: setting.ttsProviders ?? null,
      fee: doctorMap.get(setting.doctorId)?.fee ?? null,
      scheduleLabel: doctorMap.get(setting.doctorId)?.scheduleLabel ?? null,
      availability: doctorMap.get(setting.doctorId)?.availability ?? []
    }));
  }

  async updateSettings(user: DoctorScopedUser, input: SettingsInput & { fee?: number; scheduleLabel?: string; availability?: unknown[] }) {
    const targetDoctorId = user.role === "DOCTOR" ? user.doctorId : input.doctorId;

    if (!targetDoctorId) {
      return null;
    }

    const settings = await DoctorBotSettingsModel.findOneAndUpdate(
      { doctorId: targetDoctorId },
      {
        $set: {
          ...(input.greetingMessage ? { greetingMessage: input.greetingMessage } : {}),
          ...(input.afterHoursMessage ? { afterHoursMessage: input.afterHoursMessage } : {}),
          ...(input.fallbackResponse ? { fallbackResponse: input.fallbackResponse } : {}),
          ...(input.language ? { language: input.language } : {}),
          ...(input.supportedIntents ? { supportedIntents: input.supportedIntents } : {}),
          ...(input.transferNumber ? { transferNumber: input.transferNumber } : {}),
          ...(typeof input.bookingEnabled === "boolean" ? { bookingEnabled: input.bookingEnabled } : {}),
          ...(input.emergencyMessage ? { emergencyMessage: input.emergencyMessage } : {}),
          ...(input.fallbackPolicy ? { fallbackPolicy: input.fallbackPolicy } : {}),
          ...(input.costDisplay ? { costDisplay: input.costDisplay } : {}),
          ...(input.conversationPrompts ? { conversationPrompts: input.conversationPrompts } : {}),
          ...(input.llmProviders ? { llmProviders: input.llmProviders } : {}),
          ...(input.sttProviders ? { sttProviders: input.sttProviders } : {}),
          ...(input.ttsProviders ? { ttsProviders: input.ttsProviders } : {})
        }
      },
      { new: true, upsert: true }
    ).lean();

    await DoctorModel.updateOne(
      { doctorId: targetDoctorId },
      {
        $set: {
          ...(typeof input.fee === "number" ? { fee: input.fee } : {}),
          ...(input.scheduleLabel ? { scheduleLabel: input.scheduleLabel } : {}),
          ...(Array.isArray(input.availability) ? { availability: input.availability } : {})
        }
      }
    );

    return settings;
  }

  async listFaq(user: DoctorScopedUser) {
    const faq = await DoctorFaqModel.find(user.role === "DOCTOR" ? { $or: [{ doctorId: null }, { doctorId: user.doctorId }] } : {}).sort({ createdAt: -1 }).lean<any[]>();
    return faq.map((entry) => ({
      id: entry.faqId,
      faqId: entry.faqId,
      doctorId: entry.doctorId,
      question: entry.question,
      answer: entry.answer,
      category: entry.category
    }));
  }

  async upsertFaq(input: FaqInput, user: DoctorScopedUser) {
    const targetDoctorId = user.role === "DOCTOR" ? user.doctorId : input.doctorId ?? null;
    const faqId = input.faqId ?? makeId("faq");
    const faq = await DoctorFaqModel.findOneAndUpdate(
      { faqId },
      {
        $set: {
          doctorId: targetDoctorId,
          question: input.question,
          answer: input.answer,
          category: input.category ?? "general"
        }
      },
      { new: true, upsert: true }
    ).lean();

    return faq;
  }

  async listFlows(user: DoctorScopedUser) {
    const flows = await BotFlowModel.find(user.role === "DOCTOR" ? { $or: [{ doctorId: null }, { doctorId: user.doctorId }] } : {}).sort({ createdAt: -1 }).lean<any[]>();
    return flows.map((flow) => ({
      id: flow.flowId,
      flowId: flow.flowId,
      doctorId: flow.doctorId,
      name: flow.name,
      definition: flow.definition
    }));
  }

  async upsertFlow(input: FlowInput, user: DoctorScopedUser) {
    const targetDoctorId = user.role === "DOCTOR" ? user.doctorId : input.doctorId ?? null;
    const flowId = input.flowId ?? makeId("flow");
    const flow = await BotFlowModel.findOneAndUpdate(
      { flowId },
      {
        $set: {
          doctorId: targetDoctorId,
          name: input.name,
          definition: input.definition
        }
      },
      { new: true, upsert: true }
    ).lean();

    return flow;
  }

  async getAnalytics(user: DoctorScopedUser) {
    const calls = await CallLogModel.find(scopeDoctorFilter(user)).lean<any[]>();
    const total = calls.length || 1;
    const doctorDemand = new Map<string, number>();
    const intents = new Map<string, number>();

    for (const call of calls) {
      const doctorKey = call.selectedDoctor ?? call.selectedSpecialization ?? "Unassigned";
      doctorDemand.set(doctorKey, (doctorDemand.get(doctorKey) ?? 0) + 1);
      const intentKey = call.latestIntent ?? "unknown";
      intents.set(intentKey, (intents.get(intentKey) ?? 0) + 1);
    }

    return {
      totalCalls: calls.length,
      bookingRate: Math.round((calls.filter((call) => call.outcome === "booked").length / total) * 100),
      transferRate: Math.round((calls.filter((call) => call.outcome === "transferred").length / total) * 100),
      doctorDemand: Array.from(doctorDemand.entries()).map(([label, value]) => ({ label, value })),
      intentDistribution: Array.from(intents.entries()).map(([label, value]) => ({ label, value }))
    };
  }

  async createUser(input: { email: string; name: string; role: UserRole; password: string; doctorId?: string | null }) {
    const user = await UserModel.create({
      email: input.email,
      name: input.name,
      role: input.role,
      doctorId: input.doctorId ?? null,
      passwordHash: hashPassword(input.password)
    });

    return {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      doctorId: user.doctorId ?? null
    };
  }
}




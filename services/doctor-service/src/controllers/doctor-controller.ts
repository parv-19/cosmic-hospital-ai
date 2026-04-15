import type { Response } from "express";

import { sendError, sendSuccess } from "@ai-hospital/shared-utils";

import type { AuthenticatedRequest } from "../middlewares/auth";
import { DoctorService } from "../services/doctor-service";

function getRouteParam(value: string | string[] | undefined, fallback = ""): string {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

function getBodyString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  login = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { email, password } = req.body as Record<string, string | undefined>;

    if (!email || !password) {
      sendError(res, "email and password are required.", 400);
      return;
    }

    const result = await this.doctorService.login(email, password);

    if (!result) {
      sendError(res, "Invalid credentials.", 401);
      return;
    }

    sendSuccess(res, result);
  };

  me = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.auth) {
      sendError(res, "Authentication required.", 401);
      return;
    }

    const user = await this.doctorService.getMe(req.auth);

    if (!user) {
      sendError(res, "User not found.", 404);
      return;
    }

    sendSuccess(res, user);
  };

  getDoctor = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const doctor = await this.doctorService.getDoctor();
    sendSuccess(res, doctor);
  };

  getClinicSettings = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const clinicSettings = await this.doctorService.getClinicSettings();
    sendSuccess(res, clinicSettings);
  };

  getRuntimeConfig = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendSuccess(res, await this.doctorService.getRuntimeConfig());
  };

  checkProviderHealth = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendSuccess(res, this.doctorService.checkProviderHealth(req.body));
  };

  getDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendSuccess(res, await this.doctorService.getDashboard(req.auth!));
  };

  listDoctors = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendSuccess(res, await this.doctorService.listDoctors(req.auth!));
  };

  createDoctor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { name, specialization, fee, clinicName, language, scheduleLabel, contactNumber } = req.body as Record<string, string | number | undefined>;

    if (!name || !specialization || typeof fee !== "number" || !clinicName) {
      sendError(res, "name, specialization, fee, and clinicName are required.", 400);
      return;
    }

    sendSuccess(
      res,
      await this.doctorService.createDoctor({
        name: String(name),
        specialization: String(specialization),
        fee,
        clinicName: String(clinicName),
        language: typeof language === "string" ? language : undefined,
        scheduleLabel: typeof scheduleLabel === "string" ? scheduleLabel : undefined,
        contactNumber: typeof contactNumber === "string" ? contactNumber : undefined
      }),
      201
    );
  };

  updateDoctor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const updated = await this.doctorService.updateDoctor(getRouteParam(req.params.id), req.body, req.auth!);

    if (!updated) {
      sendError(res, "Doctor not found.", 404);
      return;
    }

    sendSuccess(res, updated);
  };

  listAppointments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    sendSuccess(res, await this.doctorService.listAppointments(req.auth!, { status }));
  };

  bookAppointment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { patientName, phoneNumber, appointmentDate, reason, doctorId } = req.body as Record<string, string | undefined>;

    if (!patientName || !phoneNumber || !appointmentDate || !reason) {
      sendError(res, "patientName, phoneNumber, appointmentDate, and reason are required.", 400);
      return;
    }

    sendSuccess(
      res,
      await this.doctorService.createAppointment({
        patientName,
        phoneNumber,
        appointmentDate,
        reason,
        doctorId: doctorId ?? req.auth?.doctorId ?? null
      }),
      201
    );
  };

  cancelAppointment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const appointmentId = (req.body as Record<string, string | undefined>).appointmentId;

    if (!appointmentId) {
      sendError(res, "appointmentId is required.", 400);
      return;
    }

    const appointment = await this.doctorService.cancelAppointment(appointmentId);

    if (!appointment) {
      sendError(res, "Appointment not found.", 404);
      return;
    }

    sendSuccess(res, appointment);
  };

  rescheduleAppointment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { appointmentId, appointmentDate } = req.body as Record<string, string | undefined>;

    if (!appointmentId || !appointmentDate) {
      sendError(res, "appointmentId and appointmentDate are required.", 400);
      return;
    }

    const appointment = await this.doctorService.rescheduleAppointment(appointmentId, appointmentDate);

    if (!appointment) {
      sendError(res, "Appointment not found.", 404);
      return;
    }

    sendSuccess(res, appointment);
  };

  listCalls = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendSuccess(res, await this.doctorService.listCalls(req.auth!));
  };

  getTranscript = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const call = await this.doctorService.getTranscript(getRouteParam(req.params.id), req.auth!);

    if (!call) {
      sendError(res, "Call not found.", 404);
      return;
    }

    sendSuccess(res, call);
  };

  getCall = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const call = await this.doctorService.getTranscript(getRouteParam(req.params.id), req.auth!);

    if (!call) {
      sendError(res, "Call not found.", 404);
      return;
    }

    sendSuccess(res, call);
  };
  getLiveCalls = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendSuccess(res, await this.doctorService.listLiveCalls(req.auth!));
  };

  getSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendSuccess(res, await this.doctorService.getSettings(req.auth!));
  };

  updateSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const settings = await this.doctorService.updateSettings(req.auth!, req.body);

    if (!settings) {
      sendError(res, "doctorId is required.", 400);
      return;
    }

    sendSuccess(res, settings);
  };

  listFaq = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendSuccess(res, await this.doctorService.listFaq(req.auth!));
  };

  upsertFaq = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { question, answer } = req.body as Record<string, string | undefined>;

    if (!question || !answer) {
      sendError(res, "question and answer are required.", 400);
      return;
    }

    sendSuccess(res, await this.doctorService.upsertFaq({ ...req.body, question: getBodyString(question)!, answer: getBodyString(answer)! }, req.auth!));
  };

  listFlows = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendSuccess(res, await this.doctorService.listFlows(req.auth!));
  };

  upsertFlow = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { name, definition } = req.body as Record<string, unknown>;

    if (!name || !definition) {
      sendError(res, "name and definition are required.", 400);
      return;
    }

    sendSuccess(res, await this.doctorService.upsertFlow({ ...req.body, name: String(name), definition }, req.auth!));
  };

  getAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    sendSuccess(res, await this.doctorService.getAnalytics(req.auth!));
  };

  createUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { email, name, role, password, doctorId } = req.body as Record<string, string | undefined>;

    if (!email || !name || !role || !password) {
      sendError(res, "email, name, role, and password are required.", 400);
      return;
    }

    sendSuccess(
      res,
      await this.doctorService.createUser({
        email,
        name,
        role: role as "ADMIN" | "DOCTOR" | "READ_ONLY",
        password,
        doctorId: doctorId ?? null
      }),
      201
    );
  };
}


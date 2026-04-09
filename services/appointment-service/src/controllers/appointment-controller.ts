import type { Request, Response } from "express";

import { sendError, sendSuccess } from "@ai-hospital/shared-utils";

import { AppointmentService } from "../services/appointment-service";

export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  listAppointments = async (_req: Request, res: Response): Promise<void> => {
    const appointments = await this.appointmentService.listAppointments();
    sendSuccess(res, appointments);
  };

  createAppointment = async (req: Request, res: Response): Promise<void> => {
    const { patientName, phoneNumber, appointmentDate, reason, doctorId } = req.body as Record<string, string | undefined>;

    if (!patientName || !phoneNumber || !appointmentDate || !reason) {
      sendError(res, "patientName, phoneNumber, appointmentDate, and reason are required.", 400);
      return;
    }

    const appointment = await this.appointmentService.createAppointment({
      patientName,
      phoneNumber,
      appointmentDate,
      reason,
      doctorId: doctorId ?? null
    });

    sendSuccess(res, appointment, 201);
  };

  cancelAppointment = async (req: Request, res: Response): Promise<void> => {
    const appointmentId = (req.body as Record<string, string | undefined>).appointmentId;

    if (!appointmentId) {
      sendError(res, "appointmentId is required.", 400);
      return;
    }

    const appointment = await this.appointmentService.cancelAppointment(appointmentId);

    if (!appointment) {
      sendError(res, "Appointment not found.", 404);
      return;
    }

    sendSuccess(res, appointment);
  };

  rescheduleAppointment = async (req: Request, res: Response): Promise<void> => {
    const { appointmentId, appointmentDate } = req.body as Record<string, string | undefined>;

    if (!appointmentId || !appointmentDate) {
      sendError(res, "appointmentId and appointmentDate are required.", 400);
      return;
    }

    const appointment = await this.appointmentService.rescheduleAppointment(appointmentId, appointmentDate);

    if (!appointment) {
      sendError(res, "Appointment not found.", 404);
      return;
    }

    sendSuccess(res, appointment);
  };
}

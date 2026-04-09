import { AppointmentModel, DoctorModel, PatientModel } from "@ai-hospital/shared-db";

export type AppointmentRecord = {
  id: string;
  patientName: string;
  phoneNumber: string;
  appointmentDate: string;
  reason: string;
  status: "booked" | "cancelled" | "rescheduled";
  doctorId?: string | null;
  doctorName?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class AppointmentRepository {
  async list(): Promise<AppointmentRecord[]> {
    const appointments = await AppointmentModel.find().sort({ createdAt: -1 }).lean<any[]>();
    return appointments.map((appointment) => ({
      id: appointment.appointmentId,
      patientName: appointment.patientName,
      phoneNumber: appointment.phoneNumber,
      appointmentDate: appointment.appointmentDate,
      reason: appointment.reason,
      status: appointment.status,
      doctorId: appointment.doctorId,
      doctorName: appointment.doctorName,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt
    }));
  }

  async create(input: Omit<AppointmentRecord, "id" | "status" | "createdAt" | "updatedAt">): Promise<AppointmentRecord> {
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
      appointmentDate: input.appointmentDate,
      reason: input.reason,
      doctorId: input.doctorId ?? null,
      doctorName: doctor?.name ?? null,
      status: "booked",
      source: "telephony"
    });

    return {
      id: appointment.appointmentId,
      patientName: appointment.patientName,
      phoneNumber: appointment.phoneNumber,
      appointmentDate: appointment.appointmentDate,
      reason: appointment.reason,
      status: appointment.status,
      doctorId: appointment.doctorId,
      doctorName: appointment.doctorName,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt
    };
  }

  async cancel(id: string): Promise<AppointmentRecord | null> {
    const appointment = await AppointmentModel.findOneAndUpdate({ appointmentId: id }, { $set: { status: "cancelled" } }, { new: true }).lean<any>();
    return appointment
      ? {
          id: appointment.appointmentId,
          patientName: appointment.patientName,
          phoneNumber: appointment.phoneNumber,
          appointmentDate: appointment.appointmentDate,
          reason: appointment.reason,
          status: appointment.status,
          doctorId: appointment.doctorId,
          doctorName: appointment.doctorName,
          createdAt: appointment.createdAt,
          updatedAt: appointment.updatedAt
        }
      : null;
  }

  async reschedule(id: string, appointmentDate: string): Promise<AppointmentRecord | null> {
    const appointment = await AppointmentModel.findOneAndUpdate(
      { appointmentId: id },
      { $set: { status: "rescheduled", appointmentDate } },
      { new: true }
    ).lean<any>();
    return appointment
      ? {
          id: appointment.appointmentId,
          patientName: appointment.patientName,
          phoneNumber: appointment.phoneNumber,
          appointmentDate: appointment.appointmentDate,
          reason: appointment.reason,
          status: appointment.status,
          doctorId: appointment.doctorId,
          doctorName: appointment.doctorName,
          createdAt: appointment.createdAt,
          updatedAt: appointment.updatedAt
        }
      : null;
  }
}


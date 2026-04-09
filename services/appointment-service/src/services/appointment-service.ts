import { AppointmentRepository, type AppointmentRecord } from "../repositories/appointment-repository";

export type CreateAppointmentInput = Omit<AppointmentRecord, "id" | "status" | "createdAt" | "updatedAt">;

export class AppointmentService {
  constructor(private readonly repository: AppointmentRepository) {}

  async listAppointments() {
    return this.repository.list();
  }

  async createAppointment(input: CreateAppointmentInput) {
    return this.repository.create(input);
  }

  async cancelAppointment(id: string) {
    return this.repository.cancel(id);
  }

  async rescheduleAppointment(id: string, appointmentDate: string) {
    return this.repository.reschedule(id, appointmentDate);
  }
}

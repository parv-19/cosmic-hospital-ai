export type DoctorRecord = {
  id: string;
  name: string;
  specialty: string;
  clinicName: string;
};

export type ClinicSettingsRecord = {
  clinicName: string;
  greetingMessage: string;
  clinicTimings: string;
  consultationFee: number;
  transferNumber: string;
  emergencyMessage: string;
  supportedLanguage: string;
  bookingEnabled: boolean;
};

const doctorRecord: DoctorRecord = {
  id: "doctor-1",
  name: "Dr. Ananya Sharma",
  specialty: "General Medicine",
  clinicName: "Sunrise Care Clinic"
};

const clinicSettingsRecord: ClinicSettingsRecord = {
  clinicName: "Sunrise Care Clinic",
  greetingMessage: "Welcome to Sunrise Care Clinic. How may I help you today?",
  clinicTimings: "Mon-Sat, 9:00 AM to 6:00 PM",
  consultationFee: 700,
  transferNumber: "+91-99999-00000",
  emergencyMessage: "If this is a medical emergency, please call your local emergency number or go to the nearest emergency room immediately.",
  supportedLanguage: "en",
  bookingEnabled: true
};

export class DoctorRepository {
  async getDoctor(): Promise<DoctorRecord> {
    return doctorRecord;
  }

  async getClinicSettings(): Promise<ClinicSettingsRecord> {
    return clinicSettingsRecord;
  }
}


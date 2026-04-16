import type { AppointmentRecord, DoctorRecord } from "../api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_ALIASES: Record<string, string> = {
  monday: "Monday",
  mon: "Monday",
  tuesday: "Tuesday",
  tue: "Tuesday",
  tues: "Tuesday",
  wednesday: "Wednesday",
  wed: "Wednesday",
  thursday: "Thursday",
  thu: "Thursday",
  thurs: "Thursday",
  friday: "Friday",
  fri: "Friday",
  saturday: "Saturday",
  sat: "Saturday",
  sunday: "Sunday",
  sun: "Sunday",
};

const ACTIVE_BOOKING_STATUSES = new Set(["booked", "confirmed", "rescheduled", "pending"]);
const MONTHS = [
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sept", "sep"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"]
];

export type SlotSummary = {
  day: string;
  availableSlots: string[];
  bookedSlots: Array<{ time: string; patientName: string; status: string }>;
  unavailableReason?: "closed" | "blocked" | "leave";
};

export function getDayNameFromDateInput(value: string) {
  if (!value) return DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return DAYS[0];
  const day = parsed.getDay();
  return day === 0 ? "Sunday" : DAYS[day - 1];
}

export function formatDayLabel(day: string) {
  return DAY_ALIASES[day.toLowerCase()] ?? day;
}

export function getSlotSummary(
  doctor: DoctorRecord,
  appointments: AppointmentRecord[],
  day: string,
  selectedDate?: string,
  slotDurationMinutes = 90
): SlotSummary {
  const normalizedDay = formatDayLabel(day);
  const availability = doctor.availability?.find((slot) => formatDayLabel(slot.day) === normalizedDay);
  const bookedSlots = getBookedSlotsForDoctorDay(doctor, appointments, normalizedDay, selectedDate);

  if (!availability) {
    return { day: normalizedDay, availableSlots: [], bookedSlots, unavailableReason: "closed" };
  }
  if (availability.leave) {
    return { day: normalizedDay, availableSlots: [], bookedSlots, unavailableReason: "leave" };
  }
  if (availability.blocked) {
    return { day: normalizedDay, availableSlots: [], bookedSlots, unavailableReason: "blocked" };
  }

  const bookedTimes = new Set(bookedSlots.map((slot) => slot.time.toLowerCase()));
  const availableSlots = generateSlots(availability.start, availability.end, slotDurationMinutes)
    .filter((slot) => !bookedTimes.has(slot.toLowerCase()));

  return { day: normalizedDay, availableSlots, bookedSlots };
}

export function getBookedSlotsForDoctorDay(
  doctor: DoctorRecord,
  appointments: AppointmentRecord[],
  day: string,
  selectedDate?: string
) {
  return appointments
    .filter((appointment) => appointmentMatchesDoctor(appointment, doctor))
    .filter((appointment) => ACTIVE_BOOKING_STATUSES.has((appointment.status ?? "").toLowerCase()))
    .map((appointment) => ({ appointment, parsed: parseAppointmentSlot(appointment.appointmentDate) }))
    .filter(({ parsed }) => parsed.day === day && !!parsed.time)
    .filter(({ parsed }) => !selectedDate || !parsed.dateKey || parsed.dateKey === selectedDate)
    .map(({ appointment, parsed }) => ({
      time: parsed.time!,
      patientName: appointment.patientName || "Patient",
      status: appointment.status || "booked",
    }))
    .sort((a, b) => (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0));
}

export function parseAppointmentSlot(value: string) {
  const raw = value ?? "";
  const lower = raw.toLowerCase();
  let day: string | null = null;

  for (const [alias, canonical] of Object.entries(DAY_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(lower)) {
      day = canonical;
      break;
    }
  }

  if (!day) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const weekday = parsed.getDay();
      day = weekday === 0 ? "Sunday" : DAYS[weekday - 1];
    }
  }

  const timeMatch = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)\b/);
  const time = timeMatch ? formatMinutes((parseTimeToMinutes(timeMatch[0]) ?? 0)) : null;

  return { day, time, dateKey: parseDateKey(raw) };
}

function parseDateKey(value: string) {
  const normalized = value.toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ");
  for (let month = 0; month < MONTHS.length; month += 1) {
    for (const name of MONTHS[month]) {
      const beforeDay = normalized.match(new RegExp(`\\b(\\d{1,2})\\s+${name}(?:\\s+(\\d{4}))?\\b`, "i"));
      const afterDay = normalized.match(new RegExp(`\\b${name}\\s+(\\d{1,2})(?:\\s+(\\d{4}))?\\b`, "i"));
      const match = beforeDay ?? afterDay;
      if (!match?.[1]) continue;
      const year = Number(match[2] ?? new Date().getFullYear());
      const date = new Date(year, month, Number(match[1]));
      if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === Number(match[1])) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      }
    }
  }

  return null;
}

function appointmentMatchesDoctor(appointment: AppointmentRecord, doctor: DoctorRecord) {
  if (appointment.doctorId && appointment.doctorId === doctor.doctorId) return true;
  return (appointment.doctorName ?? "").toLowerCase() === doctor.name.toLowerCase();
}

function generateSlots(start: string, end: string, durationMinutes: number) {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return [];

  const slots: string[] = [];
  for (let cursor = startMinutes; cursor + durationMinutes <= endMinutes; cursor += durationMinutes) {
    slots.push(formatMinutes(cursor));
  }
  return slots;
}

function parseTimeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const suffix = match[3]?.toLowerCase();

  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}

function formatMinutes(totalMinutes: number) {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

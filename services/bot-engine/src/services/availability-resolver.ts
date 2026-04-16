export type AvailabilityRuntimeDoctor = {
  doctorId: string;
  name: string;
  specialization: string;
  availability?: Array<{
    day: string;
    start: string;
    end: string;
    blocked?: boolean;
    leave?: boolean;
  }>;
  botSettings?: {
    bookingEnabled?: boolean;
  } | null;
};

export type AppointmentSnapshot = {
  id?: string;
  appointmentId?: string;
  patientName?: string;
  phoneNumber?: string;
  reason?: string;
  doctorId?: string | null;
  doctorName?: string | null;
  appointmentDate?: string;
  status?: string;
};

export type AvailabilityResolution = {
  status: "available" | "time_full" | "day_unavailable" | "booking_disabled" | "unknown";
  checkKey: string;
  reply: string;
  selectedDate?: string;
  selectedTime?: string;
  offeredDate?: string;
  offeredTime?: string;
  offeredSlots: string[];
};

export type AvailabilityPromptTemplates = Partial<{
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
}>;

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTHS: Array<{ month: number; names: string[] }> = [
  { month: 0, names: ["january", "jan"] },
  { month: 1, names: ["february", "feb"] },
  { month: 2, names: ["march", "mar"] },
  { month: 3, names: ["april", "apr"] },
  { month: 4, names: ["may"] },
  { month: 5, names: ["june", "jun"] },
  { month: 6, names: ["july", "jul"] },
  { month: 7, names: ["august", "aug"] },
  { month: 8, names: ["september", "sept", "sep"] },
  { month: 9, names: ["october", "oct"] },
  { month: 10, names: ["november", "nov"] },
  { month: 11, names: ["december", "dec"] }
];

const DEFAULT_AVAILABILITY_PROMPTS: Required<AvailabilityPromptTemplates> = {
  availabilityExactSlotAvailable: "{{time}} ka slot available hai.",
  availabilitySlotAvailable: "{{day}} {{timeContext}}{{slot}} ka slot available hai.",
  availabilityTimeFull: "{{requestedTime}} available nahi hai. {{alternativeFrame}}. Kaunsa rakh doon?",
  availabilityAlternativeSameBucket: "{{slot1}} aur {{slot2}} available hain",
  availabilityAlternativeDifferentBucket: "{{slot1}} {{bucket1}} mein hai aur {{slot2}} thoda baad mein hoga",
  availabilityDayUnavailableWithNext: "{{day}} ko doctor available nahi hain. {{nextDay}} mein {{slotPreview}} mil sakta hai. {{nextDay}} dekh loon?",
  availabilityDayUnavailableNoNext: "{{day}} ko doctor available nahi hain. Kisi aur doctor ka slot dekh loon?",
  availabilitySlotsFullWithNext: "{{day}} ke slots full hain. {{nextDay}} mein {{slotPreview}} mil sakta hai. Wahi dekh loon?",
  availabilitySlotsFullNoNext: "{{day}} ke slots full hain. Kisi aur doctor ka slot dekh loon?",
  availabilityBookingDisabled: "{{doctor}} ke liye booking abhi reception se confirm hogi. Main connect kar sakti hoon."
};

function renderPrompt(template: string, values: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => String(values[key] ?? "")).replace(/\s+/g, " ").trim();
}

function resolvePrompts(prompts?: AvailabilityPromptTemplates | null): Required<AvailabilityPromptTemplates> {
  return {
    ...DEFAULT_AVAILABILITY_PROMPTS,
    ...(prompts ?? {})
  };
}

function normalizeDay(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return DAY_ORDER.find((day) => normalized.includes(day)) ?? null;
}

function dateKeyFromText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)))
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/[,\u0964]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;

  const monthMatch = MONTHS
    .flatMap((entry) => entry.names.map((name) => ({ month: entry.month, name })))
    .find((entry) => new RegExp(`\\b${entry.name}\\b`, "i").test(normalized));

  if (monthMatch) {
    const afterDay = normalized.match(new RegExp(`\\b${monthMatch.name}\\s+(\\d{1,2})(?:\\s+(\\d{4}))?\\b`, "i"));
    const beforeDay = normalized.match(new RegExp(`\\b(\\d{1,2})\\s+${monthMatch.name}(?:\\s+(\\d{4}))?\\b`, "i"));
    const match = beforeDay ?? afterDay;
    const year = Number(match?.[2] ?? new Date().getFullYear());
    const day = Number(match?.[1]);
    if (day > 0) {
      const parsed = new Date(year, monthMatch.month, day);
      if (parsed.getFullYear() === year && parsed.getMonth() === monthMatch.month && parsed.getDate() === day) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
      }
    }
  }

  const numericDate = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numericDate) {
    const day = Number(numericDate[1]);
    const month = Number(numericDate[2]) - 1;
    const rawYear = Number(numericDate[3] ?? new Date().getFullYear());
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const parsed = new Date(year, month, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    }
  }

  return null;
}

function parseMinutes(value: string | null | undefined): number | null {
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

function formatSlot(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function timeBucket(slot: string): "morning" | "afternoon" | "evening" | null {
  const minutes = parseMinutes(slot);
  if (minutes === null) return null;
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
}

function isExactTime(value: string | null | undefined): boolean {
  return parseMinutes(value) !== null && !["morning", "afternoon", "evening"].includes(String(value ?? "").toLowerCase());
}

function generateSlots(dayConfig: NonNullable<AvailabilityRuntimeDoctor["availability"]>[number], durationMinutes: number): string[] {
  const start = parseMinutes(dayConfig.start);
  const end = parseMinutes(dayConfig.end);

  if (start === null || end === null || end <= start) {
    return [];
  }

  const slots: string[] = [];
  for (let cursor = start; cursor + durationMinutes <= end; cursor += durationMinutes) {
    slots.push(formatSlot(cursor));
  }
  return slots;
}

function appointmentMatchesDoctor(appointment: AppointmentSnapshot, doctor: AvailabilityRuntimeDoctor): boolean {
  if (appointment.doctorId && appointment.doctorId === doctor.doctorId) return true;
  if (appointment.doctorName && appointment.doctorName.toLowerCase() === doctor.name.toLowerCase()) return true;
  return false;
}

function occupiedSlotsForDay(doctor: AvailabilityRuntimeDoctor, day: string, appointments: AppointmentSnapshot[], candidateSlots: string[], requestedDateKey?: string | null): Set<string> {
  const occupied = new Set<string>();
  const fallbackByBucket = new Map<string, string[]>();

  for (const slot of candidateSlots) {
    const bucket = timeBucket(slot);
    if (!bucket) continue;
    fallbackByBucket.set(bucket, [...(fallbackByBucket.get(bucket) ?? []), slot]);
  }

  for (const appointment of appointments) {
    if (!appointmentMatchesDoctor(appointment, doctor) || String(appointment.status ?? "booked").toLowerCase() === "cancelled") {
      continue;
    }

    const appointmentText = String(appointment.appointmentDate ?? "").toLowerCase();
    if (!appointmentText.includes(day)) {
      continue;
    }
    const appointmentDateKey = dateKeyFromText(appointmentText);
    if (requestedDateKey && appointmentDateKey && appointmentDateKey !== requestedDateKey) {
      continue;
    }

    const exactSlot = candidateSlots.find((slot) => appointmentText.includes(slot.toLowerCase()));
    if (exactSlot) {
      occupied.add(exactSlot);
      continue;
    }

    const bucket = ["morning", "afternoon", "evening"].find((item) => appointmentText.includes(item));
    const firstBucketSlot = bucket ? fallbackByBucket.get(bucket)?.find((slot) => !occupied.has(slot)) : null;
    if (firstBucketSlot) {
      occupied.add(firstBucketSlot);
    }
  }

  return occupied;
}

function filterSlotsByPreference(slots: string[], requestedTime: string | null | undefined): string[] {
  const time = String(requestedTime ?? "").toLowerCase();
  if (!time) return slots;

  if (["morning", "afternoon", "evening"].includes(time)) {
    return slots.filter((slot) => timeBucket(slot) === time);
  }

  const requestedMinutes = parseMinutes(time);
  if (requestedMinutes === null) return slots;
  return slots.filter((slot) => parseMinutes(slot) === requestedMinutes);
}

function nextAvailableDay(
  doctor: AvailabilityRuntimeDoctor,
  requestedDay: string,
  appointments: AppointmentSnapshot[],
  durationMinutes: number
): { day: string; slots: string[] } | null {
  const startIndex = DAY_ORDER.indexOf(requestedDay);
  const orderedDays = [...DAY_ORDER.slice(startIndex + 1), ...DAY_ORDER.slice(0, startIndex + 1)];

  for (const day of orderedDays) {
    const dayConfig = doctor.availability?.find((item) => normalizeDay(item.day) === day);
    if (!dayConfig || dayConfig.blocked || dayConfig.leave) continue;

    const slots = generateSlots(dayConfig, durationMinutes);
    const occupied = occupiedSlotsForDay(doctor, day, appointments, slots);
    const free = slots.filter((slot) => !occupied.has(slot));

    if (free.length > 0) {
      return { day, slots: free };
    }
  }

  return null;
}

function listPreview(slots: string[]): string {
  return slots.slice(0, 2).join(" aur ");
}

function requestedTimeLabel(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  if (!text) return "us time";
  if (["morning", "afternoon", "evening"].includes(text.toLowerCase())) return `${text} ka`;
  return `${text} ka`;
}

function frameAlternativeSlots(slots: string[], prompts: Required<AvailabilityPromptTemplates>): string {
  const visible = slots.slice(0, 2);
  if (visible.length <= 1) {
    return visible[0] ? `${visible[0]} available hai` : "dusra slot available hai";
  }

  const firstBucket = timeBucket(visible[0]);
  const secondBucket = timeBucket(visible[1]);

  if (firstBucket && secondBucket && firstBucket !== secondBucket) {
    return renderPrompt(prompts.availabilityAlternativeDifferentBucket, {
      slot1: visible[0],
      slot2: visible[1],
      bucket1: firstBucket,
      bucket2: secondBucket
    });
  }

  return renderPrompt(prompts.availabilityAlternativeSameBucket, {
    slot1: visible[0],
    slot2: visible[1],
    bucket1: firstBucket,
    bucket2: secondBucket
  });
}

export function resolveAvailability(input: {
  doctor: AvailabilityRuntimeDoctor | null;
  requestedDay: string | null | undefined;
  requestedTime: string | null | undefined;
  appointments: AppointmentSnapshot[];
  slotDurationMinutes?: number;
  prompts?: AvailabilityPromptTemplates | null;
}): AvailabilityResolution | null {
  const doctor = input.doctor;
  const requestedDay = normalizeDay(input.requestedDay);
  const requestedTime = input.requestedTime ?? null;
  const requestedDateKey = dateKeyFromText(input.requestedDay);
  const durationMinutes = input.slotDurationMinutes ?? 90;
  const prompts = resolvePrompts(input.prompts);

  if (!doctor || !requestedDay) {
    return null;
  }

  const checkKey = [doctor.doctorId, requestedDay, requestedTime ?? "any"].join("|").toLowerCase();

  if (doctor.botSettings?.bookingEnabled === false) {
    return {
      status: "booking_disabled",
      checkKey,
      reply: renderPrompt(prompts.availabilityBookingDisabled, { doctor: doctor.name }),
      offeredSlots: []
    };
  }

  const dayConfig = doctor.availability?.find((item) => normalizeDay(item.day) === requestedDay);
  if (!dayConfig || dayConfig.blocked || dayConfig.leave) {
    const next = nextAvailableDay(doctor, requestedDay, input.appointments, durationMinutes);
    return {
      status: "day_unavailable",
      checkKey,
      reply: next
        ? renderPrompt(prompts.availabilityDayUnavailableWithNext, {
            day: requestedDay,
            nextDay: next.day,
            slotPreview: listPreview(next.slots)
          })
        : renderPrompt(prompts.availabilityDayUnavailableNoNext, { day: requestedDay }),
      offeredDate: next?.day,
      offeredTime: next?.slots[0],
      offeredSlots: next?.slots.slice(0, 2) ?? []
    };
  }

  const slots = generateSlots(dayConfig, durationMinutes);
  const occupied = occupiedSlotsForDay(doctor, requestedDay, input.appointments, slots, requestedDateKey);
  const freeSlots = slots.filter((slot) => !occupied.has(slot));
  const matchingSlots = filterSlotsByPreference(freeSlots, requestedTime);

  if (matchingSlots.length > 0) {
    const selectedTime = isExactTime(requestedTime) ? requestedTime! : matchingSlots[0];
    return {
      status: "available",
      checkKey,
      reply: isExactTime(requestedTime)
        ? renderPrompt(prompts.availabilityExactSlotAvailable, { time: requestedTime })
        : renderPrompt(prompts.availabilitySlotAvailable, {
            day: requestedDay,
            timeContext: requestedTime ? `${requestedTime} mein ` : "",
            slot: matchingSlots[0],
            slotPreview: listPreview(matchingSlots)
          }),
      selectedDate: requestedDay,
      selectedTime,
      offeredSlots: matchingSlots.slice(0, 2)
    };
  }

  if (requestedTime) {
    const alternative = freeSlots.slice(0, 2);
    if (alternative.length > 0) {
      return {
        status: "time_full",
        checkKey,
        reply: renderPrompt(prompts.availabilityTimeFull, {
          requestedTime: requestedTimeLabel(requestedTime),
          alternativeFrame: frameAlternativeSlots(alternative, prompts),
          slotPreview: listPreview(alternative),
          slot1: alternative[0],
          slot2: alternative[1]
        }),
        offeredDate: requestedDay,
        offeredTime: alternative[0],
        offeredSlots: alternative
      };
    }
  }

  const next = nextAvailableDay(doctor, requestedDay, input.appointments, durationMinutes);
  return {
    status: "day_unavailable",
    checkKey,
    reply: next
      ? renderPrompt(prompts.availabilitySlotsFullWithNext, {
          day: requestedDay,
          nextDay: next.day,
          slotPreview: listPreview(next.slots)
        })
      : renderPrompt(prompts.availabilitySlotsFullNoNext, { day: requestedDay }),
    offeredDate: next?.day,
    offeredTime: next?.slots[0],
    offeredSlots: next?.slots.slice(0, 2) ?? []
  };
}

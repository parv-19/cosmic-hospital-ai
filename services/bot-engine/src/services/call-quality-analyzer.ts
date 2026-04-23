import type {
  CallQualityIssue,
  CallQualitySeverity,
  CallQualitySummary,
  CallQualityTrace,
  DemoSessionRecord
} from "../repositories/call-repository";

const MAX_TRACE_EVENTS = 80;

const TRACKED_FIELDS: Array<keyof DemoSessionRecord> = [
  "callStatus",
  "bookingStage",
  "latestIntent",
  "selectedSpecialization",
  "selectedDoctor",
  "doctorPreference",
  "preferredDate",
  "preferredTime",
  "patientName",
  "patientType",
  "contactNumber",
  "availabilityCheckKey",
  "availabilityOfferedDate",
  "availabilityOfferedTime",
  "reschedule_new_day",
  "bookingResult"
];

const WEEKDAY_ONLY_PATTERN = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
const ENGLISH_WEEKDAY_PATTERN = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const ABSOLUTE_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i;
const NEXT_WORD_PATTERN = /\b(next|upcoming|coming|agle|agla|agli|aagle|aagla)\b|આવતા|આગામી|નેક્સ્ટ|अगले|अगला|आने\s*वाले/i;
const GUJARATI_PATTERN = /[\u0A80-\u0AFF]/u;
const HINDI_PATTERN = /[\u0900-\u097F]/u;
const MIXED_CONNECTOR_PATTERN = /\b(ko|ya|par)\b/i;
const REPROMPT_ACTION_PATTERN = /(?:reprompt|fallback|clarify|silence_retry)/i;
const FINAL_ACTION_PATTERN = /(?:confirm_booking|reschedule_confirm|confirm_reschedule|cancel_confirm|confirm_cancel|cancel_appointment)/i;

type AnalyzeInput = {
  before: DemoSessionRecord;
  after: DemoSessionRecord;
  callerText: string;
  botReply: string;
  action: string;
  intent: string;
};

export function appendCallQualityTrace(input: AnalyzeInput): Pick<DemoSessionRecord, "qualityTrace" | "qualitySummary"> {
  const previousTrace = input.after.qualityTrace ?? input.before.qualityTrace ?? [];
  const trace = buildTrace(input, previousTrace.length + 1);
  const qualityTrace = [...previousTrace, trace].slice(-MAX_TRACE_EVENTS);

  return {
    qualityTrace,
    qualitySummary: summarizeTrace(qualityTrace)
  };
}

function buildTrace(input: AnalyzeInput, turn: number): CallQualityTrace {
  const sessionDiff = diffSession(input.before, input.after);
  const issues = detectIssues(input, sessionDiff);

  return {
    turn,
    callerText: input.callerText,
    botReply: input.botReply,
    beforeStage: input.before.bookingStage,
    afterStage: input.after.bookingStage,
    action: input.action,
    intent: input.intent,
    sessionDiff,
    issues,
    createdAt: new Date().toISOString()
  };
}

function diffSession(before: DemoSessionRecord, after: DemoSessionRecord): CallQualityTrace["sessionDiff"] {
  const diff: CallQualityTrace["sessionDiff"] = {};

  for (const field of TRACKED_FIELDS) {
    const beforeValue = scalarize(before[field]);
    const afterValue = scalarize(after[field]);

    if (beforeValue !== afterValue) {
      diff[String(field)] = { before: beforeValue, after: afterValue };
    }
  }

  return diff;
}

function detectIssues(input: AnalyzeInput, sessionDiff: CallQualityTrace["sessionDiff"]): CallQualityIssue[] {
  const issues: CallQualityIssue[] = [];
  const callerText = input.callerText.trim();
  const reply = input.botReply.trim();
  const dateCandidate = input.after.reschedule_new_day ?? input.after.preferredDate ?? input.after.availabilityOfferedDate ?? null;
  const finalAppointmentDate = input.after.reschedule_new_day ?? input.after.preferredDate ?? input.after.bookingResult ?? null;

  if (hasRelativeNextWeekday(callerText) && isWeekdayOnly(dateCandidate)) {
    issues.push({
      code: "calendar_absolute_date_lost",
      severity: "high",
      message: "Caller asked for a relative weekday, but the session retained only the weekday name.",
      evidence: {
        callerText,
        storedDate: dateCandidate,
        stage: input.after.bookingStage,
        action: input.action
      },
      suggestion: "Resolve phrases such as next Thursday/aavta guruvare/agle guruvar to an absolute date before checking slots or confirming."
    });
  }

  if ((FINAL_ACTION_PATTERN.test(input.action) || ["booked", "rescheduled"].includes(input.after.bookingStage)) && isWeekdayOnly(finalAppointmentDate)) {
    issues.push({
      code: "unsafe_weekday_only_booking",
      severity: "high",
      message: "A booking or reschedule reached confirmation while the stored date still looked weekday-only.",
      evidence: {
        storedDate: finalAppointmentDate,
        stage: input.after.bookingStage,
        action: input.action
      },
      suggestion: "Block final confirmation when appointment date has no absolute calendar date."
    });
  }

  if (isRepeatedPrompt(input.before, input.after, reply)) {
    issues.push({
      code: "repeated_prompt_same_stage",
      severity: "medium",
      message: "The same bot prompt repeated while the conversation stayed in the same stage.",
      evidence: {
        stage: input.after.bookingStage,
        action: input.action,
        reply
      },
      suggestion: "Use recovery prompts that explain what value is missing, or accept common STT variants for that field."
    });
  }

  if (REPROMPT_ACTION_PATTERN.test(input.action) && Object.keys(sessionDiff).length === 0) {
    issues.push({
      code: "no_progress_reprompt",
      severity: "medium",
      message: "The turn produced a reprompt without any tracked session progress.",
      evidence: {
        callerText,
        action: input.action,
        stage: input.after.bookingStage
      },
      suggestion: "Capture the rejected entity or add a targeted clarification reason for later prompt tuning."
    });
  }

  if (isMixedLanguageReply(callerText, reply)) {
    issues.push({
      code: "mixed_language_reply",
      severity: "low",
      message: "Bot reply mixed local-language script with English/Hinglish connector words.",
      evidence: {
        callerText,
        reply
      },
      suggestion: "Render weekday names and connector words through the configured prompt language."
    });
  }

  return dedupeIssues(issues);
}

function summarizeTrace(trace: CallQualityTrace[]): CallQualitySummary {
  const issues = trace.flatMap((event) => event.issues);
  const highIssueCount = issues.filter((issue) => issue.severity === "high").length;
  const severity = maxSeverity(issues.map((issue) => issue.severity));
  const tags = Array.from(new Set(issues.map((issue) => issue.code))).slice(0, 20);
  const penalty = issues.reduce((total, issue) => total + severityPenalty(issue.severity), 0);

  return {
    score: Math.max(0, 100 - penalty),
    severity,
    issueCount: issues.length,
    highIssueCount,
    tags,
    updatedAt: trace[trace.length - 1]?.createdAt ?? null
  };
}

function hasRelativeNextWeekday(text: string): boolean {
  return NEXT_WORD_PATTERN.test(text) && (ENGLISH_WEEKDAY_PATTERN.test(text) || /ગુરુવાર|સોમવાર|મંગળવાર|બુધવાર|શુક્રવાર|શનિવાર|રવિવાર|गुरुवार|सोमवार|मंगलवार|बुधवार|शुक्रवार|शनिवार|रविवार/i.test(text));
}

function isWeekdayOnly(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return WEEKDAY_ONLY_PATTERN.test(normalized) || (!ABSOLUTE_DATE_PATTERN.test(normalized) && /^(ગુરુવાર|સોમવાર|મંગળવાર|બુધવાર|શુક્રવાર|શનિવાર|રવિવાર|गुरुवार|सोमवार|मंगलवार|बुधवार|शुक्रवार|शनिवार|रविवार)$/i.test(normalized));
}

function isRepeatedPrompt(before: DemoSessionRecord, after: DemoSessionRecord, reply: string): boolean {
  const lastReply = before.botResponseHistory.at(-1)?.text?.trim();
  return Boolean(lastReply && lastReply === reply.trim() && before.bookingStage === after.bookingStage);
}

function isMixedLanguageReply(callerText: string, reply: string): boolean {
  const localScript = GUJARATI_PATTERN.test(callerText) || GUJARATI_PATTERN.test(reply) || HINDI_PATTERN.test(callerText) || HINDI_PATTERN.test(reply);
  return localScript && (MIXED_CONNECTOR_PATTERN.test(reply) || ENGLISH_WEEKDAY_PATTERN.test(reply));
}

function dedupeIssues(issues: CallQualityIssue[]): CallQualityIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.code)) return false;
    seen.add(issue.code);
    return true;
  });
}

function maxSeverity(severities: CallQualitySeverity[]): CallQualitySeverity {
  if (severities.includes("high")) return "high";
  if (severities.includes("medium")) return "medium";
  if (severities.includes("low")) return "low";
  return "info";
}

function severityPenalty(severity: CallQualitySeverity): number {
  if (severity === "high") return 25;
  if (severity === "medium") return 12;
  if (severity === "low") return 4;
  return 0;
}

function scalarize(value: unknown): string | null {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}

import React, { useEffect, useState, useCallback } from "react";
import { fetchSettings, updateSettings, type SettingsRecord } from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { Card, CardHeader } from "../../ui/Card";
import { Button } from "../../ui/Button";
import { PageLoader } from "../../ui/Spinner";

type Prompts = NonNullable<SettingsRecord["conversationPrompts"]>;

const PROMPT_FIELDS: Array<{ key: keyof Prompts; label: string; description: string }> = [
  { key: "askSpecialization",      label: "Ask Specialization",       description: "When bot asks the caller which specialty they need" },
  { key: "askDoctorPreference",    label: "Ask Doctor Preference",    description: "When bot asks if they have a preferred doctor" },
  { key: "askDate",                label: "Ask Appointment Date",     description: "When bot asks for preferred appointment date" },
  { key: "askTime",                label: "Ask Appointment Time",     description: "When bot asks for preferred appointment time" },
  { key: "askPatientName",         label: "Ask Patient Name",         description: "When bot asks for the patient's name" },
  { key: "askMobile",              label: "Ask Mobile Number",        description: "When bot asks for contact number" },
  { key: "askPatientType",         label: "Ask Patient Type",         description: "New or existing patient" },
  { key: "confirmPrefix",          label: "Confirm Prefix",           description: "Text before confirming the booking summary" },
  { key: "bookingConfirmed",       label: "Booking Confirmed",        description: "Message when booking is successful" },
  { key: "bookingCancelled",       label: "Booking Cancelled",        description: "Message when booking is cancelled by bot" },
  { key: "bookingAlreadyComplete", label: "Already Booked",           description: "When patient already has an appointment" },
  { key: "bookingAlreadyCancelled",label: "Already Cancelled",        description: "When appointment was already cancelled" },
  { key: "transferMessage",        label: "Transfer Message",         description: "Spoken when transferring the call" },
  { key: "goodbyeMessage",         label: "Goodbye Message",          description: "Final message before ending the call" },
  { key: "confirmRememberedDoctor", label: "Remembered Doctor Confirm", description: "Uses {{doctor}} when the bot remembers the last doctor" },
  { key: "confirmRememberedDay",    label: "Remembered Day Confirm",    description: "Uses {{day}} when the bot remembers the last appointment day" },
  { key: "callerNumberConfirmation",label: "Caller Number Confirm",     description: "Uses {{maskedNumber}} and {{number}} for current caller number confirmation" },
  { key: "callerReuseConfirmation", label: "Returning Caller Reuse",    description: "Uses {{maskedNumber}} and {{number}} for previous caller details reuse" },
  { key: "silenceRetryWithSlots",   label: "Silence Retry With Slots",  description: "Uses {{slotChoices}} when caller is quiet after slot options" },
  { key: "silenceRetryDate",        label: "Silence Retry Date",        description: "Uses {{day}} when caller is quiet during date confirmation" },
  { key: "silenceRetryDoctor",      label: "Silence Retry Doctor",      description: "Uses {{doctor}} when caller is quiet during doctor confirmation" },
  { key: "silenceRetryGeneric",     label: "Silence Retry Generic",     description: "Uses {{stagePrompt}} for general no-response retry" },
  { key: "recoverySpecialization",  label: "Recovery Specialization",   description: "Uses {{specializations}} when doctor or department is unclear" },
  { key: "recoveryTimeWithSlots",   label: "Recovery Time With Slots",  description: "Uses {{slotChoices}} when time input is unclear after slot options" },
  { key: "recoveryTimeGeneric",     label: "Recovery Time Generic",     description: "When time input is unclear and no slots were suggested" },
  { key: "recoveryDateWithMemory",  label: "Recovery Date With Memory", description: "Uses {{day}} when date input is unclear but a day is remembered" },
  { key: "recoveryDateGeneric",     label: "Recovery Date Generic",     description: "When date input is unclear" },
  { key: "recoveryDoctorWithMemory",label: "Recovery Doctor Memory",    description: "Uses {{doctor}} when doctor choice is unclear but remembered" },
  { key: "recoveryPatientName",     label: "Recovery Patient Name",     description: "When patient name is unclear" },
  { key: "recoveryMobile",          label: "Recovery Mobile",           description: "When mobile number is unclear" },
  { key: "recoveryConfirmation",    label: "Recovery Confirmation",     description: "When final yes/no confirmation is unclear" },
  { key: "availabilityExactSlotAvailable", label: "Exact Slot Available", description: "Uses {{time}} when requested exact time is open" },
  { key: "availabilitySlotAvailable",      label: "Slot Available",       description: "Uses {{day}}, {{timeContext}}, {{slot}}, {{slotPreview}}" },
  { key: "availabilityTimeFull",           label: "Requested Time Full",  description: "Uses {{requestedTime}}, {{alternativeFrame}}, {{slotPreview}}, {{slot1}}, {{slot2}}" },
  { key: "availabilityAlternativeSameBucket", label: "Alternative Slots Same Period", description: "Uses {{slot1}}, {{slot2}}, {{bucket1}}, {{bucket2}}" },
  { key: "availabilityAlternativeDifferentBucket", label: "Alternative Slots Different Period", description: "Uses {{slot1}}, {{slot2}}, {{bucket1}}, {{bucket2}}" },
  { key: "availabilityDayUnavailableWithNext", label: "Day Unavailable With Next", description: "Uses {{day}}, {{nextDay}}, {{slotPreview}}" },
  { key: "availabilityDayUnavailableNoNext",   label: "Day Unavailable No Next",   description: "Uses {{day}} when no next slot exists" },
  { key: "availabilitySlotsFullWithNext",      label: "Slots Full With Next",      description: "Uses {{day}}, {{nextDay}}, {{slotPreview}}" },
  { key: "availabilitySlotsFullNoNext",        label: "Slots Full No Next",        description: "Uses {{day}} when doctor has no free slot" },
  { key: "availabilityBookingDisabled",        label: "Booking Disabled",          description: "Uses {{doctor}} when booking is off for that doctor" },
  { key: "rescheduleNoActiveBooking",          label: "Reschedule No Booking",     description: "When caller asks to reschedule but no active booking is found" },
  { key: "rescheduleFoundBooking",             label: "Reschedule Found Booking",  description: "Uses {{appointment}} before asking for a new day" },
  { key: "rescheduleAskNewDay",                label: "Reschedule Ask Day",        description: "When bot asks for the new appointment day" },
  { key: "rescheduleMissingBooking",           label: "Reschedule Missing Booking",description: "When booking details cannot be resolved" },
  { key: "rescheduleBookingDisabled",          label: "Reschedule Disabled",       description: "Uses {{doctor}} when reschedule needs reception" },
  { key: "rescheduleSlotsAvailable",           label: "Reschedule Slots Available",description: "Uses {{availabilityReply}} and {{slotChoices}}" },
  { key: "rescheduleAskSlot",                  label: "Reschedule Ask Slot",       description: "Uses {{slotChoices}} when asking for a new slot" },
  { key: "rescheduleConfirm",                  label: "Reschedule Confirm",        description: "Uses {{day}}, {{slot}}, {{doctor}}" },
  { key: "rescheduleFinal",                    label: "Reschedule Final",          description: "Uses {{day}}, {{slot}}, {{doctor}}, {{reference}}" },
  { key: "rescheduleDeclined",                 label: "Reschedule Declined",       description: "When caller declines the reschedule" },
  { key: "rescheduleAlreadyComplete",          label: "Already Rescheduled",       description: "When reschedule was already completed" },
  { key: "cancelNoActiveBooking",              label: "Cancel No Booking",         description: "When caller asks to cancel but no active booking is found" },
  { key: "cancelConfirm",                      label: "Cancel Confirm",            description: "Uses {{appointment}} before cancelling" },
  { key: "cancelDeclined",                     label: "Cancel Declined",           description: "When caller declines cancellation" },
  { key: "cancelMissingBooking",               label: "Cancel Missing Booking",    description: "When booking details cannot be resolved" },
  { key: "cancelFinal",                        label: "Cancel Final",              description: "Uses {{appointment}} and {{reference}}" },
  { key: "extraInstructions",      label: "Extra Instructions",       description: "Additional instructions for the AI bot" },
];

const TOP_LEVEL: Array<{ key: keyof SettingsRecord; label: string; description: string }> = [
  { key: "greetingMessage",   label: "Greeting Message",    description: "First message the bot says when a call connects" },
  { key: "afterHoursMessage", label: "After Hours Message", description: "Played when caller calls outside business hours" },
  { key: "fallbackResponse",  label: "Fallback Response",   description: "When bot cannot understand the caller" },
  { key: "emergencyMessage",  label: "Emergency Message",   description: "Played for emergency situations" },
];

export function PromptsPage() {
  const { token } = useAuth();
  const [records, setRecords] = useState<SettingsRecord[]>([]);
  const [selected, setSelected] = useState<SettingsRecord | null>(null);
  const [topLevel, setTopLevel] = useState<Partial<Record<keyof SettingsRecord, string>>>({});
  const [prompts, setPrompts]   = useState<Partial<Prompts>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchSettings(token);
      setRecords(data);
      if (data.length > 0) {
        setSelected(data[0]);
        applyRecord(data[0]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load prompts.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  function applyRecord(r: SettingsRecord) {
    setSelected(r);
    setTopLevel({
      greetingMessage:   r.greetingMessage ?? "",
      afterHoursMessage: r.afterHoursMessage ?? "",
      fallbackResponse:  r.fallbackResponse ?? "",
      emergencyMessage:  r.emergencyMessage ?? "",
    } as Partial<Record<keyof SettingsRecord, string>>);
    setPrompts({ ...(r.conversationPrompts ?? {}) });
    setSaved(false);
  }

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!token || !selected) return;
    setSaving(true);
    setError("");
    try {
      await updateSettings(token, {
        doctorId: selected.doctorId,
        ...topLevel,
        conversationPrompts: prompts,
      } as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {/* Doctor selector */}
      {records.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {records.map((r) => (
            <button
              key={r.doctorId}
              onClick={() => applyRecord(r)}
              className={`text-sm px-4 py-2 rounded-lg border transition-all ${selected?.doctorId === r.doctorId ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"}`}
            >
              {r.doctorName || r.doctorId}
            </button>
          ))}
        </div>
      )}

      {/* Top-level messages */}
      <Card>
        <CardHeader title="Core Messages" subtitle="Key messages spoken by the AI bot" />
        <div className="space-y-5">
          {TOP_LEVEL.map(({ key, label, description }) => (
            <div key={key as string}>
              <label className="block text-xs font-medium text-slate-700 mb-0.5">{label}</label>
              <p className="text-[11px] text-slate-400 mb-1.5">{description}</p>
              <textarea
                id={`prompt-${key as string}`}
                rows={2}
                value={(topLevel[key] as string) ?? ""}
                onChange={(e) => setTopLevel((t) => ({ ...t, [key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Conversation prompts */}
      <Card>
        <CardHeader title="Conversation Flow Prompts" subtitle="Messages used during the booking flow" />
        <div className="space-y-5">
          {PROMPT_FIELDS.map(({ key, label, description }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-700 mb-0.5">{label}</label>
              <p className="text-[11px] text-slate-400 mb-1.5">{description}</p>
              <textarea
                id={`prompt-${key}`}
                rows={2}
                value={(prompts[key] as string) ?? ""}
                onChange={(e) => setPrompts((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Save bar */}
      <div className="sticky bottom-4 flex items-center justify-between bg-white border border-slate-200 rounded-xl shadow-card px-5 py-3">
        <div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {saved && <p className="text-xs text-emerald-600 font-medium">✓ Prompts saved successfully</p>}
        </div>
        <Button id="save-prompts" variant="primary" loading={saving} onClick={handleSave}>
          Save Prompts
        </Button>
      </div>
    </div>
  );
}

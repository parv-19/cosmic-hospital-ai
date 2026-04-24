import React, { useEffect, useState, useCallback } from "react";
// THEMED: settings exposes existing backed config only.
import { fetchSettings, updateSettings, type SettingsRecord } from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { Card, CardHeader } from "../../ui/Card";
import { Button } from "../../ui/Button";
import { PageLoader } from "../../ui/Spinner";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DEFAULT_AVAILABILITY = [
  { day: "Monday", start: "09:00", end: "17:00", blocked: false, leave: false },
  { day: "Tuesday", start: "09:00", end: "17:00", blocked: false, leave: false },
  { day: "Wednesday", start: "09:00", end: "17:00", blocked: false, leave: false },
  { day: "Thursday", start: "09:00", end: "17:00", blocked: false, leave: false },
  { day: "Friday", start: "09:00", end: "17:00", blocked: false, leave: false },
  { day: "Saturday", start: "10:00", end: "14:00", blocked: false, leave: false },
];

type AvailabilitySlot = SettingsRecord["availability"][number];

function normalizeAvailability(slots: SettingsRecord["availability"] | undefined): AvailabilitySlot[] {
  return slots && slots.length > 0 ? slots : DEFAULT_AVAILABILITY;
}

export function SettingsPage() {
  const { token, user } = useAuth();
  const [records, setRecords] = useState<SettingsRecord[]>([]);
  const [selected, setSelected] = useState<SettingsRecord | null>(null);
  const [form, setForm]   = useState<Partial<SettingsRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState("");

  const isAdmin = user?.role === "ADMIN";
  const isDoctor = user?.role === "DOCTOR";
  const canEdit = isAdmin || isDoctor;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchSettings(token);
      setRecords(data);
      if (data.length > 0) {
        setSelected(data[0]);
        setForm({ ...data[0], availability: normalizeAvailability(data[0].availability) });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function selectRecord(r: SettingsRecord) {
    setSelected(r);
    setForm({ ...r, availability: normalizeAvailability(r.availability) });
    setSaved(false);
  }

  async function handleSave() {
    if (!token || !form) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await updateSettings(token, form as Record<string, unknown>);
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function updateAvailability(index: number, field: string, value: string | boolean) {
    const avail = [...normalizeAvailability(form.availability)];
    avail[index] = { ...avail[index], [field]: value };
    setForm((f) => ({ ...f, availability: avail }));
  }

  function addAvailabilityDay() {
    const current = normalizeAvailability(form.availability);
    const nextDay = DAYS.find((day) => !current.some((slot) => slot.day === day));
    if (!nextDay) return;
    setForm((f) => ({
      ...f,
      availability: [
        ...current,
        { day: nextDay, start: "09:00", end: "17:00", blocked: false, leave: false }
      ]
    }));
  }

  function deleteAvailability(index: number) {
    const current = normalizeAvailability(form.availability);
    setForm((f) => ({ ...f, availability: current.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function resetDefaultAvailability() {
    setForm((f) => ({ ...f, availability: DEFAULT_AVAILABILITY }));
  }

  if (loading) return <PageLoader />;
  if (error && records.length === 0) return <div className="text-red-500 text-sm p-4">{error}</div>;

  return (
    <div className="space-y-6">
      {/* Doctor selector if multiple */}
      {records.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {records.map((r) => (
            <button
              key={r.doctorId}
              onClick={() => selectRecord(r)}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition-all ${selected?.doctorId === r.doctorId ? "border-sky-400/40 bg-[linear-gradient(135deg,#38bdf8_0%,#2563eb_100%)] text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)]" : "border-white/90 bg-white/80 text-slate-600 shadow-[0_10px_24px_rgba(148,163,184,0.10)] hover:border-sky-200 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:shadow-none dark:hover:border-sky-500/40 dark:hover:bg-slate-800 dark:hover:text-sky-200"}`}
            >
              {r.doctorName || r.doctorId}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bot Identity */}
        <Card>
          <CardHeader title="Bot Identity" subtitle="Basic doctor and clinic info" />
          <div className="space-y-4">
            <Field label="Doctor Name" value={form.doctorName ?? ""} onChange={(v) => setForm((f) => ({ ...f, doctorName: v }))} disabled={!canEdit} />
          </div>
        </Card>

        {/* Language & Transfer */}
        <Card>
          <CardHeader title="Language & Routing" />
          <div className="space-y-4">
            <Field label="Language Code" value={form.language ?? ""} onChange={(v) => setForm((f) => ({ ...f, language: v }))} disabled={!canEdit} placeholder="e.g. en-IN" />
            <Field label="Transfer Number" value={form.transferNumber ?? ""} onChange={(v) => setForm((f) => ({ ...f, transferNumber: v }))} disabled={!canEdit} />
            <div className="flex items-center gap-3 pt-1">
              <input
                id="booking-enabled"
                type="checkbox"
                disabled={!canEdit}
                checked={form.bookingEnabled ?? false}
                onChange={(e) => setForm((f) => ({ ...f, bookingEnabled: e.target.checked }))}
                className="w-4 h-4 accent-indigo-600"
              />
              <label htmlFor="booking-enabled" className="text-sm text-slate-700">Booking Enabled</label>
            </div>
          </div>
        </Card>

        {/* Fee */}
        <Card>
          <CardHeader title="Consultation Fee" />
          <div className="space-y-4">
            <Field label="Fee (₹)" value={String(form.fee ?? "")} type="number" onChange={(v) => setForm((f) => ({ ...f, fee: parseFloat(v) || null }))} disabled={!canEdit} />
            <Field label="Schedule Label" value={form.scheduleLabel ?? ""} onChange={(v) => setForm((f) => ({ ...f, scheduleLabel: v }))} disabled={!canEdit} placeholder="e.g. Mon-Sat, 9am-5pm" />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Business Hours"
          subtitle="Add, edit, block, or remove doctor availability"
          action={canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={resetDefaultAvailability}>Use Default Hours</Button>
              <Button variant="primary" size="sm" onClick={addAvailabilityDay} disabled={normalizeAvailability(form.availability).length >= DAYS.length}>Add Day</Button>
            </div>
          ) : undefined}
        />
        {normalizeAvailability(form.availability).length === 0 ? (
          <p className="text-sm text-slate-400">No business hours configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700/80">
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-300">Day</th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-300">Start</th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-300">End</th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-300">Blocked</th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-300">Leave</th>
                  <th className="pb-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-300">Action</th>
                </tr>
              </thead>
              <tbody className="space-y-1">
                {normalizeAvailability(form.availability).map((slot, i) => (
                  <tr key={slot.day} className="border-b border-slate-50 dark:border-slate-800">
                    <td className="whitespace-nowrap py-2 pr-4 font-medium text-slate-700 dark:text-slate-100">
                      <select
                        disabled={!canEdit}
                        value={slot.day}
                        onChange={(e) => updateAvailability(i, "day", e.target.value)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="time" disabled={!canEdit}
                        value={slot.start}
                        onChange={(e) => updateAvailability(i, "start", e.target.value)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="time" disabled={!canEdit}
                        value={slot.end}
                        onChange={(e) => updateAvailability(i, "end", e.target.value)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="checkbox" disabled={!canEdit}
                        checked={slot.blocked}
                        onChange={(e) => updateAvailability(i, "blocked", e.target.checked)}
                        className="w-4 h-4 accent-indigo-600"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="checkbox" disabled={!canEdit}
                        checked={slot.leave}
                        onChange={(e) => updateAvailability(i, "leave", e.target.checked)}
                        className="w-4 h-4 accent-amber-500"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => deleteAvailability(i)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Save Actions */}
      {canEdit && (
        <div className="flex items-center justify-between rounded-[24px] border border-white/90 bg-white/80 px-5 py-3 shadow-[0_18px_42px_rgba(148,163,184,0.14)] backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
          <div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            {saved && <p className="text-xs font-medium text-emerald-600">Settings saved successfully</p>}
          </div>
          <Button id="save-settings" variant="primary" loading={saving} onClick={handleSave}>
            Save Settings
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, disabled, type = "text", placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  disabled?: boolean; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

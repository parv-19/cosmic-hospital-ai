import React, { useEffect, useState, useCallback } from "react";
// THEMED: behaviour controls preserve existing settings persistence.
import { fetchSettings, updateSettings, type SettingsRecord } from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { Card, CardHeader } from "../../ui/Card";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { PageLoader } from "../../ui/Spinner";

export function BehaviourPage() {
  const { token, user } = useAuth();
  const [records, setRecords]     = useState<SettingsRecord[]>([]);
  const [selected, setSelected]   = useState<SettingsRecord | null>(null);
  const [bookingEnabled, setBookingEnabled] = useState(true);
  const [transferNumber, setTransferNumber] = useState("");
  const [fallbackResponse, setFallbackResponse] = useState("");
  const [fallbackPolicy, setFallbackPolicy] = useState<SettingsRecord["fallbackPolicy"]>("ask_again");
  const [intelligenceSettings, setIntelligenceSettings] = useState({
    enabled: true,
    askOnlyMissingFields: true,
    callerNumberConfirmation: true,
    languageNormalization: true,
    smartClarification: true,
    availabilityFirst: true,
    llmFallbackEnabled: true,
    confidenceThreshold: 0.7,
  });
  const [costDisplay, setCostDisplay] = useState({
    showSttCost: true,
    showTtsCost: true,
    showLlmCost: true,
    showTotalCost: true,
  });
  const [supportedIntents, setSupportedIntents] = useState<string[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState("");

  const isAdmin = user?.role === "ADMIN";

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchSettings(token);
      setRecords(data);
      if (data.length > 0) applyRecord(data[0]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load behaviour settings.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  function applyRecord(r: SettingsRecord) {
    setSelected(r);
    setBookingEnabled(r.bookingEnabled);
    setTransferNumber(r.transferNumber ?? "");
    setFallbackResponse(r.fallbackResponse ?? "");
    setFallbackPolicy(r.fallbackPolicy ?? "ask_again");
    setIntelligenceSettings({
      enabled: r.intelligenceSettings?.enabled ?? true,
      askOnlyMissingFields: r.intelligenceSettings?.askOnlyMissingFields ?? true,
      callerNumberConfirmation: r.intelligenceSettings?.callerNumberConfirmation ?? true,
      languageNormalization: r.intelligenceSettings?.languageNormalization ?? true,
      smartClarification: r.intelligenceSettings?.smartClarification ?? true,
      availabilityFirst: r.intelligenceSettings?.availabilityFirst ?? true,
      llmFallbackEnabled: r.intelligenceSettings?.llmFallbackEnabled ?? true,
      confidenceThreshold: r.intelligenceSettings?.confidenceThreshold ?? 0.7,
    });
    setCostDisplay({
      showSttCost: r.costDisplay?.showSttCost ?? true,
      showTtsCost: r.costDisplay?.showTtsCost ?? true,
      showLlmCost: r.costDisplay?.showLlmCost ?? true,
      showTotalCost: r.costDisplay?.showTotalCost ?? true,
    });
    setSupportedIntents(r.supportedIntents ?? []);
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
        bookingEnabled,
        transferNumber,
        fallbackResponse,
        fallbackPolicy,
        intelligenceSettings,
        costDisplay,
        supportedIntents,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader />;
  if (error && records.length === 0) return <div className="text-red-500 text-sm p-4">{error}</div>;

  return (
    <div className="space-y-6">
      {/* Doctor selector */}
      {records.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {records.map((r) => (
            <button
              key={r.doctorId}
              onClick={() => applyRecord(r)}
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition-all ${selected?.doctorId === r.doctorId ? "border-sky-400/40 bg-[linear-gradient(135deg,#38bdf8_0%,#2563eb_100%)] text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)]" : "border-white/90 bg-white/80 text-slate-600 shadow-[0_10px_24px_rgba(148,163,184,0.10)] hover:border-sky-200 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:shadow-none dark:hover:border-sky-500/40 dark:hover:bg-slate-800 dark:hover:text-sky-200"}`}
            >
              {r.doctorName || r.doctorId}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Booking toggle */}
        <Card>
          <CardHeader title="Booking Configuration" subtitle="Control the appointment booking behaviour" />
          <div className="space-y-4">
            <div className={`flex items-center justify-between rounded-[22px] border p-4 transition-all ${bookingEnabled ? "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(220,252,231,0.85))] dark:border-emerald-500/20 dark:bg-[linear-gradient(180deg,rgba(17,94,89,0.28),rgba(16,78,72,0.18))]" : "border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.88))] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.9),rgba(17,24,39,0.86))]"}`}>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Appointment Booking</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Allow the AI to book appointments for callers</p>
              </div>
              <button
                id="booking-toggle"
                disabled={!isAdmin}
                onClick={() => setBookingEnabled((v) => !v)}
                className={`relative w-12 h-6 rounded-full transition-all duration-200 focus:outline-none ${bookingEnabled ? "bg-emerald-500" : "bg-slate-300"} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${bookingEnabled ? "left-6" : "left-0.5"}`} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Transfer Number</label>
              <p className="text-[11px] text-slate-400 mb-1.5">Phone number to transfer calls when needed</p>
              <input
                type="tel"
                disabled={!isAdmin}
                value={transferNumber}
                onChange={(e) => setTransferNumber(e.target.value)}
                placeholder="+91XXXXXXXXXX"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              />
            </div>
          </div>
        </Card>

        {/* Fallback */}
        <Card>
          <CardHeader title="Fallback & Recovery" subtitle="What happens when the bot can't understand" />
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Fallback Policy</label>
              <p className="text-[11px] text-slate-400 mb-1.5">After repeated failed understanding attempts</p>
              <select
                disabled={!isAdmin}
                value={fallbackPolicy}
                onChange={(e) => setFallbackPolicy(e.target.value as SettingsRecord["fallbackPolicy"])}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="ask_again">Ask again</option>
                <option value="transfer">Transfer to reception</option>
                <option value="end_call">End call</option>
                <option value="create_callback">Create callback task</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Fallback Response</label>
              <p className="text-[11px] text-slate-400 mb-1.5">Message spoken when the AI cannot understand or fulfil a request</p>
              <textarea
                id="fallback-response"
                rows={4}
                disabled={!isAdmin}
                value={fallbackResponse}
                onChange={(e) => setFallbackResponse(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
              />
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Intent Intelligence" subtitle="Safe deterministic understanding before the bot asks the next question" />
          <div className="divide-y divide-slate-100">
            {[
              ["enabled", "Enable smart intent layer", "Extract doctor, day, time, name, number, and patient type before asking again"],
              ["askOnlyMissingFields", "Ask only missing fields", "Skip doctor/date/time questions when already understood"],
              ["callerNumberConfirmation", "Confirm current caller number", "Ask permission to use ANI before requesting manual mobile entry"],
              ["languageNormalization", "Hindi/Hinglish normalization", "Use known Hindi, English, and mixed-language aliases"],
              ["availabilityFirst", "Check slots before details", "Use business hours and booked appointments before collecting patient details"],
              ["smartClarification", "Prefer confirmation over repetition", "Keep room for safer confirmation prompts as confidence improves"],
              ["llmFallbackEnabled", "LLM fallback when rules fail", "Use configured LLM only when rule-based understanding is unclear or stuck"],
            ].map(([key, label, description]) => (
              <div key={key} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{label}</p>
                  <p className="text-xs text-slate-400">{description}</p>
                </div>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => setIntelligenceSettings((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))}
                  className={`relative w-12 h-6 rounded-full transition-all duration-200 focus:outline-none ${intelligenceSettings[key as keyof typeof intelligenceSettings] ? "bg-indigo-600" : "bg-slate-300"} disabled:opacity-50`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${intelligenceSettings[key as keyof typeof intelligenceSettings] ? "left-6" : "left-0.5"}`} />
                </button>
              </div>
            ))}
            <div className="py-3">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Auto-accept confidence threshold</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                disabled={!isAdmin}
                value={intelligenceSettings.confidenceThreshold}
                onChange={(e) => setIntelligenceSettings((current) => ({ ...current, confidenceThreshold: Number(e.target.value) }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              />
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Cost Display Settings" subtitle="Choose which estimated cost columns operators can see" />
          <div className="divide-y divide-slate-100">
            {[
              ["showSttCost", "Show STT Cost Column", "Speech-to-text estimate per call"],
              ["showTtsCost", "Show TTS Cost Column", "Text-to-speech estimate per call"],
              ["showLlmCost", "Show LLM Cost Column", "Language-model estimate per call"],
              ["showTotalCost", "Show Total Cost Column", "Combined estimated AI cost per call"],
            ].map(([key, label, description]) => (
              <div key={key} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{label}</p>
                  <p className="text-xs text-slate-400">{description}</p>
                </div>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => setCostDisplay((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))}
                  className={`relative w-12 h-6 rounded-full transition-all duration-200 focus:outline-none ${costDisplay[key as keyof typeof costDisplay] ? "bg-indigo-600" : "bg-slate-300"} disabled:opacity-50`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${costDisplay[key as keyof typeof costDisplay] ? "left-6" : "left-0.5"}`} />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Supported intents */}
        <Card className="lg:col-span-2">
          <CardHeader title="Supported Intents" subtitle="Capabilities the AI bot is configured to handle" />
          <div className="flex flex-wrap gap-2 mb-4">
            {supportedIntents.length === 0 ? (
              <p className="text-sm text-slate-400">No intents configured.</p>
            ) : (
              supportedIntents.map((intent, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Badge variant="info">{intent}</Badge>
                  {isAdmin && (
                    <button
                      onClick={() => setSupportedIntents((si) => si.filter((_, idx) => idx !== i))}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          {isAdmin && (
            <IntentAdder onAdd={(intent) => setSupportedIntents((si) => [...si, intent])} />
          )}
        </Card>
      </div>

      {/* Save bar */}
      {isAdmin && (
        <div className="sticky bottom-4 flex items-center justify-between rounded-[24px] border border-white/90 bg-white/80 px-5 py-3 shadow-[0_18px_42px_rgba(148,163,184,0.14)] backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
          <div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            {saved && <p className="text-xs font-medium text-emerald-600">Behaviour settings saved</p>}
          </div>
          <Button id="save-behaviour" variant="primary" loading={saving} onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}

function IntentAdder({ onAdd }: { onAdd: (v: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2">
      <input
        id="add-intent-input"
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) { onAdd(val.trim()); setVal(""); } }}
        placeholder="Add intent (e.g. book_appointment) and press Enter"
        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <Button
        variant="secondary" size="sm"
        onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(""); } }}
      >
        Add
      </Button>
    </div>
  );
}

import React, { useEffect, useState, useCallback } from "react";
import { fetchSettings, updateSettings, type SettingsRecord } from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { Card, CardHeader } from "../../ui/Card";
import { Button } from "../../ui/Button";
import { PageLoader } from "../../ui/Spinner";

type AIProviderConfig = {
  primaryProvider: string;
  fallbackChain: string[];
  model: string;
  apiKeyRef: string;
  timeoutMs: number;
  stream?: boolean;
  language?: string;
  voice?: string;
};

const LLM_PROVIDERS = ["mock", "openai", "claude", "sarvam"];
const STT_PROVIDERS = ["mock", "sarvam", "openai", "deepgram"];
const TTS_PROVIDERS = ["mock", "sarvam", "openai", "elevenlabs"];

export function AIConfigPage() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [records, setRecords] = useState<SettingsRecord[]>([]);
  const [selected, setSelected] = useState<SettingsRecord | null>(null);

  const [llm, setLlm] = useState<AIProviderConfig>({ primaryProvider: "mock", fallbackChain: [], model: "", apiKeyRef: "", timeoutMs: 30000, stream: false });
  const [stt, setStt] = useState<AIProviderConfig>({ primaryProvider: "mock", fallbackChain: [], model: "", apiKeyRef: "", timeoutMs: 10000, language: "hi-IN" });
  const [tts, setTts] = useState<AIProviderConfig>({ primaryProvider: "mock", fallbackChain: [], model: "", apiKeyRef: "", timeoutMs: 10000, voice: "shubh" });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchSettings(token);
      setRecords(data);
      if (data.length > 0) applyRecord(data[0]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load AI config.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  function applyRecord(r: SettingsRecord) {
    setSelected(r);
    setLlm(r.llmProviders ?? { primaryProvider: "mock", fallbackChain: [], model: "gpt-4o-mini", apiKeyRef: "OPENAI_API_KEY", timeoutMs: 30000, stream: false });
    setStt(r.sttProviders ?? { primaryProvider: "mock", fallbackChain: [], model: "saaras:v3", apiKeyRef: "SARVAM_API_KEY", timeoutMs: 10000, language: "hi-IN" });
    setTts(r.ttsProviders ?? { primaryProvider: "mock", fallbackChain: [], model: "bulbul:v3", apiKeyRef: "SARVAM_API_KEY", timeoutMs: 10000, voice: "shubh" });
    setSaved(false);
  }

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!token || !selected) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateSettings(token, {
        doctorId: selected.doctorId,
        llmProviders: llm,
        sttProviders: stt,
        ttsProviders: tts,
      } as Record<string, unknown>);
      const merged: SettingsRecord = {
        ...selected,
        ...updated,
        llmProviders: { ...llm, stream: Boolean(llm.stream) },
        sttProviders: { ...stt, language: stt.language ?? "hi-IN" },
        ttsProviders: { ...tts, voice: tts.voice ?? "shubh" },
      };
      setSelected(merged);
      setRecords((items) => items.map((item) => (item.doctorId === selected.doctorId ? merged : item)));
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LLM Config */}
        <ConfigPanel 
          title="LLM Provider Logic" 
          config={llm} 
          setConfig={setLlm as any} 
          options={LLM_PROVIDERS} 
          isAdmin={isAdmin}
          extraFields={[
            { key: "stream", label: "Streaming Enabled", type: "checkbox" }
          ]}
        />

        {/* STT Config */}
        <ConfigPanel 
          title="Speech-to-Text (STT)" 
          config={stt} 
          setConfig={setStt as any} 
          options={STT_PROVIDERS} 
          isAdmin={isAdmin}
          extraFields={[
            { key: "language", label: "Language Code", type: "text" }
          ]}
        />

        {/* TTS Config */}
        <ConfigPanel 
          title="Text-to-Speech (TTS)" 
          config={tts} 
          setConfig={setTts as any} 
          options={TTS_PROVIDERS} 
          isAdmin={isAdmin}
          extraFields={[
            { key: "voice", label: "Voice ID", type: "text" }
          ]}
        />

      </div>

      {isAdmin && (
        <div className="sticky bottom-4 flex items-center justify-between bg-white border border-slate-200 rounded-xl shadow-card px-5 py-3">
          <div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            {saved && <p className="text-xs text-emerald-600 font-medium">AI Config updated</p>}
          </div>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            Save Pipeline
          </Button>
        </div>
      )}
    </div>
  );
}

function ConfigPanel({ title, config, setConfig, options, isAdmin, extraFields }: any) {
  return (
    <Card>
      <CardHeader title={title} subtitle="Set primary engines and fallback chains" />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Primary Provider</label>
            <select
              disabled={!isAdmin}
              value={config.primaryProvider}
              onChange={(e) => setConfig({ ...config, primaryProvider: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Fallback Chain</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={config.fallbackChain?.join(", ") ?? ""}
              onChange={(e) => setConfig({ ...config, fallbackChain: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
              placeholder="e.g. claude, mock"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Model</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              placeholder="gpt-4o-mini"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">API Key Ref (Secret Name)</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={config.apiKeyRef}
              onChange={(e) => setConfig({ ...config, apiKeyRef: e.target.value })}
              placeholder="OPENAI_API_KEY"
              className="w-full px-3 py-2 font-mono text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Timeout (ms)</label>
            <input
              type="number"
              disabled={!isAdmin}
              value={config.timeoutMs}
              onChange={(e) => setConfig({ ...config, timeoutMs: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
          </div>
          
          {extraFields?.map((f: any) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{f.label}</label>
              {f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={config[f.key] as boolean}
                  onChange={(e) => setConfig({ ...config, [f.key]: e.target.checked })}
                  className="mt-2"
                />
              ) : (
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={config[f.key] as string}
                  onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

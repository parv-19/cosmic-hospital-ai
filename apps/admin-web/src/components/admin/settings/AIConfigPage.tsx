import React, { useEffect, useState, useCallback } from "react";
// THEMED: AI provider panels preserve existing health/save calls.
import { checkProviderHealth, fetchSettings, updateSettings, type SettingsRecord } from "../../../api";
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

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

const PROVIDER_LABELS: Record<string, string> = {
  mock: "Mock",
  openai: "OpenAI",
  claude: "Anthropic Claude",
  sarvam: "Sarvam AI",
  deepgram: "Deepgram",
  elevenlabs: "ElevenLabs"
};

const LLM_MODELS: Record<string, SelectOption[]> = {
  mock: [{ value: "mock", label: "Mock engine" }],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o mini (recommended)" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { value: "gpt-4o-realtime-preview", label: "OpenAI Realtime (requires realtime transport)", disabled: true }
  ],
  claude: [
    { value: "claude-3-5-haiku-latest", label: "Claude Haiku 3.5 (recommended)" },
    { value: "claude-3-5-sonnet-latest", label: "Claude Sonnet 3.5" }
  ],
  sarvam: [
    { value: "sarvam-m", label: "Sarvam M (recommended)" }
  ]
};

const STT_MODELS: Record<string, SelectOption[]> = {
  mock: [{ value: "mock", label: "Mock transcript" }],
  sarvam: [
    { value: "saaras:v2", label: "Saarika v2" },
    { value: "saaras:v3", label: "Saaras v3 (recommended)" }
  ],
  openai: [
    { value: "whisper-1", label: "Whisper v1" },
    { value: "gpt-4o-mini-transcribe", label: "GPT-4o mini transcribe" }
  ],
  deepgram: [
    { value: "nova-2", label: "Nova 2" },
    { value: "nova-3", label: "Nova 3" }
  ]
};

const TTS_MODELS: Record<string, SelectOption[]> = {
  mock: [{ value: "mock", label: "Mock audio" }],
  sarvam: [
    { value: "bulbul:v3", label: "Bulbul v3 (recommended)" },
    { value: "bulbul:v2", label: "Bulbul v2 (legacy)" }
  ],
  openai: [
    { value: "gpt-4o-mini-tts", label: "GPT-4o mini TTS" },
    { value: "tts-1", label: "TTS-1" }
  ],
  elevenlabs: [
    { value: "eleven_multilingual_v2", label: "Eleven Multilingual v2" }
  ]
};

const TTS_VOICES: Record<string, Record<string, SelectOption[]>> = {
  sarvam: {
    "bulbul:v3": [
      { value: "priya", label: "Priya - female, top clarity and professional quality" },
      { value: "ishita", label: "Ishita - female, dynamic customer interactions" },
      { value: "roopa", label: "Roopa - female, clear instruction delivery" },
      { value: "shreya", label: "Shreya - female, authoritative and clear" },
      { value: "ritu", label: "Ritu - female, reliable professional tone" },
      { value: "pooja", label: "Pooja - female, standard professional voice" },
      { value: "simran", label: "Simran - female, warmer moderate tone" },
      { value: "suhani", label: "Suhani - female, soft natural Hindi" },
      { value: "neha", label: "Neha - female" },
      { value: "kavya", label: "Kavya - female" },
      { value: "tanya", label: "Tanya - female" },
      { value: "shruti", label: "Shruti - female" },
      { value: "kavitha", label: "Kavitha - female" },
      { value: "rupali", label: "Rupali - female" },
      { value: "amelia", label: "Amelia - female" },
      { value: "sophia", label: "Sophia - female" },
      { value: "arvind", label: "Arvind - professional / medical" },
      { value: "shubh", label: "Shubh - standard / clear" },
      { value: "ashutosh", label: "Ashutosh - male, clear professional Hindi" },
      { value: "anand", label: "Anand - male, warm conversational Hindi" },
      { value: "amol", label: "Amol - conversational / friendly" },
      { value: "aditya", label: "Aditya - male" },
      { value: "rahul", label: "Rahul - male" },
      { value: "rohan", label: "Rohan - male" },
      { value: "amit", label: "Amit - male" },
      { value: "dev", label: "Dev - male" },
      { value: "ratan", label: "Ratan - English-dominant / precise" },
      { value: "varun", label: "Varun - male" },
      { value: "manan", label: "Manan - male" },
      { value: "sumit", label: "Sumit - male" },
      { value: "kabir", label: "Kabir - male" },
      { value: "aayan", label: "Aayan - male" },
      { value: "advait", label: "Advait - male" },
      { value: "tarun", label: "Tarun - male" },
      { value: "sunny", label: "Sunny - male" },
      { value: "mani", label: "Mani - male" },
      { value: "gokul", label: "Gokul - male" },
      { value: "vijay", label: "Vijay - male" },
      { value: "mohit", label: "Mohit - male" },
      { value: "rehan", label: "Rehan - male" },
      { value: "soham", label: "Soham - male" }
    ],
    "bulbul:v2": [
      { value: "meera", label: "Meera - female, healthcare/corporate professional recommended" },
      { value: "manisha", label: "Manisha - female, warm friendly Hindi recommended" },
      { value: "anushka", label: "Anushka - female, Sarvam default, clear professional" },
      { value: "vidya", label: "Vidya - female, articulate and precise" },
      { value: "arya", label: "Arya - female, young and energetic" },
      { value: "karun", label: "Karun - male, natural conversational" },
      { value: "hitesh", label: "Hitesh - male, professional and engaging" },
      { value: "abhilash", label: "Abhilash - male, deep authoritative" }
    ]
  },
  openai: {
    "gpt-4o-mini-tts": [
      { value: "alloy", label: "Alloy" },
      { value: "ash", label: "Ash" },
      { value: "coral", label: "Coral" },
      { value: "sage", label: "Sage" }
    ],
    "tts-1": [
      { value: "alloy", label: "Alloy" },
      { value: "nova", label: "Nova" },
      { value: "shimmer", label: "Shimmer" }
    ]
  },
  elevenlabs: {
    eleven_multilingual_v2: [
      { value: "default", label: "Default voice" }
    ]
  },
  mock: {
    mock: [{ value: "mock", label: "Mock voice" }]
  }
};

function firstEnabled(options: SelectOption[] = [], fallback = "") {
  return options.find((option) => !option.disabled)?.value ?? options[0]?.value ?? fallback;
}

function normalizeConfig(config: AIProviderConfig, modelMap: Record<string, SelectOption[]>) {
  const provider = config.primaryProvider || "mock";
  const models = modelMap[provider] ?? [];
  const model = models.some((option) => option.value === config.model && !option.disabled)
    ? config.model
    : firstEnabled(models, config.model);

  return { ...config, model };
}

function normalizeTtsConfig(config: AIProviderConfig) {
  const normalized = normalizeConfig(config, TTS_MODELS);
  const voiceOptions = TTS_VOICES[normalized.primaryProvider]?.[normalized.model] ?? [];
  const voice = voiceOptions.some((option) => option.value === normalized.voice)
    ? normalized.voice
    : firstEnabled(voiceOptions, normalized.voice);

  return { ...normalized, voice };
}

export function AIConfigPage() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [records, setRecords] = useState<SettingsRecord[]>([]);
  const [selected, setSelected] = useState<SettingsRecord | null>(null);

  const [llm, setLlm] = useState<AIProviderConfig>({ primaryProvider: "mock", fallbackChain: [], model: "", apiKeyRef: "", timeoutMs: 30000, stream: false });
  const [stt, setStt] = useState<AIProviderConfig>({ primaryProvider: "mock", fallbackChain: [], model: "", apiKeyRef: "", timeoutMs: 10000, language: "hi-IN" });
  const [tts, setTts] = useState<AIProviderConfig>({ primaryProvider: "mock", fallbackChain: [], model: "", apiKeyRef: "", timeoutMs: 10000, voice: "priya" });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<Record<string, string>>({});

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
    setLlm(normalizeConfig(r.llmProviders ?? { primaryProvider: "mock", fallbackChain: [], model: "mock", apiKeyRef: "OPENAI_API_KEY", timeoutMs: 30000, stream: false }, LLM_MODELS));
    setStt(normalizeConfig(r.sttProviders ?? { primaryProvider: "mock", fallbackChain: [], model: "mock", apiKeyRef: "SARVAM_API_KEY", timeoutMs: 10000, language: "hi-IN" }, STT_MODELS));
    setTts(normalizeTtsConfig(r.ttsProviders ?? { primaryProvider: "mock", fallbackChain: [], model: "mock", apiKeyRef: "SARVAM_API_KEY", timeoutMs: 10000, voice: "mock" }));
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
        ttsProviders: { ...tts, voice: tts.voice ?? "priya" },
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

  async function testProvider(service: "llm" | "stt" | "tts", config: AIProviderConfig) {
    if (!token) return;
    setHealth((h) => ({ ...h, [service]: "Checking provider..." }));

    try {
      const result = await checkProviderHealth(token, { service, ...config });
      setHealth((h) => ({
        ...h,
        [service]: result.ok ? "Provider check passed" : `Provider warning: ${result.warnings.join(" ")}`
      }));
    } catch (e: unknown) {
      setHealth((h) => ({ ...h, [service]: e instanceof Error ? e.message : "Provider check failed." }));
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
              className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition-all ${selected?.doctorId === r.doctorId ? "border-sky-400/40 bg-[linear-gradient(135deg,#38bdf8_0%,#2563eb_100%)] text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)]" : "border-white/90 bg-white/80 text-slate-600 shadow-[0_10px_24px_rgba(148,163,184,0.10)] hover:border-sky-200 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-sky-500/40 dark:hover:text-sky-300"}`}
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
          service="llm"
          config={llm} 
          setConfig={setLlm as any} 
          options={LLM_PROVIDERS} 
          modelOptions={LLM_MODELS}
          isAdmin={isAdmin}
          onTest={testProvider}
          healthMessage={health.llm}
          extraFields={[
            { key: "stream", label: "Streaming Enabled", type: "checkbox" }
          ]}
        />

        {/* STT Config */}
        <ConfigPanel 
          title="Speech-to-Text (STT)" 
          service="stt"
          config={stt} 
          setConfig={setStt as any} 
          options={STT_PROVIDERS} 
          modelOptions={STT_MODELS}
          isAdmin={isAdmin}
          onTest={testProvider}
          healthMessage={health.stt}
          extraFields={[
            { key: "language", label: "Language Code", type: "text" }
          ]}
        />

        {/* TTS Config */}
        <ConfigPanel 
          title="Text-to-Speech (TTS)" 
          service="tts"
          config={tts} 
          setConfig={setTts as any} 
          options={TTS_PROVIDERS} 
          modelOptions={TTS_MODELS}
          voiceOptions={TTS_VOICES}
          isAdmin={isAdmin}
          onTest={testProvider}
          healthMessage={health.tts}
          extraFields={[
            { key: "voice", label: "Voice ID", type: "voice-select" }
          ]}
        />

      </div>

      {isAdmin && (
        <div className="sticky bottom-4 flex items-center justify-between rounded-[24px] border border-white/90 bg-white/80 px-5 py-3 shadow-[0_18px_42px_rgba(148,163,184,0.14)] backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
          <div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            {saved && <p className="text-xs font-medium text-emerald-600">AI config updated</p>}
          </div>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            Save Pipeline
          </Button>
        </div>
      )}
    </div>
  );
}

function ConfigPanel({ title, service, config, setConfig, options, modelOptions, voiceOptions, isAdmin, extraFields, onTest, healthMessage }: any) {
  const currentModelOptions: SelectOption[] = modelOptions?.[config.primaryProvider] ?? [];
  const currentVoiceOptions: SelectOption[] = voiceOptions?.[config.primaryProvider]?.[config.model] ?? [];

  function updateProvider(nextProvider: string) {
    const nextModel = firstEnabled(modelOptions?.[nextProvider] ?? [], "");
    const nextVoice = firstEnabled(voiceOptions?.[nextProvider]?.[nextModel] ?? [], "");

    setConfig({
      ...config,
      primaryProvider: nextProvider,
      model: nextModel,
      apiKeyRef: nextProvider === "openai"
        ? "OPENAI_API_KEY"
        : nextProvider === "claude"
          ? "ANTHROPIC_API_KEY"
          : nextProvider === "sarvam"
            ? "SARVAM_API_KEY"
            : config.apiKeyRef,
      ...(nextVoice ? { voice: nextVoice } : {})
    });
  }

  function updateModel(nextModel: string) {
    const nextVoice = firstEnabled(voiceOptions?.[config.primaryProvider]?.[nextModel] ?? [], config.voice);
    setConfig({ ...config, model: nextModel, ...(nextVoice ? { voice: nextVoice } : {}) });
  }

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle="Set primary engines and fallback chains"
        action={isAdmin ? (
          <Button variant="secondary" size="sm" onClick={() => onTest(service, config)}>
            Test Provider
          </Button>
        ) : undefined}
      />
      <div className="space-y-4">
        {healthMessage && (
          <p className={`rounded-xl border px-3 py-2 text-xs font-medium ${String(healthMessage).includes("passed") ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"}`}>
            {healthMessage}
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Primary Provider</label>
            <select
              disabled={!isAdmin}
              value={config.primaryProvider}
              onChange={(e) => updateProvider(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {options.map((opt: string) => <option key={opt} value={opt}>{PROVIDER_LABELS[opt] ?? opt}</option>)}
            </select>
            {currentModelOptions.some((opt) => opt.value === config.model && opt.disabled) && (
              <p className="text-[11px] text-amber-600 mt-1">This model is listed but not supported by the current backend transport.</p>
            )}
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
            <select
              disabled={!isAdmin}
              value={config.model}
              onChange={(e) => updateModel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {currentModelOptions.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
              ))}
            </select>
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
              ) : f.type === "voice-select" ? (
                <select
                  disabled={!isAdmin || currentVoiceOptions.length === 0}
                  value={(config[f.key] as string) ?? ""}
                  onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {currentVoiceOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
                  ))}
                </select>
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

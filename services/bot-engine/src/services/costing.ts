export type UsageService = "stt" | "tts" | "llm" | "transfer";

export type UsageEventInput = {
  service: UsageService;
  provider: string;
  model?: string;
  quantity?: number;
  text?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type UsageLedgerEntry = {
  service: UsageService;
  provider: string;
  model: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  currency: "INR";
  estimatedCost: number;
  estimated: boolean;
  pricingSourceUrl: string;
  createdAt: string;
};

export type CostSummary = {
  currency: "INR";
  sttCost: number;
  ttsCost: number;
  llmCost: number;
  transferCost: number;
  totalCost: number;
  estimated: boolean;
};

const USD_TO_INR = Number(process.env.USD_TO_INR || 83);

const SOURCES = {
  openai: "https://developers.openai.com/api/docs/pricing",
  anthropic: "https://claude.com/pricing",
  sarvam: "https://docs.sarvam.ai/api-reference-docs/pricing",
  googleStt: "https://cloud.google.com/speech-to-text/pricing",
  googleTts: "https://cloud.google.com/text-to-speech/pricing",
  deepgram: "https://deepgram.com/pricing",
  elevenlabs: "https://help.elevenlabs.io/hc/en-us/articles/27562020846481-What-are-credits"
} as const;

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function usd(value: number): number {
  return value * USD_TO_INR;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function byMillionTokens(tokens: number, inrPerMillion: number): number {
  return (tokens / 1_000_000) * inrPerMillion;
}

export function createUsageLedgerEntry(input: UsageEventInput): UsageLedgerEntry {
  const provider = String(input.provider || "mock").toLowerCase();
  const model = String(input.model || provider || "unknown").toLowerCase();
  const now = new Date().toISOString();

  if (provider === "mock") {
    return {
      service: input.service,
      provider,
      model,
      unit: "event",
      quantity: 1,
      unitPrice: 0,
      currency: "INR",
      estimatedCost: 0,
      estimated: true,
      pricingSourceUrl: "",
      createdAt: now
    };
  }

  if (input.service === "stt") {
    const minutes = Math.max(0, (input.durationMs ?? 0) / 60000);

    if (provider === "sarvam") {
      const unitPrice = 30 / 60;
      return ledger(input, provider, model, "minute", minutes, unitPrice, SOURCES.sarvam, now);
    }

    if (provider === "openai") {
      const unitPrice = model.includes("gpt-4o-transcribe") && !model.includes("mini") ? usd(0.006) : usd(0.003);
      return ledger(input, provider, model, "minute", minutes, unitPrice, SOURCES.openai, now);
    }

    if (provider === "deepgram") {
      const unitPrice = model.includes("multilingual") ? usd(0.0092) : usd(0.0077);
      return ledger(input, provider, model, "minute", minutes, unitPrice, SOURCES.deepgram, now);
    }

    if (provider === "google") {
      return ledger(input, provider, model, "minute", minutes, usd(0.016), SOURCES.googleStt, now);
    }
  }

  if (input.service === "tts") {
    const chars = input.quantity ?? String(input.text || "").length;

    if (provider === "sarvam") {
      const per10k = model.includes("v2") ? 15 : 30;
      return ledger(input, provider, model, "character", chars, per10k / 10000, SOURCES.sarvam, now);
    }

    if (provider === "openai") {
      const unitPrice = model.includes("gpt-4o-mini-tts") ? usd(0.60) / 1_000_000 : usd(15) / 1_000_000;
      return ledger(input, provider, model, "character", chars, unitPrice, SOURCES.openai, now);
    }

    if (provider === "elevenlabs") {
      return ledger(input, provider, model, "character", chars, usd(0.30) / 1000, SOURCES.elevenlabs, now);
    }

    if (provider === "google") {
      return ledger(input, provider, model, "character", chars, usd(30) / 1_000_000, SOURCES.googleTts, now);
    }
  }

  if (input.service === "llm") {
    const inputTokens = input.inputTokens ?? estimateTokens(input.text || "");
    const outputTokens = input.outputTokens ?? Math.max(1, Math.ceil((input.quantity ?? 0) / 4));

    if (provider === "openai") {
      const inputRate = model.includes("gpt-4o-mini") ? usd(0.15) : usd(2.5);
      const outputRate = model.includes("gpt-4o-mini") ? usd(0.60) : usd(10);
      return ledger(input, provider, model, "token_estimate", inputTokens + outputTokens, byMillionTokens(inputTokens, inputRate) + byMillionTokens(outputTokens, outputRate), SOURCES.openai, now, true);
    }

    if (provider === "claude") {
      const inputRate = model.includes("haiku") ? usd(1) : usd(3);
      const outputRate = model.includes("haiku") ? usd(5) : usd(15);
      return ledger(input, provider, model, "token_estimate", inputTokens + outputTokens, byMillionTokens(inputTokens, inputRate) + byMillionTokens(outputTokens, outputRate), SOURCES.anthropic, now, true);
    }

    if (provider === "sarvam") {
      return ledger(input, provider, model, "token_estimate", inputTokens + outputTokens, 0, SOURCES.sarvam, now, true);
    }
  }

  return ledger(input, provider, model, "event", 1, 0, "", now);
}

function ledger(
  input: UsageEventInput,
  provider: string,
  model: string,
  unit: string,
  quantity: number,
  unitPriceOrTotal: number,
  pricingSourceUrl: string,
  createdAt: string,
  isTotal = false
): UsageLedgerEntry {
  const estimatedCost = isTotal ? unitPriceOrTotal : quantity * unitPriceOrTotal;

  return {
    service: input.service,
    provider,
    model,
    unit,
    quantity: Math.round(quantity * 10000) / 10000,
    unitPrice: isTotal ? 0 : unitPriceOrTotal,
    currency: "INR",
    estimatedCost: roundMoney(estimatedCost),
    estimated: true,
    pricingSourceUrl,
    createdAt
  };
}

export function summarizeUsageLedger(entries: UsageLedgerEntry[] = []): CostSummary {
  const summary: CostSummary = {
    currency: "INR",
    sttCost: 0,
    ttsCost: 0,
    llmCost: 0,
    transferCost: 0,
    totalCost: 0,
    estimated: true
  };

  for (const entry of entries) {
    if (entry.service === "stt") summary.sttCost += entry.estimatedCost;
    if (entry.service === "tts") summary.ttsCost += entry.estimatedCost;
    if (entry.service === "llm") summary.llmCost += entry.estimatedCost;
    if (entry.service === "transfer") summary.transferCost += entry.estimatedCost;
  }

  summary.sttCost = roundMoney(summary.sttCost);
  summary.ttsCost = roundMoney(summary.ttsCost);
  summary.llmCost = roundMoney(summary.llmCost);
  summary.transferCost = roundMoney(summary.transferCost);
  summary.totalCost = roundMoney(summary.sttCost + summary.ttsCost + summary.llmCost + summary.transferCost);

  return summary;
}

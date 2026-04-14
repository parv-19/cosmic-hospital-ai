import { logger } from "@ai-hospital/shared-utils";
import type { DemoSessionRecord } from "../repositories/call-repository";

export type LLMConfig = {
  primaryProvider: string;
  fallbackChain: string[];
  model: string;
  apiKeyRef: string;
  timeoutMs: number;
  stream: boolean;
};

export class ProviderFactory {
  async generateReply(
    transcript: string,
    session: DemoSessionRecord,
    config: LLMConfig,
    systemPrompt: string,
    mockFallbackCallback: () => Promise<string>
  ): Promise<string> {
    const chain = [config.primaryProvider, ...(config.fallbackChain || [])];

    for (const provider of chain) {
      logger.info(`[llm] attempting provider=${provider}`);

      try {
        if (provider === "mock") {
          return await mockFallbackCallback();
        }
        if (provider === "openai") {
          return await this.callOpenAI(transcript, session, config, systemPrompt);
        }
        if (provider === "claude") {
          return await this.callClaude(transcript, session, config, systemPrompt);
        }
        if (provider === "sarvam") {
          return await this.callSarvam(transcript, session, config, systemPrompt);
        }
        logger.warn(`[llm] unsupported provider=${provider}`);
      } catch (error) {
        logger.error(`[llm] provider=${provider} failed. Error: ${(error as Error).message}`);
        // continue loop to next provider in fallback chain
      }
    }

    logger.error(`[llm] All providers in chain failed, falling back to mock algorithmic tree`);
    return mockFallbackCallback();
  }

  private resolveApiKey(config: LLMConfig): string {
    const secret = process.env[config.apiKeyRef] || config.apiKeyRef;
    if (!secret) throw new Error(`API Key Ref ${config.apiKeyRef} is not set`);
    return secret;
  }

  private async callOpenAI(transcript: string, session: DemoSessionRecord, config: LLMConfig, systemPrompt: string): Promise<string> {
    const apiKey = this.resolveApiKey(config);
    const ms = config.timeoutMs || 30000;

    const messages = [
      { role: "system", content: systemPrompt },
      ...session.transcriptHistory.map(entry => ({
        role: entry.speaker === "caller" ? "user" : "assistant",
        content: entry.text
      })),
      { role: "user", content: transcript }
    ];

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), ms);

    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false
        }),
        signal: controller.signal
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`OpenAI HTTP ${resp.status}: ${txt}`);
      }

      const payload = await resp.json() as any;
      return payload.choices[0].message.content;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async callClaude(transcript: string, session: DemoSessionRecord, config: LLMConfig, systemPrompt: string): Promise<string> {
    const apiKey = this.resolveApiKey(config);
    const ms = config.timeoutMs || 30000;

    const messages = [
      ...session.transcriptHistory.map(entry => ({
        role: entry.speaker === "caller" ? "user" : "assistant",
        content: entry.text
      })),
      { role: "user", content: transcript }
    ];

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), ms);

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: config.model,
          system: systemPrompt,
          messages,
          max_tokens: 1024,
          stream: false
        }),
        signal: controller.signal
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Claude HTTP ${resp.status}: ${txt}`);
      }

      const payload = await resp.json() as any;
      return payload.content[0].text;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async callSarvam(transcript: string, _session: DemoSessionRecord, config: LLMConfig, systemPrompt: string): Promise<string> {
    const apiKey = this.resolveApiKey(config);
    const ms = config.timeoutMs || 30000;
    
    // Using a rough proxy for Sarvam text chat or similar completion
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), ms);

    try {
      const resp = await fetch(`https://api.sarvam.ai/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": apiKey
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: transcript }
          ]
        }),
        signal: controller.signal
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Sarvam HTTP ${resp.status}: ${txt}`);
      }

      const payload = await resp.json() as any;
      return payload.choices[0].message.content;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export const llmFactory = new ProviderFactory();

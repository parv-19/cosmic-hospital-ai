import { IntentRepository } from "../repositories/intent-repository";

export class IntentService {
  constructor(private readonly repository: IntentRepository) {}

  async detectIntent(transcript: string) {
    const normalized = transcript.toLowerCase().trim();
    const definitions = await this.repository.list();
    const matched = definitions.filter((definition) =>
      definition.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
    );
    const intents = Array.from(new Set(matched.map((definition) => definition.intent).filter((intent) => intent !== "unknown")));
    const primaryIntent = intents[0] ?? "unknown";
    const confidence = intents.length === 0
      ? 0.35
      : intents.includes("emergency")
        ? 1
        : intents.length > 1
          ? 0.92
          : 0.88;

    return {
      intent: primaryIntent,
      intents,
      confidence
    };
  }
}


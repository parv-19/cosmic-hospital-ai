import { IntentRepository } from "../repositories/intent-repository";

export class IntentService {
  constructor(private readonly repository: IntentRepository) {}

  async detectIntent(transcript: string) {
    const normalized = transcript.toLowerCase();
    const definitions = await this.repository.list();

    const matched = definitions.find((definition) =>
      definition.keywords.some((keyword) => normalized.includes(keyword))
    );

    return {
      intent: matched?.intent ?? "unknown",
      confidence: matched ? 0.88 : 0.35
    };
  }
}


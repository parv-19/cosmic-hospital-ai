export type IntentDefinition = {
  intent: "book_appointment" | "cancel_appointment" | "clinic_info" | "human_escalation" | "emergency" | "unknown";
  keywords: string[];
};

const intentDefinitions: IntentDefinition[] = [
  { intent: "emergency", keywords: ["emergency", "urgent", "bleeding", "chest pain"] },
  { intent: "human_escalation", keywords: ["human", "reception", "agent", "transfer"] },
  { intent: "book_appointment", keywords: ["book", "appointment", "schedule"] },
  { intent: "cancel_appointment", keywords: ["cancel", "remove appointment"] },
  { intent: "clinic_info", keywords: ["fee", "timing", "address", "clinic"] }
];

export class IntentRepository {
  async list(): Promise<IntentDefinition[]> {
    return intentDefinitions;
  }
}


You are a senior TypeScript backend engineer working on a production-grade AI telephony system.

Your task is to implement a NEW feature as an isolated module and integrate it with STRICT constraints.

You MUST follow instructions exactly. Treat this as a contract, not a suggestion.

--------------------------------------------------
## CONTEXT

- Project: Hospital AI Receptionist Voice Bot
- Existing core logic: bot-service.ts (already working, DO NOT refactor)
- Architecture: modular services-based TypeScript system
- Current flow MUST remain 100% intact

--------------------------------------------------
## OBJECTIVE

Add a multi-symptom inference engine that:
- Detects medical conditions from MULTIPLE symptoms where emergency inference is needed
- Routes common patient symptom requests to the right available specialist for appointment booking
- Works across:
  - English
  - Hindi
  - Hinglish
  - Gujarati
- Can override bot behavior ONLY when needed

--------------------------------------------------
## STEP 1 - CREATE NEW FILE

Create EXACTLY this file:

services/bot-engine/src/services/symptom-inference-engine.ts

Do not create any additional files.

--------------------------------------------------
## STEP 2 - FUNCTION CONTRACT

Export:

function inferCondition(transcript: string): InferenceResult | null

Types:

type InferenceResult = {
  condition: string
  specialization: string
  doctorSuggestion?: string
  isEmergency: boolean
  confidence: number
  matchedSymptoms: string[]
  reply: string
}

--------------------------------------------------
## STEP 3 - CORE ENGINE DESIGN

Implement a RULE-BASED inference system:

- Emergency conditions require a COMBINATION of symptoms
- Appointment triage can route a clear complaint to a specialty when safe
- Normalize transcript -> semantic tokens -> rule matching

--------------------------------------------------
## STEP 4 - MULTILINGUAL NORMALIZATION

Build a synonym map covering ALL 4 languages.

Example:

"chest pain" => [
  "chest pain",
  "seene mein dard",
  "seene me dard",
  "chest ma dard",
  "chhati ma dard",
  "छाती में दर्द",
  "છાતીમાં દુખાવો"
]

Rules:
- Hinglish must be treated as first-class input
- Normalize everything before inference
- Avoid regex hacks; use structured mapping

--------------------------------------------------
## STEP 5 - CONDITIONS AND TRIAGE RULES

Implement these emergency/condition rules:

1. Heart Attack
2. Stroke
3. Appendicitis
4. Diabetic Emergency
5. Asthma Attack
6. Kidney Stone
7. Migraine
8. Dengue
9. UTI
10. Panic Attack

Also implement appointment-triage rules for common hospital routing questions:

11. Cardiac Symptoms
    - Input like "I have chest pain and swelling" or "seene mein dard aur haath mein sujan"
    - emergency = false unless combined with breathlessness, sweating, or arm pain
    - specialization = Cardiology
    - doctorSuggestion = available cardiologist
    - reply should advise booking/taking an appointment with the available cardiologist

12. Stomach Pain
    - Input like "I have stomach pain", "pet dard", or "pait me dard"
    - emergency = false unless appendicitis clusters are matched
    - specialization = General Medicine
    - doctorSuggestion = available family physician
    - reply should advise booking/taking an appointment with General Medicine or a family physician

Each rule MUST include:

- symptomClusters or clear triage cluster
- synonym mapping
- confidence scoring
- emergency flag
- specialization
- human-like reply template

--------------------------------------------------
## STEP 6 - EXAMPLE BEHAVIOR (MUST MATCH)

Input:
"chest pain and arm swelling"
-> Cardiac Symptoms
-> specialization = Cardiology
-> doctorSuggestion = available cardiologist
-> emergency = false

Input:
"seene mein dard aur haath mein sujan"
-> SAME RESULT

Input:
"chest pain with sweating and breathing problem"
-> Heart Attack
-> emergency = true

Input:
"I have stomach pain"
-> Stomach Pain
-> specialization = General Medicine
-> doctorSuggestion = available family physician
-> emergency = false

--------------------------------------------------
## STEP 7 - REPLY STYLE

Replies MUST:

- Sound like a real hospital receptionist
- NOT sound like AI
- Be short, natural, and actionable

Example tones:
"For chest pain with swelling, please book an appointment with the available cardiologist. Which day should I check?"
"For stomach pain, General Medicine or a family physician is best. I can book the available doctor for you."
"Sir, based on what you're describing, this could be serious. I'm connecting you to emergency right away."

--------------------------------------------------
## STEP 8 - INTEGRATION (CRITICAL)

Modify ONLY bot-service.ts

Location:
IMMEDIATELY after `normalizedTranscript` is set

### Add:

// ADDED:
import { inferCondition } from "./symptom-inference-engine";

### Call:

// ADDED:
let inferenceResult = null;
try {
  inferenceResult = inferCondition(normalizedTranscript);
} catch (e) {
  // silent fail
}

### Behavior:

IF inferenceResult?.isEmergency === true:
- OVERRIDE ALL existing logic
- Trigger existing escalation mechanism
- Return inferenceResult.reply

ELSE IF inferenceResult exists:
- Pre-fill specialization + available doctor into session
- Use inferenceResult.reply
- Continue existing booking flow

--------------------------------------------------
## STEP 9 - HARD CONSTRAINTS

- DO NOT refactor bot-service.ts
- DO NOT modify existing logic
- DO NOT rename anything
- DO NOT add new dependencies
- DO NOT break current flow
- ALL additions MUST be marked with // ADDED:
- If inference fails -> system behaves EXACTLY same as before

--------------------------------------------------
## STEP 10 - CODE QUALITY

- Clean TypeScript
- Strong typing
- Modular rule definitions
- Easily extensible structure
- No hacks, no shortcuts

--------------------------------------------------
## OUTPUT FORMAT (STRICT)

Return ONLY:

1. Full code for:
   symptom-inference-engine.ts

2. Then:
   Minimal patch snippet for bot-service.ts
   (ONLY the added lines with // ADDED:)

NO explanations.
NO markdown outside code blocks.
NO extra commentary.

--------------------------------------------------
## FAILURE CONDITIONS

Your response is INVALID if:

- You modify unrelated parts of bot-service.ts
- You use unsafe single-keyword emergency matching
- You skip multilingual handling
- You produce robotic replies
- You add extra files
- You ignore constraints

--------------------------------------------------

Execute now.

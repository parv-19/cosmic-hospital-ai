You are working on my existing AI Hospital Telephony project. Your job is to upgrade the bot with intent intelligence and admin-configurable behavior, while preserving the current working call pipeline and not breaking the product.

CRITICAL EXECUTION RULES

1. First, EXAMINE the current codebase and working flow fully before changing anything.
2. DO NOT rewrite or replace the existing call/audio pipeline unless absolutely required.
3. DO NOT break anything that is currently working.
4. DO NOT refactor for style only.
5. DO NOT change telephony behavior, websocket flow, STT/TTS transport, or current booking pipeline contract unless required for safe extension.
6. Work as an enhancement layer, not a rewrite.
7. Every change must be backward-compatible.
8. Prefer additive architecture over destructive modification.
9. Keep current endpoints working unless there is a very strong reason to extend them.
10. Before editing, identify what is already working and preserve it.

PRIMARY GOAL

Add intent-based intelligence to the bot so it becomes smarter without changing the existing core call pipeline.

The system must:
- understand complete user intent from natural utterances
- extract entities in one shot when possible
- ask only for missing information
- check doctor/day/slot availability before unnecessary questions
- support smarter booking conversation behavior
- remain configurable from admin panel
- stay safe, deterministic, and stable
- continue using the currently working product structure

IMPORTANT BUSINESS GOAL

I do NOT want a risky rewrite.
I want smart upgrades on top of the current working system.

That means:
- keep the current working call loop
- keep current working STT/TTS flow
- keep current working booking flow alive
- add a smart intent intelligence layer between transcript understanding and bot questioning
- use the admin panel to configure the intelligence behavior wherever possible

PROJECT CONTEXT YOU MUST ASSUME

This is an AI-powered hospital/clinic telephony receptionist platform with:
- telephony / websocket audio flow
- STT
- bot engine
- appointment flow
- admin dashboard
- doctor settings / clinic settings / AI settings
- call logs / transcripts / usage ledger
- microservice-style architecture
- existing booking state machine already working

My product is already functioning.
Your task is to improve intelligence, not rebuild everything.

WHAT YOU MUST DO FIRST

PHASE 1 — ANALYZE CURRENT STATE

Before writing code:
1. Inspect the current repository structure.
2. Identify all services involved in the call flow.
3. Identify current working booking flow and state machine.
4. Identify where transcript enters the bot.
5. Identify how intent is currently detected.
6. Identify where doctor availability is checked.
7. Identify what admin panel already exposes for configuration.
8. Identify all current APIs used by:
   - admin web
   - bot engine
   - appointment service
   - doctor service
   - ai service
   - telephony/audio server
9. Identify all working data contracts that should not be broken.
10. Document the “as-is working flow” before changing anything.

OUTPUT REQUIRED BEFORE CODING

Create a short implementation note that clearly states:
- current working flow
- what must remain untouched
- where the smart intent layer will be inserted
- what files/services will be changed
- why those changes are low risk

ONLY AFTER THIS ANALYSIS start implementation.

NON-NEGOTIABLE SAFETY CONSTRAINTS

You must preserve:
- current websocket audio flow
- current telephony handling
- current STT pipeline
- current TTS pipeline
- current successful booking flow
- current appointment service contracts unless extension is needed
- current admin panel functionality
- current working database behavior
- current existing APIs unless adding optional fields in backward-compatible way

If you add new behavior, it must be optional or safely defaulted.

ARCHITECTURE STRATEGY

Implement a new “Intent Intelligence Layer” in the bot flow.

This layer should:
- examine final transcript text
- classify intent
- extract entities
- determine which data is already known
- determine what is missing
- trigger availability checks early when enough entities exist
- return the next best bot action

This layer must be additive and sit on top of the existing flow.

DESIRED INTELLIGENCE BEHAVIOR

When the caller says a full request like:
“मुझे डॉक्टर अनन्या शर्मा से सोमवार को सुबह स्लॉट में अपॉइंटमेंट बुक करनी है”

The system should do the following:
1. detect booking intent immediately
2. extract:
   - doctor name
   - day/date
   - time preference
3. check whether that doctor exists
4. check whether doctor works on that day
5. check matching slot availability
6. if matching slot exists, do NOT ask doctor/date/time again
7. ask only missing fields:
   - use current caller number confirmation first
   - patient name
   - new patient or follow-up
8. confirm booking details
9. proceed through existing booking mechanism safely

BETTER UX RULES TO ADD

1. Ask only for missing entities.
2. Never repeat questions for entities already provided in the transcript.
3. Prefer availability-first behavior once doctor + day/date is available.
4. If caller ANI/phone number is available from telephony, do not force spoken number entry first.
5. Ask:
   “Can I use this current calling number as the booking number?”
6. If caller says yes:
   - store current caller number as booking contact
   - skip manual phone-number collection
7. If caller says no:
   - then ask for alternate mobile number
8. If STT is uncertain for name/number:
   - confirm what was heard instead of repeating the same open-ended question
9. Support Hindi/Hinglish normalization for:
   - days
   - time periods
   - yes/no
   - new patient / follow-up
   - doctor references

INTENT INTELLIGENCE SCOPE

Add support for smart handling of at least these existing practical cases without breaking the current flow:
- book appointment
- check doctor availability
- clinic info
- cancel appointment
- reschedule appointment
- human escalation
- emergency
- doctor info
- appointment status

If the project already has more intents, integrate safely.
Do not over-engineer beyond the current product maturity.

INTELLIGENCE LAYER DESIGN

Implement a structured intent engine that returns something like:

{
  intent: "BOOK_APPOINTMENT",
  confidence: 0.93,
  entities: {
    doctor_name: "Dr. Ananya Sharma",
    date_text: "Monday",
    normalized_date: "...",
    time_preference: "morning"
  },
  missing_fields: ["patient_name", "patient_type", "booking_number_confirmation"],
  next_action: "CHECK_AVAILABILITY"
}

IMPORTANT:
This does NOT need to replace the whole architecture.
It should simply guide the existing bot engine more intelligently.

RULE-BASED FIRST, SAFE FIRST

For stability and low risk:
1. Prefer rule-based or deterministic extraction first.
2. Use lightweight LLM/NLU support only if the current system already has a safe place for it.
3. Do not make the product dependent on expensive or unstable AI logic for deterministic booking basics.
4. Keep emergency detection hardcoded/high-priority.
5. Keep human escalation direct and safe.

ADMIN PANEL CONFIGURABILITY REQUIREMENT

The new intelligence must be configurable from admin panel as much as practical.

Add or extend admin settings so that a tenant/admin can control things like:
- intent intelligence enabled/disabled
- ask-only-missing-fields enabled/disabled
- availability-first mode enabled/disabled
- caller-number auto-confirmation enabled/disabled
- confidence threshold for auto-entity acceptance
- confidence threshold for confirmation prompts
- language normalization toggles
- smart clarification behavior
- low-confidence fallback behavior
- emergency keywords
- doctor name fuzzy matching tolerance
- slot suggestion behavior
- whether to prefer specific doctor vs earliest slot fallback

These settings must:
- be persisted in existing settings/runtime config if possible
- be exposed through admin UI in a safe and minimal way
- have sane defaults
- be backward-compatible
- not break existing settings consumers

IMPORTANT:
Do not create a giant messy admin UI.
Add only practical, clean controls.

IMPLEMENTATION PREFERENCE

Prefer one or more of the following low-risk approaches:
- add new intent intelligence service/module
- extend existing ai-service safely
- add a preprocessing layer inside bot-engine before stage transitions
- add entity memory helpers to session state
- add normalization helpers
- add admin-config backed runtime behavior flags

Choose the least risky design based on current codebase reality.

DO NOT DO THESE THINGS

- do not rewrite websocket server from scratch
- do not rewrite telephony gateway from scratch
- do not replace current appointment flow completely
- do not rename major APIs unless fully backward-compatible
- do not break current session state handling
- do not delete working code that is still useful
- do not convert the product into a fully LLM-dependent system
- do not add fragile complexity without need
- do not change everything at once

MINIMUM SMART BEHAVIORS TO IMPLEMENT

A. Full-utterance booking extraction
If caller already provided doctor + day + time preference, do not re-ask them.

B. Availability-first booking
When enough booking info is available, check schedule before asking for name/mobile/patient type.

C. ANI-based booking number confirmation
If caller number exists, ask whether to use it as booking contact.

D. Ask-only-missing-fields
Bot should only ask for fields not yet known.

E. Confirmation-over-repetition
If likely name/number heard, confirm instead of re-asking from scratch.

F. Day/time normalization
Examples:
- Monday / mande / मंडे / सोमवार
- morning / मॉर्निंग / सुबह
- afternoon / दोपहर
- evening / शाम

G. Doctor matching
Support exact + safe fuzzy matching against known doctors.

H. Non-breaking fallback
If intent intelligence fails, system should fall back to the current working flow.

THIS FALLBACK IS MANDATORY.

BACKWARD-COMPATIBLE FALLBACK RULE

If the new intelligence layer has low confidence, fails parsing, or sees an unsupported case:
- do not crash
- do not block
- do not produce a broken state
- simply continue through the existing working bot flow

This is one of the most important requirements.

SESSION STATE IMPROVEMENTS

Enhance session state carefully so the bot can remember extracted fields:
- doctor_name
- specialization
- preferred_date
- preferred_time_period
- chosen_slot
- caller_ani
- booking_contact_confirmed
- patient_name
- patient_type
- last_confirmed_entities
- last_clarification_target

But do this without breaking existing session handling.

APPOINTMENT FLOW INTEGRATION

Use the current appointment-service / booking logic.
Do not replace it.
Only improve what information is collected before that service is called.

If needed:
- add optional helper methods for availability lookup
- add safer slot suggestion helpers
- add caller-number mapping support
But do not break existing APIs.

UI / ADMIN DELIVERABLES

If admin web already has settings/runtime-config pages:
- extend them cleanly
- add small well-labeled settings section for intent intelligence
- wire settings to backend persistence
- update runtime config usage safely

Keep it operational, not decorative.

DELIVERABLES REQUIRED

1. Analyze current architecture and identify safest insertion points.
2. Implement intent intelligence layer without breaking existing product.
3. Add admin-configurable settings for the intelligence behavior.
4. Keep all current working call pipeline pieces intact.
5. Add fallback to legacy flow if new logic cannot confidently act.
6. Update bot flow behavior so it asks only for missing info.
7. Add caller-number confirmation workflow.
8. Add doctor/day/time intelligent pre-check logic.
9. Add tests or validation checks for critical flows.
10. Provide a final implementation summary.

TEST SCENARIOS YOU MUST VALIDATE

Validate at minimum these scenarios:

1. Existing old booking flow still works unchanged when smart layer is disabled.
2. Full-utterance booking:
   “मुझे डॉक्टर अनन्या शर्मा से सोमवार को सुबह अपॉइंटमेंट बुक करनी है”
   -> should check availability
   -> should not ask doctor/date/time again
3. Caller ANI confirmation:
   -> “Can I use this number as booking contact?”
   -> yes stores caller number
4. Alternate number path:
   -> user says no
   -> system asks for another number
5. Doctor unavailable on requested day:
   -> offer next valid day
6. Morning unavailable but same-day other slots exist:
   -> offer alternatives
7. Low-confidence parsing:
   -> fallback to old flow
8. Emergency utterance:
   -> emergency behavior still works immediately
9. Human escalation:
   -> transfer/escalation still works
10. Name confirmation:
   -> if partially heard, bot confirms instead of blindly repeating

CHANGE MANAGEMENT REQUIREMENT

When implementing:
- make small safe commits/changes
- preserve old behavior paths
- avoid hidden breaking changes
- prefer feature flags/config flags
- document defaults clearly

SUCCESS CRITERIA

This task is successful only if:
- the product remains working
- the call pipeline is not broken
- current working flow still exists
- smart intent behavior is added safely
- admin can configure the new intelligence
- bot becomes smarter in real booking conversations
- repeated unnecessary questions are reduced
- caller-number confirmation works
- the old stable behavior remains available as fallback

FINAL OUTPUT FORMAT REQUIRED FROM YOU

After implementation, provide:
1. What you found in the current codebase
2. What you intentionally did not change
3. What new modules/settings you added
4. How smart intent now works
5. How fallback to existing flow works
6. What admin panel controls were added
7. What tests/checks were done
8. Any risks or follow-up suggestions

WORK STYLE

Be conservative, practical, and product-safe.
Think like an engineer improving a live working product, not like someone doing a flashy rewrite.
Preserve stability first.
Add intelligence second.
Backward compatibility is mandatory.
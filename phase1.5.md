You are a senior telephony/backend engineer working inside an existing AI hospital telephony repository.

Your job is to implement ONLY PHASE 1.5 safely.

==================================================
PHASE 1.5 GOAL
==================================================

Replace the current mock dynamic greeting provider with a REAL Sarvam TTS greeting provider, while preserving the currently working telephony flow.

This is a minimal, safe enhancement.
Do not touch the rest of the call pipeline unless absolutely required.

==================================================
FIRST RULE: DO NOT TOUCH WHAT IS ALREADY WORKING
==================================================

Before making any code changes, inspect and document what is currently working.

The currently proven working flow is:

1. Static greeting path works
2. Dynamic greeting with mock provider works
3. Sarvam greeting failure path falls back to static welcome file
4. Call continues into mock STT -> bot-engine -> mock TTS
5. Hangup cleanup works

Your first responsibility is to preserve all of that.

Do not refactor broadly.
Do not redesign the architecture.
Do not modify working timing/pacing unless absolutely required for compatibility.

==================================================
MANDATORY STEP 1 — AUDIT CURRENT WORKING FLOW
==================================================

Before editing code, inspect the codebase and produce a short audit:

- where greeting routing currently happens
- where static welcome.sln playback happens
- where mock greeting provider currently lives
- where fallback to static file currently happens
- where outbound audio enqueue logic is implemented
- what files are involved
- what should NOT be touched

Explicitly identify:
- websocket entrypoint
- greeting config file/module
- greeting service/provider file
- playFile or equivalent audio playback path
- any audio format conversion helpers
- env/config loader

Then summarize:
- what is currently working
- what will remain untouched in Phase 1.5
- exact minimal files to change

Do not code before this audit.

==================================================
MANDATORY STEP 2 — READ LATEST OFFICIAL SARVAM DOCS
==================================================

Before coding, read the latest official Sarvam docs and use only the official docs as source of truth.

You must verify:
- TTS API endpoint and request format
- auth header / API key requirements
- response format
- supported codecs / sample rates
- whether REST or streaming TTS is safer for this codebase
- supported parameters for Bulbul v3
- unsupported parameters for Bulbul v3
- whether 8000 Hz output is supported directly
- what format conversion is needed for current telephony playback

If the docs show multiple options, choose the safest one for this repo.

==================================================
IMPLEMENTATION SCOPE — STRICT LIMIT
==================================================

Implement ONLY this:

- real Sarvam TTS greeting provider for greeting generation
- preserve config-driven greeting selection
- preserve mock provider
- preserve static fallback
- preserve current outbound playback path
- preserve current STT path
- preserve current bot-engine path
- preserve current reply TTS path after greeting

Do NOT implement:
- Sarvam STT
- full response TTS migration
- admin UI
- DB schema changes
- new orchestration layers
- broad provider framework refactors
- barge-in redesign
- queue management redesign

==================================================
PRIMARY REQUIREMENT
==================================================

The greeting provider behavior should become:

1. If ENABLE_DYNAMIC_GREETING=false
   -> use existing static welcome.sln path

2. If ENABLE_DYNAMIC_GREETING=true and GREETING_TTS_PROVIDER=mock
   -> use existing mock dynamic greeting path

3. If ENABLE_DYNAMIC_GREETING=true and GREETING_TTS_PROVIDER=sarvam
   -> use real Sarvam TTS to generate greeting audio

4. If Sarvam greeting fails for any reason
   -> log structured error
   -> fall back to existing static welcome.sln path
   -> do not crash the call
   -> continue existing call flow

==================================================
TECHNICAL GOAL
==================================================

Make the Sarvam provider generate audio that is compatible with the current telephony playback path.

The existing telephony path is already working.
Reuse it.

You must determine whether the safest integration is:

A. Sarvam REST TTS -> decode audio -> convert to telephony-safe PCM/slin16 -> enqueue
or

B. Sarvam streaming TTS -> directly feed telephony-safe chunks

Choose the safer option for THIS CURRENT CODEBASE, not the fanciest option.

Favor:
- minimal changes
- lower integration risk
- easy rollback
- compatibility with existing enqueue/send flow

If REST + conversion is safer for this codebase, use that.
If streaming is truly safer and simpler in this repo, explain why.

==================================================
AUDIO COMPATIBILITY REQUIREMENTS
==================================================

Respect current telephony requirements:

- 8kHz compatibility
- mono audio
- slin16 / pcm_s16le compatibility as required by current code
- chunking must remain compatible with current outbound sender
- no broken pacing
- no blocking of the hot path longer than necessary

If format conversion is needed:
- isolate it cleanly
- do not spread conversion logic all over the codebase
- prefer a small helper/service
- use temporary files only if absolutely necessary for a first safe implementation
- prefer in-memory processing if reliable and simple

==================================================
CONFIG REQUIREMENTS
==================================================

Use the existing config pattern already introduced in Phase 1.

At minimum support:
- ENABLE_DYNAMIC_GREETING
- GREETING_TTS_PROVIDER=mock|sarvam
- GREETING_TEXT
- SARVAM_API_KEY

If needed, add only minimal additional config such as:
- SARVAM_TTS_MODEL
- SARVAM_TTS_SPEAKER
- SARVAM_TTS_LANGUAGE
- SARVAM_TTS_SAMPLE_RATE

Do not overbuild config yet.

==================================================
ERROR HANDLING REQUIREMENTS
==================================================

Handle these safely:
- missing SARVAM_API_KEY
- empty GREETING_TEXT
- invalid Sarvam response
- unsupported codec / sample rate mismatch
- network timeout
- non-200 API response
- malformed audio payload
- hangup during greeting generation

Rules:
- never crash the server
- never break the websocket session because greeting generation failed
- log enough detail for debugging
- always preserve static fallback when possible

==================================================
FILES — CHANGE AS LITTLE AS POSSIBLE
==================================================

Prefer changing only the minimum likely set, for example:
- greeting-service.js
- greeting-config.js or existing config file
- .env.example
- possibly a tiny audio conversion helper if absolutely needed

Avoid touching:
- ws_audio_server.js except for minimal wiring if required
- STT logic
- bot-engine contract
- outbound sender loop logic
- receiver loop logic
- cleanup logic

==================================================
OUTPUT FORMAT
==================================================

Return work in this order:

1. CURRENT WORKING FLOW AUDIT
- relevant files
- current greeting routing
- what is already working
- what will remain untouched

2. SARVAM DOC DECISION
- REST vs streaming recommendation for this repo
- chosen audio format path
- why this is safest

3. IMPLEMENTATION PLAN
- exact files to change
- what each change does
- fallback behavior

4. CODE CHANGES
- smallest safe patch only

5. TEST PLAN
Provide exact validation steps for:
- static greeting still works
- mock greeting still works
- Sarvam greeting works
- missing key falls back safely
- bad response falls back safely
- call still continues into existing STT -> bot -> reply TTS flow

6. RISK NOTES
- any remaining manual checks
- any format/latency caveats
- what should be done in the next phase

==================================================
SUCCESS CRITERIA
==================================================

Phase 1.5 is successful only if:

- current working flow is preserved
- static mode still works
- mock dynamic mode still works
- Sarvam greeting works as a real provider
- failure still falls back safely
- no unrelated subsystem was changed
- no full STT/TTS migration was attempted

==================================================
IMPORTANT STOP CONDITION
==================================================

After real Sarvam greeting provider is implemented and tested, STOP.

Do not continue into:
- Sarvam STT
- full response TTS
- admin UI
- deeper architectural cleanup

End exactly at Phase 1.5.
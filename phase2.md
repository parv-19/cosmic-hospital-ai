You are a senior backend + real-time telephony engineer working on a production-grade AI voice system.

==================================================
CURRENT SYSTEM STATUS (DO NOT BREAK)
====================================

This system is already WORKING and VERIFIED:

* Asterisk → WebSocket → audio streaming is stable
* Greeting system supports:

  * static (welcome.sln)
  * mock
  * Sarvam TTS (REAL, WORKING)
* Sarvam greeting successfully:

  * calls API
  * decodes base64 audio
  * normalizes to 8kHz mono PCM
  * enqueues via existing enqueueOutbound()
* Sender loop pacing (1600 bytes/tick) is correct
* Call continues into:
  STT (mock) → bot-engine → reply TTS (mock)
* Fallback safety works (Sarvam failure → static greeting)
* Cleanup on hangup works

IMPORTANT:
THIS SYSTEM IS STABLE. DO NOT BREAK IT.

==================================================
GOAL (2 PARTS)
==============

PART 1 — FIX SMALL LOGGING/CONFIG ISSUE (PHASE 1.5 POLISH)
PART 2 — START PHASE 2 (REAL STT INTEGRATION, SAFE MODE)

==================================================
PART 1 — FIX LOGGING / CONFIG CLEANUP
=====================================

Current issue:
Sarvam request log shows:

* model: undefined
* speaker: undefined
* language: undefined
* sampleRate: undefined

BUT audio still works.

TASK:

1. Fix config propagation so logging reflects actual values.

2. Ensure greeting-config.js properly exposes:

   * SARVAM_TTS_MODEL
   * SARVAM_TTS_SPEAKER
   * SARVAM_TTS_LANGUAGE
   * SARVAM_TTS_SAMPLE_RATE

3. Ensure greeting-service.js:

   * reads correct keys from config
   * passes them to Sarvam API request
   * logs correct values

4. If env values are missing:

   * use safe defaults:
     model: "bulbul:v3"
     speaker: "shubh"
     language: "en-IN"
     sampleRate: 8000

5. DO NOT change behavior

   * Only fix logging + config mapping

==================================================
PART 2 — PHASE 2 (REAL STT INTEGRATION — SAFE MODE)
===================================================

We now begin Phase 2, but in NON-BREAKING mode.

CURRENT:
mock STT returns:
"appointment book karna hai"

TARGET:
Add real STT provider (Sarvam OR Google)

BUT STRICTLY FOLLOW THIS:

---

## RULES (CRITICAL)

1. DO NOT REMOVE mock STT
2. DO NOT BREAK current pipeline
3. DO NOT MODIFY sender loop
4. DO NOT MODIFY bot-engine contract
5. DO NOT MODIFY reply TTS
6. DO NOT CHANGE existing flow logic

---

## IMPLEMENTATION STRATEGY

Create STT provider abstraction (similar to greeting):

Example:
createSttService(config)

Providers:

* mock (existing)
* sarvam (new)

---

## CONFIG FLAG

Add:
STT_PROVIDER=mock | sarvam

Default:
mock

---

## SAFE SWITCHING LOGIC

If STT_PROVIDER=mock:
→ existing behavior (UNCHANGED)

If STT_PROVIDER=sarvam:
→ use real STT

If STT fails:
→ fallback to mock STT

---

## SARVAM STT IMPLEMENTATION

* Accept audio chunks from existing inbound buffer
* Convert buffer to expected format (WAV if required)
* Call Sarvam STT API
* Extract transcript
* Return text

---

## LOGGING

Log clearly:
[stt] provider=...
[stt] transcript=...
[stt] fallback triggered (if any)

---

## IMPORTANT CONSTRAINT

DO NOT change how audio is captured.

Only hook into:
"inbound batch captured" stage

---

## SUCCESS CRITERIA

After implementation:

1. With STT_PROVIDER=mock
   → system behaves EXACTLY SAME

2. With STT_PROVIDER=sarvam
   → transcript comes from real STT

3. If STT fails
   → fallback to mock STT

==================================================
STOP CONDITION
==============

After:

* logging issue fixed
* STT abstraction added
* sarvam STT basic integration working

STOP.

DO NOT:

* implement streaming STT
* modify TTS
* refactor architecture
* add UI

==================================================
OUTPUT
======

Return:

1. minimal code changes
2. new STT service structure
3. config updates
4. test steps

==================================================

REMEMBER:

You are NOT building from scratch.
You are extending a WORKING TELEPHONY SYSTEM.

PRIORITY:
SAFETY > CORRECTNESS > FEATURES

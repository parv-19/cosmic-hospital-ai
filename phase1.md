You are a senior backend/telephony engineer working inside an existing AI hospital telephony repository.

Your task is to implement ONLY PHASE 1 safely.

==================================================
PHASE 1 GOAL
==================================================

Replace the current static welcome-file-only behavior with a config-driven greeting path that can later support Sarvam TTS, while preserving the current working telephony pipeline.

This is a SAFE, MINIMAL change request.

Do not attempt full Sarvam STT/TTS integration.
Do not attempt admin UI.
Do not refactor unrelated files.
Do not rewrite the architecture.

==================================================
CURRENT REALITY
==================================================

The current system already has a working base flow:
- Asterisk connects to the Node WebSocket server
- start event is received
- inbound audio is received
- sender and receiver loops are working
- static welcome.sln playback is working
- mock STT exists
- bot-engine call exists
- mock TTS exists
- outbound pacing works
- hangup cleanup works

This existing working flow is highly valuable and must not be broken.

==================================================
WHAT TO DO FIRST
==================================================

Before changing code, inspect the codebase and identify:

1. websocket entrypoint
2. current static welcome playback logic
3. current playFile or equivalent logic
4. current config/env loading
5. safest place to introduce a small greeting config
6. which files should remain untouched

Then output a short audit:
- files inspected
- what each relevant file does
- exact place where static greeting is triggered
- exact minimal change plan

Do not code before this audit.

==================================================
IMPLEMENT ONLY THIS
==================================================

Implement ONLY a Phase 1 safe foundation:

1. Introduce a small config-driven greeting source
   - use the project’s existing config style if present
   - if none exists, add the smallest possible config module
   - greeting text should be editable from config, not hardcoded deep in logic

2. Add a feature flag for dynamic greeting
   Example idea:
   - enableDynamicGreeting: true/false

3. Add placeholder support for Sarvam greeting generation in a safe way
   - if Sarvam integration is already easy to wire, do it only for the greeting
   - if not, create a clean adapter/service boundary for later use
   - keep implementation minimal

4. Preserve fallback behavior
   - if dynamic greeting is disabled or fails, play existing welcome.sln
   - if any API/config issue happens, do not crash the call
   - log the reason and fall back safely

==================================================
STRICT SCOPE LIMIT
==================================================

You are allowed to change only what is necessary for:

- config-driven greeting text
- optional dynamic greeting path
- safe fallback to existing static welcome.sln

You must NOT modify:
- mock STT flow
- bot-engine contract
- mock TTS reply flow after the greeting
- websocket handshake contract
- send loop timing unless absolutely required
- broader admin/config platform
- database schema unless truly unavoidable

==================================================
IF SARVAM IS WIRED IN THIS PHASE
==================================================

If you implement live Sarvam greeting generation now, keep it minimal and safe:

- greeting only
- no STT integration
- no response TTS integration beyond greeting
- no broad provider framework
- no giant refactor

Requirements:
- use env/config for API key
- do not hardcode secrets
- keep sample rate / codec compatibility in mind
- if format conversion is needed, isolate it clearly
- if API fails, fall back to existing welcome.sln

If live Sarvam greeting is too risky in one patch, do this instead:
- add the config structure
- add a greeting provider interface or service stub
- preserve static file playback for now
- prepare the codebase cleanly for next step

Choose the safest option and explain why.

==================================================
ENGINEERING RULES
==================================================

1. Minimal changes only
2. No unnecessary rewrites
3. Keep diff small and reviewable
4. Preserve current logs or improve them slightly
5. Add structured logs around greeting decision path
6. Never let errors crash the server
7. Favor safe fallback over cleverness
8. Do not change working telephony timing unless required
9. Reuse current queue/playback path wherever possible
10. Respect existing code style

==================================================
EXPECTED OUTPUT FORMAT
==================================================

Return work in this order:

1. AUDIT SUMMARY
- relevant files
- current greeting path
- current risks
- minimal safe change strategy

2. IMPLEMENTATION PLAN
- exact files to change
- why each change is needed
- what will remain untouched

3. CODE CHANGES
- make the smallest safe patch

4. TEST PLAN
Include exact steps to test:
- existing static greeting still works
- dynamic greeting flag off
- dynamic greeting flag on
- failure fallback path
- call does not crash on TTS/config error

5. RISK NOTES
- what could still fail
- what should be tested manually before next phase

==================================================
SUCCESS CRITERIA
==================================================

This phase is successful if:

- current working call flow still works
- greeting text is no longer hardcoded deep in call logic
- there is a safe config-driven greeting path
- fallback to static welcome.sln still works
- no unrelated systems were changed
- repo is cleaner and better prepared for Phase 2

==================================================
IMPORTANT
==================================================

Do NOT continue to STT migration.
Do NOT continue to response TTS migration.
Do NOT build UI.
Do NOT do extra cleanup work.

Stop after Phase 1 safe implementation.
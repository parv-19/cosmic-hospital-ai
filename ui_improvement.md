You are a senior full-stack engineer working on a LIVE, WORKING hospital AI telephony project.

CRITICAL RULE:
DO NOT MODIFY the call flow, telephony pipeline, or any core backend logic.

This project is already WORKING in production-like state.
Your job is ONLY to improve and restructure the UI (Admin / Doctor / Read-only dashboards)
and expose existing runtime configuration cleanly.

==================================================
🚨 HARD RESTRICTIONS (DO NOT BREAK THIS)
==================================================

1. DO NOT change:
   - telephony-gateway
   - websocket audio handling
   - STT pipeline
   - LLM orchestration
   - TTS pipeline
   - bot-engine logic
   - appointment logic
   - doctor availability logic
   - transfer logic
   - transcript generation
   - cost calculation logic

2. DO NOT:
   - refactor backend services
   - rename APIs
   - change request/response structure
   - break existing fetch/save flows
   - remove working features

3. You are allowed to:
   - read everything
   - understand everything
   - improve UI
   - reorganize UI
   - create reusable UI components
   - connect UI to existing APIs/config

👉 If unsure: DO NOT CHANGE BACKEND.

==================================================
🎯 OBJECTIVE
==================================================

Transform the current UI into a **professional hospital AI receptionist SaaS dashboard**
inspired by the provided "Priya Receptionist Admin" screenshots.

Focus:
- clean UI
- structured layout
- config-driven admin control panel
- hospital-specific terminology
- role-based dashboards

==================================================
🧠 PHASE 1 — UNDERSTAND (MANDATORY)
==================================================

Before changing anything:

1. Analyze codebase:
   - frontend structure
   - pages/routes
   - components
   - API calls
   - role handling (admin/doctor/read-only)

2. Analyze `.env` + config:
   Identify all runtime-configurable values:
   - STT provider/model
   - TTS provider/model/voice
   - LLM provider/model
   - language
   - business hours
   - transfer numbers
   - cost settings
   - audio/VAD settings
   - prompts/messages

3. Understand call flow (READ ONLY):
   - incoming call → STT → transcript → LLM → decision → TTS → output
   - DO NOT MODIFY THIS FLOW

4. Identify:
   - which settings already exist
   - which APIs already exist
   - which data is already stored

Output a short internal summary (comments or markdown):
- Architecture Summary
- Config Summary
- UI Mapping Plan

==================================================
🎨 PHASE 2 — UI RESTRUCTURE (SAFE)
==================================================

Build a PROFESSIONAL SaaS UI:

-----------------------------------
GLOBAL LAYOUT
-----------------------------------

- Left Sidebar navigation
- Top status bar
- Clean page headers
- Card-based layout

Sidebar:
- Dashboard
- Analytics
- Call Logs
- Doctors / Directory
- Settings
- Prompts
- Behaviour

-----------------------------------
DASHBOARD
-----------------------------------

Show:
- Calls Today
- Transfers
- Appointments (if available)
- Total Cost
- Avg Duration

Table:
- Today’s Calls
- Transcript modal (reuse existing data)

-----------------------------------
ANALYTICS
-----------------------------------

- Total Calls
- Success Rate
- Avg Duration
- Cost
- Charts (reuse existing data)

-----------------------------------
CALL LOGS
-----------------------------------

- Filters
- CSV export
- Table
- Transcript modal

-----------------------------------
DIRECTORY (HOSPITAL ADAPTATION)
-----------------------------------

Adapt existing directory into:
- Hospital Info
- Doctors
- Departments
- Transfer routing

⚠️ Keep existing save logic unchanged

-----------------------------------
SETTINGS (VERY IMPORTANT)
-----------------------------------

Expose EXISTING config only:

Sections:
- Bot Identity
- Language & AI Stack
- STT / TTS / LLM
- Business Hours
- Cost Limits
- Pricing Defaults
- Audio Pipeline
- Cost Display Toggles

⚠️ RULE:
If a config is not actually backed by backend → DO NOT FAKE UI

-----------------------------------
PROMPTS
-----------------------------------

Editable:
- Greeting
- Goodbye
- Unclear messages
- After hours
- Extra instructions

-----------------------------------
BEHAVIOUR
-----------------------------------

- Transfer toggle
- Fallback action
- Routing behavior

-----------------------------------
DOCTOR DASHBOARD
-----------------------------------

Doctor sees:
- their calls
- availability
- schedule
- limited controls

-----------------------------------
READ-ONLY DASHBOARD
-----------------------------------

- view only
- no edit buttons
- no config access

==================================================
🎯 DESIGN SYSTEM
==================================================

- Light theme
- White + soft gray
- Blue-indigo accents
- Clean cards
- Rounded corners
- Soft shadows
- No clutter

==================================================
⚙️ IMPLEMENTATION RULES
==================================================

- Reuse existing APIs
- Do not change backend contracts
- Keep logic untouched
- Extract reusable UI components
- Keep code clean

==================================================
📦 FINAL OUTPUT
==================================================

Provide:

1. What you understood
2. What UI changes you made
3. Which files changed
4. What remained untouched
5. Any missing backend support (if any)

==================================================
🔥 FINAL REMINDER
==================================================

This is a LIVE WORKING TELEPHONY SYSTEM.

If you break call flow → FAIL.

ONLY improve UI + config visibility.

DO NOT TOUCH CORE CALL PIPELINE.
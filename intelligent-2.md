You are working on my EXISTING AI Hospital Telephony project.

IMPORTANT:
My product is already working.
The admin panel already shows doctor-specific settings, booking enabled flag, consultation fee, and business hours by day.
The booking flow currently updates dashboard/admin/doctor panels correctly and shows booked slots with patient names.
You must preserve that working behavior.

YOUR JOB:
Add true smart availability-first intent intelligence to the bot while preserving:
- existing call pipeline
- existing websocket audio flow
- existing STT/TTS behavior
- existing bot-engine APIs
- existing appointment/dashboard update behavior
- existing admin panel and doctor panel functionality
- existing booked-slot persistence logic

DO NOT BREAK ANY EXISTING CALL PIPELINE API.

CORE PRINCIPLE:
This is NOT a rewrite.
This is a SAFE enhancement layer.
The existing call flow is working. Keep it working.
Add intelligence before booking confirmation, not by replacing the current architecture.

==================================================
PHASE 1 — FIRST EXAMINE CURRENT WORKING STATE
==================================================

Before changing code, inspect and document:

1. Current websocket/call pipeline flow
   - where transcript enters
   - where bot-engine is called
   - where reply text is returned
   - where TTS is produced
   - where final booking is written

2. Current bot booking state machine
   - stages
   - transitions
   - existing APIs/contracts
   - current fallback behavior

3. Current doctor/admin settings model
   - doctor name
   - booking enabled
   - consultation fee
   - business hours per day
   - blocked/leave flags
   - any runtime config/settings already present

4. Current appointment/dashboard update mechanism
   - how slot booking updates admin panel
   - how doctor panel receives booked patient info
   - what data structure must remain unchanged

OUTPUT REQUIRED BEFORE CODING:
Create a short internal implementation note with:
- current working flow
- what must remain untouched
- safest insertion point for new intent intelligence
- which files/modules will be changed
- why the changes are low-risk and backward-compatible

Only after this analysis should implementation begin.

==================================================
NON-NEGOTIABLE CONSTRAINTS
==================================================

1. DO NOT break current websocket/call pipeline.
2. DO NOT break current bot-engine request/response contract unless optional fields are added safely.
3. DO NOT break dashboard/admin/doctor slot booking visibility.
4. DO NOT remove working logic that updates booked slots with patient names.
5. DO NOT replace the existing booking pipeline with a new architecture.
6. DO NOT force a rewrite of appointment-service APIs.
7. DO NOT break old flow when intelligence fails.
8. All smart behavior must have safe fallback to current existing flow.

==================================================
TARGET IMPROVEMENT
==================================================

Currently the bot can capture:
- doctor
- date/day
- time preference
- patient name
- caller-number confirmation
- patient type
and then book successfully.

But it still does NOT do the most important smart step:
it does not check doctor/day/time availability EARLY enough and then guide the conversation based on actual availability.

You must fix that.

==================================================
DESIRED NEW SMART BEHAVIOR
==================================================

When caller says something like:

"मुझे डॉक्टर अनन्या शर्मा से सोमवार को सुबह स्लॉट में अपॉइंटमेंट बुक करनी है"

The bot should do this:

1. Detect BOOK_APPOINTMENT intent.
2. Extract entities in one shot if possible:
   - doctor_name = Dr. Ananya Sharma
   - requested_day/date = Monday
   - requested_time_pref = morning
3. Immediately check:
   - does this doctor exist?
   - is booking enabled for this doctor?
   - does this doctor work on Monday according to business hours?
   - is Monday marked blocked/leave?
   - are morning slots actually available?
4. Then branch intelligently:

CASE A — slots available
Bot says something like:
"Dr. Ananya Sharma Monday morning available hain. 9:00 AM aur 10:30 AM slots available hain. Booking ke liye kya main current calling number use kar loon?"

CASE B — doctor works that day but morning full
Bot says:
"Dr. Ananya Sharma Monday ko available hain, lekin morning slots full hain. Afternoon mein 1:00 PM aur 2:30 PM available hain. Kya inmein se koi chalega?"

CASE C — doctor unavailable on that day
Bot says:
"Dr. Ananya Sharma Monday available nahi hain. Unki next availability Tuesday morning hai. Kya main Tuesday ke slots bataun?"

CASE D — doctor leave/block
Bot says:
"Dr. Ananya Sharma us din available nahi hain. Kya aap next available day dekhna chahenge ya kisi aur doctor ka slot?"

Only AFTER availability is resolved should the bot ask only missing fields such as:
- patient name
- caller number confirmation
- patient type

==================================================
MANDATORY RULES
==================================================

RULE 1 — Ask only missing fields
If doctor/day/time preference already captured, do NOT ask them again.

RULE 2 — Availability-first
As soon as sufficient doctor/date info exists, check actual schedule and slot availability before collecting the rest of patient details.

RULE 3 — Reuse current calling number
If caller ANI/current number exists:
Ask:
"Booking mobile ke liye current calling number ending XXXX use kar sakti hoon? Haan ya no boliye."
If yes:
- store current caller number as booking contact
- do NOT ask full mobile again
If no:
- ask alternate mobile number

RULE 4 — Confirm uncertain fields
If name or number is partially uncertain, confirm what was heard rather than blindly repeating the same question.

RULE 5 — Preserve booking persistence
The current system already books correctly and shows patient names in admin/doctor views. Keep using the existing booking write path.

RULE 6 — Safe fallback
If the new smart layer cannot confidently parse or resolve availability, fall back to the current working flow.

==================================================
WHAT TO USE AS SOURCE OF TRUTH
==================================================

Use the EXISTING admin/doctor settings data as source of truth for availability logic.

At minimum use:
- doctor name
- booking enabled flag
- business hours per day
- blocked flag
- leave flag

Do NOT invent a separate disconnected scheduling system if an existing one already drives the dashboard.

If additional helper logic is needed, derive slot availability from existing schedule/business-hours/booking records in a backward-compatible way.

==================================================
IMPLEMENTATION STRATEGY
==================================================

Add a small, safe “Availability Intent Resolver” layer inside or adjacent to the bot-engine.

It should:
1. Normalize transcript
2. Extract entities
3. Resolve doctor match
4. Resolve day/date
5. Resolve requested time preference
6. Query existing doctor settings / schedule / bookings
7. Produce:
   - resolved availability status
   - suggested slots
   - missing fields
   - next bot question

Do NOT replace the booking write path.
Do NOT change call pipeline APIs.
Do NOT change websocket transport.
Do NOT change STT/TTS contracts.

==================================================
OUTPUT CONTRACT FOR SMART LAYER
==================================================

Create an internal structured result similar to:

{
  intent: "BOOK_APPOINTMENT",
  confidence: 0.91,
  entities: {
    doctor_name: "Dr. Ananya Sharma",
    requested_day: "monday",
    requested_time_pref: "morning",
    caller_number: "9601546877"
  },
  availability: {
    doctor_exists: true,
    booking_enabled: true,
    doctor_available_that_day: true,
    day_blocked: false,
    matching_slots: ["09:00 AM", "10:30 AM"],
    alternative_slots: [],
    next_available_day: null
  },
  missing_fields: ["patient_name", "patient_type", "caller_number_confirmation"],
  next_action: "ASK_CALLER_NUMBER_CONFIRMATION"
}

This structure can remain internal.
Do not force a breaking API change if not needed.

==================================================
SLOT RESOLUTION REQUIREMENT
==================================================

Implement real slot resolution using existing data, without breaking current storage.

At minimum:
- use business hours per day from settings
- exclude blocked/leave days
- exclude already booked slots
- only offer slots that are actually available
- keep current booked slot persistence and admin/dashboard visibility intact

If the current system already has slot generation logic, reuse it.
If not, create a minimal helper that generates slots from business hours safely and non-destructively.

==================================================
ADMIN PANEL REQUIREMENT
==================================================

The admin panel already exists and must remain operational.

Add only minimal safe controls if needed, such as:
- smart availability mode enabled/disabled
- caller-number confirmation enabled/disabled
- ask-only-missing-fields enabled/disabled
- slot duration minutes
- morning/afternoon/evening mapping
- doctor fuzzy matching sensitivity
- low-confidence fallback enabled

These must:
- default safely
- be backward-compatible
- not clutter the UI
- not break existing settings pages

==================================================
DOCTOR / ADMIN DASHBOARD SAFETY
==================================================

The current system correctly shows booked slots with patient names in:
- admin panel
- doctor personal panel

This must continue exactly as before.

That means:
- continue using current booking persistence
- continue writing to the same appointment/booking data shape unless adding optional fields
- do not break existing list/detail pages
- do not break existing booked-slot display

==================================================
LOW-RISK FILE CHANGE PREFERENCE
==================================================

Prefer changes in this order:

1. Add availability helper/resolver module
2. Add transcript normalization helpers
3. Add doctor/day/time extraction helpers
4. Extend bot-engine decision logic before stage transitions
5. Reuse existing settings and appointment service
6. Add optional admin settings flags only if needed

Avoid mass refactors.

==================================================
MANDATORY TEST SCENARIOS
==================================================

Validate all of these:

1. Old flow still works when smart availability mode is disabled.
2. Existing call pipeline still works unchanged.
3. Caller says full request:
   "मुझे डॉक्टर अनन्या शर्मा से सोमवार को सुबह स्लॉट में अपॉइंटमेंट बुक करनी है"
   -> doctor/day/time extracted
   -> actual availability checked
   -> re-asking doctor/date/time avoided
4. If slots available:
   -> bot offers actual slots
5. If morning unavailable:
   -> bot offers alternatives
6. If doctor unavailable that day:
   -> bot offers next day
7. ANI confirmation flow still works
8. If ANI confirmed yes:
   -> store caller number without asking manual mobile
9. Booking still updates dashboard/admin/doctor panels correctly
10. If smart parsing fails:
   -> fallback to current old flow
11. Emergency flow still works
12. Human escalation still works

==================================================
DO NOT DO
==================================================

- Do not rewrite ws_audio_server.js from scratch
- Do not replace bot-engine API contracts
- Do not replace appointment-service with a new incompatible model
- Do not break dashboard slot display
- Do not create a second conflicting source of truth for doctor availability
- Do not break already working booking confirmation flow
- Do not remove current booking persistence behavior

==================================================
SUCCESS CRITERIA
==================================================

Task is successful only if:

1. Existing product still works
2. Call pipeline APIs remain intact
3. Dashboard/admin/doctor views still show booked patients correctly
4. Smart booking now checks real availability before unnecessary data collection
5. Bot asks only missing fields
6. Caller-number confirmation flow remains working
7. Fallback to old flow still exists
8. No regression in booking completion

==================================================
FINAL OUTPUT REQUIRED AFTER IMPLEMENTATION
==================================================

After implementation provide:

1. Current working flow discovered
2. What was intentionally left untouched
3. What new smart modules were added
4. How availability-first logic now works
5. How existing booking persistence was preserved
6. What admin settings were added/extended
7. What backward-compatible fallback exists
8. What test scenarios passed
9. Any known remaining limitations

WORK STYLE:
Be conservative.
Be product-safe.
Preserve stability first.
Add intelligence second.
Do not break a working live system.
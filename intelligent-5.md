You are working on a LIVE AI telephony system that is already stable and working in production.
Your job is to ADD reschedule and cancel appointment functionality WITHOUT breaking anything.

## CRITICAL RULES — READ BEFORE TOUCHING ANY FILE
1. DO NOT modify any existing working logic
2. DO NOT change any API contracts or response shapes
3. DO NOT refactor, rename, or restructure existing code
4. DO NOT touch ws_audio_server.js, slot engine, or dashboard files
5. ONLY ADD new intent handlers and stage flows
6. Every addition must be backward compatible
7. If unsure about any existing function name or shape — READ the file first, then use exact names

---

## STEP 1 — EXAMINE FIRST, CODE SECOND

Before writing a single line of code, do the following:

1. List all files in the project directory
2. Read and understand these files completely:
   - The main bot-engine file (likely bot-engine.js or index.js in a bot-engine or port 4004 folder)
   - The file that handles /process-call route
   - The file that manages session/state per call (keyed by uuid)
   - The file that does existing booking creation (createBooking or similar)
   - The file that does caller number lookup (the one that powers "Pichli baar wali details" — already working)
   - The file that fetches available slots (getAvailableSlots or similar)
   - The intent detection function (wherever book_appointment intent is detected)
   - The stage handler switch/if-else block
   - Any DB or storage layer (how bookings are persisted)
3. For each file you read, note:
   - Exact function names
   - Exact parameter shapes
   - Exact session object structure
   - Exact response object shape from /process-call
   - How "final" replies trigger hangup
   - How existing intents flow through stages

DO NOT PROCEED TO STEP 2 UNTIL YOU HAVE READ ALL RELEVANT FILES.

---

## STEP 2 — IDENTIFY EXACT INTEGRATION POINTS

After reading, identify and report:

1. Where is intent detected? (exact file + line range)
2. Where is the stage handler? (exact file + line range)
3. What is the session object shape? (list all current keys)
4. What does /process-call return? (exact response shape)
5. What function is used for caller lookup? (the one behind "Pichli baar wali details")
6. What function creates a booking? (exact name + params)
7. Is there a cancelBooking function already? If yes, what does it look like?
8. How does the system know to hang up after final reply? (what flag or stage triggers it)
9. What day/time extraction utilities exist?
10. What confirmation detection exists (yes/no/haan/sahi)?

---

## STEP 3 — ADD RESCHEDULE FLOW

Using EXACT function names and patterns found in Step 2, add these stages:

### New intents to detect (add to existing intent detector, do not replace):
Trigger intent = 'reschedule_appointment' when transcript contains any of:
reschedule, change, badal, alag din, shift, move, doosra din, aur din, time change,
appointment change karna, date change, slot change

### New stages to handle (add to existing stage handler, do not replace):

STAGE: waiting_for_intent + intent = reschedule_appointment
- Look up existing booking by caller mobile number using the SAME function that powers "Pichli baar wali details"
- If no booking found: reply "Aapke number pe koi active booking nahi mili. Nai appointment book karni hai?"
  next stage: waiting_for_intent
- If booking found: store in session, reply "Aapki booking hai — [doctor] ke saath [day] [time] par. Kaunse din reschedule karni hai?"
  next stage: reschedule_waiting_for_new_day

STAGE: reschedule_waiting_for_new_day
- Extract day from transcript using existing day extraction utility
- If day not found: reply "Din samajh nahi aaya — kaunsa din chahiye?"
  next stage: reschedule_waiting_for_new_day (reprompt, max 2 retries via existing retry pattern)
- If day found: call existing slot availability function with same doctorId from stored booking
- If no slots: reply "[day] ko [doctor] available nahi hain. Koi aur din?"
  next stage: reschedule_waiting_for_new_day
- If slots found: use smart framing — if 1 slot say it directly, if 2+ say "X ya Y available hai"
  reply "[day] ko [slot options] available hai — kaunsa time prefer karenge?"
  next stage: reschedule_waiting_for_new_slot

STAGE: reschedule_waiting_for_new_slot
- Match transcript to available slots using existing slot matching logic
- If unclear: reply "Time confirm karna tha — morning chahiye ya afternoon?"
  next stage: reschedule_waiting_for_new_slot
- If matched: reply "Theek hai — [doctor] ke saath [new day] [new time] par reschedule karoon? Confirm karein."
  next stage: reschedule_confirming

STAGE: reschedule_confirming
- Use existing confirmation detection (haan/yes/sahi/theek/bilkul etc.)
- If not confirmed: reply "Koi baat nahi. Koi aur din ya time batayein?"
  next stage: reschedule_waiting_for_new_day
- If confirmed:
  1. Cancel old booking using cancelBooking function (or equivalent — see Step 2)
  2. Create new booking using existing createBooking function with EXACT same param shape
  3. reply "Ho gaya! [doctor] ke saath [new day] [new time] par reschedule ho gayi. Reference: [last4]."
  next stage: rescheduled
  mark as final reply (same way existing 'booked' stage does it)

---

## STEP 4 — ADD CANCEL FLOW

### New intents to detect (add to existing intent detector, do not replace):
Trigger intent = 'cancel_appointment' when transcript contains any of:
cancel, band karo, nahi chahiye, hatao, delete, rok do, mat karo, nahi aana,
appointment cancel, booking cancel, cancel kar do

### New stages to handle:

STAGE: waiting_for_intent + intent = cancel_appointment
- Look up existing booking by caller mobile (same function as reschedule)
- If no booking: reply "Aapke number pe koi active booking nahi mili."
  next stage: waiting_for_intent
- If booking found: store in session, reply "[doctor] ke saath [day] [time] wali booking cancel karni hai? Confirm karein."
  next stage: cancel_confirming

STAGE: cancel_confirming
- Use existing confirmation detection
- If not confirmed: reply "Theek hai, booking cancel nahi ki. Koi aur kaam?"
  next stage: waiting_for_intent
- If confirmed:
  1. Call cancelBooking (or equivalent) with bookingId
  2. reply "[doctor] ke saath [day] [time] wali appointment cancel ho gayi. Nai booking karni ho toh bataiyega."
  next stage: cancelled
  mark as final reply (same way existing 'booked' stage does it)

---

## STEP 5 — SESSION KEYS TO ADD

Add these keys to the session object ONLY when needed (they will be undefined/null otherwise — existing code never reads them so no collision risk):

session.reschedule_existing        — full existing booking object
session.reschedule_new_day         — string
session.reschedule_available_slots — array
session.reschedule_confirmed_slot  — slot object
session.cancel_booking             — full booking object

---

## STEP 6 — IF cancelBooking DOES NOT EXIST

If you find no cancel function in the codebase, create a minimal one following the EXACT same pattern as createBooking:
- Same DB client
- Same error handling pattern
- Just update the booking status field to 'cancelled' (or equivalent — match whatever status values already exist)
- Do not invent a new pattern

---

## STEP 7 — VERIFY BEFORE FINISHING

After making all changes, verify:

1. [ ] Existing book_appointment flow — did any existing stage handler change? It must not.
2. [ ] Intent detection — are original intent keywords still intact?
3. [ ] Session object — do new keys conflict with any existing key names?
4. [ ] /process-call response shape — is it identical for all existing flows?
5. [ ] Final reply / hangup trigger — do new 'rescheduled' and 'cancelled' stages use the exact same final-reply pattern as 'booked'?
6. [ ] createBooking call in reschedule — does it use exact same params as the working booking flow?
7. [ ] Dashboard — since cancel just updates booking status in the same DB, dashboard will reflect it automatically. Confirm this is the case.
8. [ ] No new npm packages added unless absolutely required
9. [ ] No existing function was renamed or refactored

---

## STEP 8 — SHOW DIFF SUMMARY

After all changes, show:
1. Which files were modified (list only)
2. What was added to each file (brief description, not full code)
3. What was NOT touched
4. Confirmation that the two live call flows in the transcript (booking via "Pichli baar wali details" + fresh booking) would still work identically

---

## CONTEXT FROM LIVE SYSTEM

The system is confirmed working. From live transcripts:
- Caller mobile is known at call start (passed in WS start message)
- "Pichli baar wali contact details" lookup already works — reuse that exact function
- Session is scoped per uuid, destroyed on hangup
- TTS is handled by ws_audio_server.js — bot-engine only returns text replies
- Bot-engine runs at localhost:4004/process-call
- Final reply triggers hangup automatically — match same pattern as stage='booked'
- STT output is in Hindi/Hinglish mix — intent detection must handle both scripts
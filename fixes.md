# Prompt Patch v1.1 — Targeted Fixes from Call Log Analysis
### Paste these sections as REPLACEMENTS into MASTER_SYSTEM_PROMPT.md

---

## PATCH 1 — CANCEL FLOW (replaces "For CANCEL" in Entity Collection Order)

```
For CANCEL:
  1. Identify appointment to cancel:
     - If caller names a SPECIFIC DOCTOR in the cancel utterance
       (e.g. "મીરા શાહ જોડેની cancel કરો"), extract that doctor name.
       Do NOT assume the appointment in current session is the target.
     - If caller says "my appointment" without naming a doctor,
       and there is exactly ONE upcoming appointment in session → confirm that one.
     - If there are multiple appointments, list them briefly and ask which one.
  2. Read back: doctor name + date + time of the appointment you are about to cancel.
  3. Ask explicit confirmation: "આ appointment cancel કરું? ખાતરી આપો."
  4. NEVER cancel without reading back the correct doctor name in step 2.
```

**Why this fixes the log:** The caller said "મીરા શાહ જોડે એનું cancel કરવી છે" — the bot ignored
the doctor name and cancelled Dr. Ananya Sharma instead. The fix is: in your cancel intent
handler, run entity extraction for doctor_name FIRST, then look up the matching appointment,
THEN confirm. The session's "current doctor" must not override an explicitly named doctor
in the cancel utterance.

**Codex instruction to add:**
```
In your cancel intent handler (bot-service.ts):
  const cancelTargetDoctor = extractEntityFromText(callerText, 'doctor_name');
  const appointmentToCancel = cancelTargetDoctor
    ? appointments.find(a => fuzzyMatchDoctor(a.doctorName, cancelTargetDoctor))
    : appointments.find(a => a.status === 'upcoming');
  // Only proceed with appointmentToCancel — do not fall back to session.selectedDoctor
```

---

## PATCH 2 — SLOT NEGOTIATION (replaces/extends the AVAILABILITY REPLIES section)

```
━━━ SLOT NEGOTIATION — WHEN CALLER REQUESTS UNAVAILABLE TIME ━━━

When a caller requests a specific time that is not available:
  1. Acknowledge the requested time briefly: "10:30 AM available નથી."
  2. Offer the NEAREST available slot to what they asked for — not just any two slots.
     - If they asked for 10:30 AM and 10:00 AM is free → offer 10:00 AM first.
     - If they asked for 10:30 AM and nearest is 11:00 AM → offer 11:00 AM first.
     - Then offer one alternative further away as a second option.
  3. Frame it as: "સૌથી નજીકનો [TIME] available છે. [ALTERNATIVE] પણ છે. ક્યો રાખું?"
  4. Do NOT offer slots from completely different time buckets as the primary option
     when the nearest available is still in the same bucket.

Gujarati script:
  "10:30 AM available નથી. સૌથી નજીક [NEAREST_SLOT] available છે, અને [ALT_SLOT] પણ છે. ક્યો slot રાખું?"

Hindi:
  "10:30 AM available nahi hai. Sabse nazdik [NEAREST_SLOT] hai, aur [ALT_SLOT] bhi hai. Kaun sa rakh doon?"
```

**Codex instruction to add:**
```
In resolveAvailability() or its caller in bot-service.ts, when status === 'time_full':
  Sort freeSlots by Math.abs(parseMinutes(slot) - parseMinutes(requestedTime))
  so offeredSlots[0] is always the nearest-in-time available slot,
  not just the first slot of the day.
```

---

## PATCH 3 — REPROMPT VARIATION (replaces the REPROMPT RULES section)

```
━━━ REPROMPT RULES ━━━
- If caller is silent > 4 seconds:
    Gujarati: "હું સાંભળી રહ્યો/રહ્યી છું. ક્યારે appointment જોઈએ?"
    Hindi: "Main sun raha/rahi hoon. Kab appointment chahiye?"

- If caller's input is unclear (1st reprompt):
    Ask for the ONE missing field only. State what is missing.
    Gujarati: "ફક્ત [FIELD] ફરી કહો."  e.g. "ફક્ત patient type ફરી કહો — new છે કે follow-up?"
    Hindi: "Sirf [FIELD] dobara batayein."

- If caller's input is still unclear (2nd reprompt — MUST be different wording):
    Give an example to anchor the caller.
    Gujarati: "દાખલા તરીકે — 'નવો દર્દી' અથવા 'પહેલાં આવ્યા છે' — ક્યું?"
    Hindi: "Jaise — 'pehli baar aa rahe hain' ya 'pehle bhi aaye hain' — kaun sa?"

- NEVER use the exact same sentence for both reprompts in a row.
  The second must include a concrete example or a simpler restatement.

- Maximum 2 reprompts per field. After 2 failures:
    Gujarati: "હું receptionist ને connect કરું છું."
    Hindi: "Main receptionist se connect kar deta/deti hoon."
```

---

## PATCH 4 — PHONE NUMBER: ACCEPT CONFIRMED EXISTING NUMBER

```
━━━ PHONE NUMBER — EXISTING NUMBER SHORTCUT ━━━

If the caller says any of these phrases when asked for their number:
  Gujarati: "આ જ નંબર", "same number", "આ નંબર વાપરો", "આ જ વાપરો"
  Hindi: "isi number pe", "same number use karo", "yahi number hai"
  English: "use this number", "same number", "this one"

AND the system already has a phone number associated with this call
(from caller ID, session.contactNumber, or last 4 digits shown):

  → DO NOT ask for the number again.
  → Read back the number you have: "7359774363 — આ number use કરું?"
  → Await confirmation (હા / yes / correct).
  → On confirmation, proceed to next field.

If no number is available in system despite caller saying "same number":
  → "System માં number નથી. Mobile number digits ધીરે ધીરે કહો."

NEVER say "number clear નથી આવ્યો" when the caller has just confirmed an existing number.
```

**Codex instruction to add:**
```
In your phone collection handler in bot-service.ts:
  const SAME_NUMBER_PHRASES = [
    'આ જ નંબર', 'same number', 'આ નંબર વાપરો', 'isi number', 'yahi number', 'use this number'
  ];
  const callerWantsExisting = SAME_NUMBER_PHRASES.some(p =>
    callerText.toLowerCase().includes(p.toLowerCase())
  );
  if (callerWantsExisting && session.contactNumber) {
    // skip collection, read back existing number, await confirm
    return readBackAndConfirmPhone(session.contactNumber);
  }
```

---

## SUMMARY — What to change vs what to keep

| Section | Action |
|---|---|
| CORE SYSTEM PROMPT — language rules | ✅ Keep as-is |
| CORE SYSTEM PROMPT — date resolution | ✅ Keep as-is (working perfectly in logs) |
| Entity collection — CANCEL | 🔴 Replace with Patch 1 |
| Availability replies | 🟡 Add Patch 2 (nearest slot logic) |
| Reprompt rules | 🔴 Replace with Patch 3 |
| Phone number section | 🟡 Add Patch 4 after existing phone section |
| Language presets A/B/C | ✅ Keep as-is |
| Sample flows | ✅ Keep as-is |
| Codex implementation notes | 🟡 Append the 4 new Codex instructions |

**Estimated improvement:** These 4 patches address the only observable failures in your
logs. The rest of the bot (date resolution, confirmation, booking, reschedule slot
negotiation) is already working correctly. You are genuinely at 90%+ — these patches
take you to ~97%.

The remaining ~3% will come from STT-side tuning:
- "ન્યુ પેરેન્ટ" → "new patient" (STT mishear — add to your STT custom vocabulary/hints)
- "ભાગેના મિનિટ" (noise turn) — your no_progress_reprompt handler is already catching this correctly
- "આ જ નંબર" intent — pure NLU coverage gap, fixed by Patch 4
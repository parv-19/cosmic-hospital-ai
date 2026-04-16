You are working on a LIVE AI Telephony system that is already stable and functioning correctly.

Your goal is to enhance conversational intelligence WITHOUT modifying or breaking any existing working logic.

DO NOT:
- Change APIs
- Refactor architecture
- Modify booking persistence
- Touch slot engine logic
- Break admin/doctor panels

ONLY ADD:
Lightweight conversational intelligence and memory.

==================================================
TASKS TO IMPLEMENT
==================================================

1. Conversation Memory (lightweight, in-session)

Track:
- last_doctor
- last_day
- last_suggested_slots

Use this to:
- avoid repeating questions
- confirm context naturally

Example:
Instead of asking again:
“Doctor ka naam batayein”

Say:
“Dr. Rohan ke liye hi booking karni hai na?”

--------------------------------------------------

2. Smart Slot Framing

When suggesting slots:
- add slight guidance tone

Example:
“10:30 morning mein hai aur 12 thoda late ho jayega — kaunsa prefer karenge?”

Keep it subtle, not opinionated.

--------------------------------------------------

3. Silence Handling

If no response detected:
- add retry prompt

Example:
“Aap 10:30 ya 12:00 mein se choose kar sakte hain… main wait kar raha hoon.”

Do not spam.
Max 1–2 retries.

--------------------------------------------------

4. Error Recovery

If user input unclear:
- reframe instead of generic fallback

Example:
Instead of:
“Samajh nahi aaya”

Say:
“Time confirm karna tha — morning chahte hain ya afternoon?”

--------------------------------------------------

5. Micro Personalization

If caller number already used before:
- confirm reuse naturally

Example:
“Pichli baar wali details use kar doon?”

--------------------------------------------------

IMPLEMENTATION RULES
==================================================

- Add ONLY small helper functions or context variables
- Keep everything backward compatible
- Do not modify existing data structures in breaking way
- Do not slow down response time
- Do not introduce heavy LLM dependency where rules work

==================================================
SUCCESS CRITERIA
==================================================

- System behaves more natural
- No regression in booking
- No API changes
- No dashboard break
- Conversation feels smoother and smarter

==================================================
OUTPUT REQUIRED
==================================================

Explain:
1. What memory variables were added
2. Where they are stored
3. How they are used safely
4. What conversational improvements were introduced
5. Proof that existing system remains unaffected
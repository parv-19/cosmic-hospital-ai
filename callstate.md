You are a senior AI telephony product engineer and demo architect.

I have an AI hospital telephony project that already has:
- WebSocket call connection working
- welcome audio file playback working (`welcome.sln`)
- mock STT flow
- bot-engine integration
- dashboard concept for doctor admin and readonly/helpdesk view
- appointment-related backend services

Important reality:
- `welcome.sln` was only a test/demo greeting audio file.
- I now need a much more realistic approval/demo version.
- I need this demo to feel like a real AI hospital receptionist even before full cloud STT/TTS approvals are available.
- My goal is to win approval for the real-time STT/TTS phase.
- So I need a believable product demo, not a toy script.

Your task:
First examine the existing codebase carefully, understand what is already implemented, and then build a “real-feeling hospital appointment booking demo mode” on top of the current architecture.

==================================================
PRIMARY GOAL
==================================================

I need a demo where a stakeholder can call and feel:

“This is a real AI receptionist that can handle doctor appointment booking.”

Even if actual cloud STT/TTS is not fully active yet, the system must:
- behave realistically
- ask intelligent booking questions
- respond with polished selected phrases
- update doctor/admin/readonly dashboards in a believable way
- look like a serious product ready for real STT/TTS integration next

==================================================
CURRENT EXPECTATION
==================================================

I want the demo to simulate a real hospital receptionist flow such as:

1. Caller calls hospital number
2. Bot gives professional greeting
3. Bot understands booking intent from selected phrases
4. Bot asks specialization / doctor preference
5. Bot asks preferred date and time
6. Bot asks patient details
7. Bot confirms booking summary
8. Dashboard reflects each step
9. Final booking status appears clearly

This must feel smooth, realistic, and client-demo ready.

==================================================
STRICT CONTEXT
==================================================

- Do not depend on Google STT, ElevenLabs, or other paid cloud keys right now.
- Do not break the current WebSocket/audio flow.
- Do not remove current `welcome.sln` support unless replacing it in a controlled better way.
- Keep the architecture ready so later I can plug in real STT/TTS providers easily.
- Use config-driven demo flags.
- Reuse existing services and dashboards as much as possible.
- Do not rebuild the whole project.
- Make minimum safe but impressive changes.

==================================================
IMPORTANT PRODUCT DIRECTION
==================================================

This demo is not only for technical testing.
It is for APPROVAL.

That means the demo must emphasize:
- realistic hospital receptionist behavior
- structured booking conversation
- clean live status updates
- professional patient-facing phrases
- operational dashboards that make the system look product-ready

==================================================
WHAT I WANT BUILT
==================================================

A. DEMO CONVERSATION MODE

Build a deterministic but realistic appointment booking assistant.

The system should support selected caller phrases like:

Intent start:
- hello
- hi
- namaste
- mujhe appointment book karni hai
- doctor appointment chahiye
- appointment book karna hai

Specialization:
- skin doctor
- child specialist
- orthopaedic
- eye doctor
- dentist
- gynecologist
- cardiologist
- general physician

Doctor choice:
- Dr Sharma
- Dr Patel
- Dr Mehta
- koi bhi doctor chalega
- earliest available doctor

Date:
- aaj
- kal
- tomorrow
- monday
- next available
- earliest slot

Time:
- morning
- afternoon
- evening
- 10 baje
- 11 baje
- 4 pm
- 5 pm
- koi bhi time chalega

Patient details:
- mera naam Rahul hai
- mera naam Priya hai
- patient name Amit Shah
- mobile number 9876543210
- age 35
- female
- male
- new patient
- follow-up

Confirmation:
- yes
- confirm
- correct
- no
- change doctor
- change time
- cancel booking

These can be controlled, matched, and mapped.
No need for real free-form understanding yet.

==================================================
B. BOT PHRASE LIBRARY
==================================================

I want the bot to sound polished and professional.

Give the bot selected phrases for:

1. Greeting
- Namaste, hospital appointment desk mein aapka swagat hai. Main aapki appointment booking mein madad kar sakti hoon.
- Hello, welcome to the hospital appointment desk. I can help you book an appointment.

2. Intent confirmation
- Aap kis doctor ya kis specialization ke liye appointment lena chahte hain?
- Please tell me the doctor name or specialization.

3. Doctor preference
- Kya aap kisi specific doctor se milna chahte hain ya earliest available doctor chalega?
- Would you prefer a specific doctor or the earliest available doctor?

4. Date selection
- Aapko kis din appointment chahiye?
- Please tell me your preferred date.

5. Time selection
- Aapko morning, afternoon, ya evening mein slot chahiye?
- What time would you prefer?

6. Patient details
- Kripya patient ka naam batayein.
- Please tell me the patient name.
- Kripya contact number batayein.
- Please tell me the contact number.

7. Confirmation
- Main aapki details confirm karti hoon.
- I am confirming your booking details now.

8. Final booking summary
- Aapki appointment Dr. {{doctorName}} ke saath {{date}} ko {{time}} par request kar di gayi hai.
- Your appointment with Dr. {{doctorName}} has been requested for {{date}} at {{time}}.

9. Fallback
- Maaf kijiye, demo mode mein main filhaal selected appointment booking inputs hi samajh pa rahi hoon.
- Sorry, in demo mode I can currently handle selected appointment-booking inputs only.

10. End
- Dhanyavaad. Aapki booking request dashboard par update kar di gayi hai.
- Thank you. Your booking request has been updated in the system.

==================================================
C. DEMO STATE MACHINE
==================================================

Implement a deterministic booking state machine like:

- greeting
- waiting_for_intent
- waiting_for_specialization
- waiting_for_doctor_preference
- waiting_for_date
- waiting_for_time
- waiting_for_patient_name
- waiting_for_mobile
- waiting_for_patient_type
- confirming
- booked
- cancelled
- fallback

Rules:
- no random flow
- no unnecessary LLM dependency for transitions
- use structured state transitions
- keep it safe and predictable for demo

==================================================
D. DEMO STT MODE
==================================================

Since real STT is not available yet:
- create a controlled transcript simulation layer
- map inbound turns to known phrases
- allow testing the complete flow through predefined inputs
- keep architecture ready for future real STT integration

Use flags like:
- DEMO_MODE=true
- DEMO_STT_MODE=true

If there is already mock STT logic, improve it into a proper demo conversational input engine.

==================================================
E. DEMO TTS MODE
==================================================

Since real TTS provider keys are not available:
- keep current audio architecture
- replace test-only feel with more believable response handling
- allow response text + optional pre-recorded audio strategy
- preserve future compatibility with real TTS provider integration

Use flags like:
- DEMO_TTS_MODE=true

Possible acceptable demo approach:
- continue greeting audio playback
- selected short response audio support where available
- dashboard always shows exact bot speech text
- fallback to current mock response audio pipeline if needed

==================================================
F. DASHBOARD REQUIREMENTS
==================================================

Doctor Admin Dashboard must show:
- incoming call
- caller number
- call status
- booking stage
- selected specialization
- selected doctor
- preferred date
- preferred time
- patient name
- patient type
- contact number
- transcript history
- bot response history
- booking result
- timestamps

Readonly / Helpdesk Dashboard must show:
- caller number
- live/current stage
- short transcript summary
- specialization / doctor
- requested slot
- booking outcome
- final status

The dashboard should make the product look operational and real.

==================================================
G. DEMO BEHAVIOR MUST FEEL REAL
==================================================

This is critical.

Do NOT make it look like:
- a toy script
- one static voice file
- one repeated sentence
- random logs only

Instead make it feel like:
- a receptionist guiding the caller
- a structured booking assistant
- a telephony product with operational visibility
- a near-production system waiting only for real STT/TTS provider activation

==================================================
H. WHAT I WANT FROM YOU
==================================================

Your response must be in this structure:

1. Current codebase understanding
- relevant files only
- current call flow
- current demo/mock behavior
- current dashboard status

2. Gaps between current system and approval-ready demo
- exactly what feels fake today
- exactly what must change to feel real

3. Final demo architecture
- how demo mode will work
- how current code will be reused
- what new components/flags/state will be added

4. Exact files to modify
- file by file
- what changes go where

5. Controlled caller phrase mapping
- exact mapping table

6. Bot phrase library
- polished demo-ready phrases
- Hindi + English where useful

7. Booking state machine
- states
- transitions
- validation rules

8. Dashboard event/update model
- what updates appear when
- doctor admin vs readonly dashboard

9. Safe code patches
- minimal, targeted patches only
- preserve current working flow

10. Demo testing plan
- 10 realistic call scenarios
- caller input sequence
- expected bot replies
- expected dashboard reflection

11. Future upgrade path
- exactly how to replace demo STT with real STT
- exactly how to replace demo TTS with real TTS
- without rewriting the full system

==================================================
STRICT RULES
==================================================

- First inspect the real code before deciding.
- Do not assume file names blindly.
- Reuse current architecture.
- Do not break WebSocket flow.
- Do not break current greeting playback.
- Do not overengineer.
- Do not depend on paid APIs.
- Build specifically for hospital doctor appointment booking demo.
- Make it approval-ready and believable.

End goal:
When I demonstrate this system, stakeholders should feel:
“This already works like a real AI receptionist. Real STT/TTS is just the next activation step.”
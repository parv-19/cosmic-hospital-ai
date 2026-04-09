# PROJECT_OVERVIEW.md

# AI Telephony Platform for Hospitals and Clinics

## 1. What We Are Trying to Build

We are building a **real-time AI voice receptionist platform** for hospitals and clinics.

The goal is to create a system that can answer incoming phone calls, talk naturally with patients, understand what they want, perform simple operational tasks, and respond with voice in real time.

This is **not** just a chatbot.
This is a **telephony-first AI platform** designed for hospital reception and patient communication workflows.

The system should be able to:

- answer incoming calls automatically
- greet callers professionally
- understand spoken language using Speech-to-Text (STT)
- detect caller intent
- execute hospital/clinic-related workflows
- speak back using Text-to-Speech (TTS)
- transfer calls to a human when needed
- handle emergency phrases safely
- store session and call data
- allow doctor/clinic behavior to be configured from an admin system

The long-term vision is a **config-driven hospital AI calling platform** that can support multiple doctors, departments, and clinics from one codebase.

---

## 2. Why We Are Building This

Hospitals and clinics receive many repetitive calls every day:

- appointment booking
- rescheduling
- cancellation
- doctor availability questions
- clinic timings
- fees
- address/location queries
- transfer to reception/front desk
- urgent or emergency situations

Today these calls are usually handled manually by reception staff.

That creates common problems:

- missed calls during rush hours
- long waiting times
- repeated receptionist workload
- inconsistent information sharing
- limited after-hours support
- no structured call logging
- difficult scalability

This project aims to solve that by introducing an **AI receptionist** that can handle common calls automatically and consistently.

---

## 3. Product Vision

The product vision is:

> Build a modular, scalable, configuration-driven AI telephony platform for healthcare organizations, starting with a focused MVP for one clinic/doctor and later evolving into a production-grade multi-clinic system.

The platform should eventually support:

- multiple doctors
- multiple specialties
- different clinic rules
- configurable greetings and prompts
- different languages
- booking logic
- transfer logic
- emergency handling
- admin dashboards
- analytics and call logs
- future RAG/knowledge integration
- future concurrency and horizontal scaling

But **for now**, we are starting with an MVP.

---

## 4. MVP We Want to Build First

We do **not** want to build the full enterprise platform in phase 1.

We want to first build a working MVP that handles the basic end-to-end voice flow.

### MVP Objective
Create a working AI receptionist for **1 clinic / 1 doctor** that can handle a few core call scenarios.

### MVP Core Flow
1. incoming call arrives
2. system greets caller
3. caller speaks
4. STT converts speech to text
5. system detects intent
6. business logic runs
7. system speaks response using TTS
8. call ends or transfers

### MVP Intents
Only these intents should be handled first:

- `book_appointment`
- `cancel_appointment`
- `clinic_info`
- `human_escalation`
- `emergency`

### MVP Admin Configuration
Only these settings are needed initially:

- clinic name
- doctor name
- greeting message
- clinic timings
- consultation fee
- transfer number
- emergency message
- supported language
- booking enabled/disabled

---

## 5. What This Project Is Not (Right Now)

To avoid overengineering, phase 1 should **not** try to solve everything.

### Out of scope for initial MVP
- multi-tenant white-labeled architecture
- 25+ intents
- complete hospital department logic
- RAG knowledge base
- advanced analytics
- 150+ concurrent calls
- Kubernetes production orchestration
- complex multi-doctor scheduling engine
- insurance workflows
- teleconsult workflows
- report delivery workflows
- surgical/OT workflows

These can come later after the MVP becomes stable.

---

## 6. High-Level Architecture Direction

The desired architecture direction is based on a telephony-first, modular platform.

### Main Components

#### 1. Asterisk
Used for:
- telephony
- call control
- SIP integration
- bridging call audio to the application layer

#### 2. Telephony Gateway
Used for:
- receiving audio stream from telephony layer
- sending audio to STT
- sending TTS audio back to the call
- managing real-time streaming

#### 3. Bot Engine
Used for:
- running the call flow
- maintaining session progression
- deciding what happens next
- invoking business logic
- routing to AI or direct logic when needed

#### 4. AI Service
Used for:
- intent detection
- structured language understanding
- controlled response generation where needed

#### 5. Doctor/Clinic Service
Used for:
- doctor details
- clinic settings
- greeting configuration
- fee/timing/address information

#### 6. Appointment Service
Used for:
- booking
- cancellation
- simple availability logic
- future rescheduling support

#### 7. Redis
Used for:
- call session state
- temporary memory
- retry counters
- locks
- temporary booking state

#### 8. MongoDB
Used for persistent storage such as:
- doctors
- clinic settings
- patients
- appointments
- transcripts
- audit logs

#### 9. Admin Dashboard
Used for:
- managing clinic settings
- doctor settings
- greeting/prompt values
- booking toggle
- transfer number
- reviewing logs in future

---

## 7. Core Engineering Principles

The platform should follow these principles from the beginning:

### 1. MVP first
Build only the minimum working version first.

### 2. Modular design
Keep telephony, AI, business logic, and persistence separate.

### 3. Config-driven behavior
Do not hardcode every doctor/clinic rule in code.
Behavior should increasingly come from configuration.

### 4. Safe healthcare behavior
Emergency phrases must override normal flow.
The system must not behave irresponsibly.

### 5. Scalable foundation
Even if MVP runs on one server, code structure should support future scaling.

### 6. Clear separation of concerns
Each module should have a specific responsibility.

### 7. Observability later
Code should be structured so logs, metrics, and dashboards can be added cleanly.

---

## 8. Suggested Initial Tech Stack

### Backend / Services
- Node.js
- Express.js

### Admin Frontend
- React
- Tailwind CSS

### Database
- MongoDB

### Cache / Session / Locking
- Redis

### Telephony
- Asterisk

### Reverse Proxy
- Nginx

### Deployment
- Ubuntu server
- Docker later after MVP stabilizes

### AI / Voice Layer
Provider selection can remain configurable, but architecture should support:
- STT provider
- TTS provider
- LLM provider

The first codebase should keep these integrations abstract so providers can be swapped later.

---

## 9. Functional Flow Example

### Booking Flow Example
1. caller calls clinic
2. system greets caller
3. caller says: “I want to book an appointment”
4. STT converts speech to text
5. bot engine identifies intent = `book_appointment`
6. system checks clinic/doctor settings
7. system asks for required details
8. appointment service stores booking
9. system confirms booking by voice
10. transcript and outcome are logged

### Clinic Info Example
1. caller asks: “What is the consultation fee?”
2. intent = `clinic_info`
3. doctor/clinic service fetches fee from config/database
4. system replies with TTS

### Human Escalation Example
1. caller says: “Connect me to reception”
2. intent = `human_escalation`
3. system transfers the call to the configured number

### Emergency Example
1. caller says emergency-related phrase
2. emergency rule overrides everything
3. system responds with emergency message
4. system transfers or ends safely according to configured logic

---

## 10. Initial Data We Need

For MVP, we need to maintain data for:

### Doctors
Basic doctor profile and booking settings.

### Clinic Settings
Clinic-level operational config:
- timings
- fee
- greeting
- transfer number
- emergency message
- supported language
- booking toggle

### Patients
Basic patient/caller information.

### Appointments
Simple booking and cancellation records.

### Transcripts
Store call text and outcomes for future review.

### Audit Logs
Track important admin changes and booking actions.

---

## 11. Initial Redis Use

Redis should be used for short-lived operational data such as:

- active call session state
- temporary intent/session memory
- retry counts for unclear caller responses
- temporary booking locks
- temporary call-flow state

Redis is not the source of truth.
MongoDB remains the durable source of truth.

---

## 12. Expected End State of Phase 1

At the end of MVP phase, we want to have:

- a fresh project structure
- working backend services
- basic admin panel
- MongoDB models
- Redis session handling
- basic health routes
- config/env management
- telephony integration skeleton
- STT/TTS integration placeholders or first working provider
- working intent handling for MVP intents
- basic booking and clinic info flow
- human transfer flow
- emergency override flow

---

## 13. Future Direction After MVP

Once MVP is stable, future phases may include:

- reschedule flow
- repeat caller personalization
- configurable flow engine
- doctor-specific prompts
- multilingual switching
- FAQ/RAG knowledge base
- call analytics dashboard
- transcript viewer
- role-based admin access
- multi-doctor / multi-clinic support
- horizontal scaling
- provider failover
- audit and reporting improvements

---

## 14. What Codex / Antigravity Should Help Build

The coding assistant should help build this project in a phased, safe way.

### Required output style
The assistant should:
- think like a senior architect + implementation engineer
- avoid overengineering
- design a clean folder structure
- define services clearly
- create phase-wise execution
- generate code incrementally
- use environment-based config
- include validation and error handling
- keep integrations swappable
- mark placeholders clearly where credentials/providers are required

### First goal
The first goal is **not** full production scale.

The first goal is:

> Build a clean, maintainable, working MVP of a hospital AI receptionist platform from scratch on Ubuntu.

---

## 15. Final Summary

In simple terms:

We are trying to build a **hospital AI receptionist platform** that answers calls, understands patients, helps with bookings and clinic queries, and responds using voice in real time.

We want:
- telephony-first architecture
- modular services
- Redis session state
- MongoDB persistence
- admin-driven settings
- safe emergency handling
- future scalability

But for now, we want a **focused MVP** that works end to end and gives us a strong base for future expansion.
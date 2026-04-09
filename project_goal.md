You are a senior full-stack architect and implementation engineer.

I am starting from **zero** on a fresh Ubuntu server for a new project.

Your job is to help me **design and build an MVP first**, then evolve it into a **production-grade AI telephony platform for hospitals/clinics**.

## Project Goal

Build a real-time AI voice receptionist system for hospitals/clinics that can:

* answer incoming calls
* greet callers naturally
* understand speech via STT
* detect caller intent
* handle core flows like:

  * appointment booking
  * rescheduling
  * cancellation
  * clinic/hospital info
  * doctor info
  * human transfer
  * emergency escalation
* speak responses via TTS
* store session/conversation state
* use configuration-driven behavior per doctor/clinic
* later support dashboards, multi-doctor setup, and scale

## Important Context

This is a **fresh start**. No existing project is built yet.
So do **not assume code already exists**.
You must help me create the project from scratch in a professional way.

## Architecture Direction

The desired architecture direction is:

* **Asterisk** for telephony / call control
* **Node.js** for the main orchestration layer and platform services
* **Redis** for session state, locks, retry counters, and temporary call memory
* **MongoDB** for persistent data such as:

  * doctors
  * patients
  * appointments
  * schedules
  * transcripts
  * configs
  * audit logs
* **React + Tailwind** for admin dashboard
* **Nginx** for reverse proxy
* **Docker** later, after MVP is stable

## Platform Principles

Follow these rules strictly:

1. Start with an **MVP**, not the full enterprise product.
2. Keep the system **modular** and **config-driven**.
3. Avoid overengineering in phase 1.
4. Design services so they can scale later.
5. Separate:

   * telephony
   * AI/reasoning
   * business logic
   * persistence
   * admin UI
6. Prefer **clear folder structure**, **maintainable code**, and **production-style conventions**.
7. Do not make fake assumptions; if something is unclear, state it clearly.
8. Keep the initial MVP focused on working end-to-end for **1 clinic / 1 doctor / a few intents**.

## MVP Scope to Build First

Build only this first:

### Core call flow

1. incoming call
2. greeting
3. STT converts speech to text
4. intent detection
5. execute simple action
6. TTS response
7. end call or transfer

### Intents for MVP

Only these first:

* book_appointment
* cancel_appointment
* clinic_info
* human_escalation
* emergency

### Admin MVP

Only these first:

* clinic name
* doctor name
* greeting message
* clinic timings
* consultation fee
* transfer number
* emergency message
* supported language
* enable/disable booking

## Expected Services / Modules

For the first version, structure the project into something like:

* telephony-gateway
* bot-engine
* ai-service
* appointment-api
* doctor-service
* admin-frontend
* admin-backend

You may refine the structure if needed, but keep it clean and realistic.

## What I want from you

I want you to work in the following order:

### Step 1 — Product and architecture clarity

First, explain:

* what exact MVP we are building
* what is included
* what is excluded for now
* why this phased approach is correct

### Step 2 — Recommended tech stack

Give final stack choices for:

* backend runtime
* frontend
* database
* cache
* telephony
* STT
* TTS
* intent detection
* deployment

Also mention which choices are best for:

* fast MVP delivery
* low complexity
* future scalability

### Step 3 — Project folder structure

Design a clean root folder structure for the full project.
Example:

* /server
* /services
* /admin
* /infra
* /docs
* /.env files
* /scripts

Make it professional.

### Step 4 — Database design

Design initial MongoDB collections for MVP:

* doctors
* clinic_settings
* patients
* appointments
* transcripts
* audit_logs

For each collection give:

* purpose
* important fields
* sample document

### Step 5 — Redis/session design

Define Redis key patterns for:

* session
* slot lock
* retry count
* temporary booking state

### Step 6 — API design

Design the initial APIs needed for MVP.
For each API provide:

* route
* method
* input
* output
* purpose

### Step 7 — Service responsibilities

Clearly define responsibility of each service/module:

* telephony gateway
* bot-engine
* ai-service
* doctor service
* appointment service
* admin backend
* admin frontend

### Step 8 — Build plan

Create a **phase-wise build plan**:

* Phase 1: server setup
* Phase 2: backend foundation
* Phase 3: telephony + STT + TTS
* Phase 4: intent and flow engine
* Phase 5: admin dashboard
* Phase 6: persistence/logging
* Phase 7: testing and deployment

For each phase include:

* goal
* tasks
* deliverables
* success criteria

### Step 9 — Coding plan

Break implementation into small steps that Codex/Antigravity can execute one by one.
Each step should be small enough to implement safely.

### Step 10 — First implementation

After planning, begin with the **actual first implementation step**:

* initialize project structure
* create starter package files
* basic server bootstrap
* health check routes
* config/env loader
* base README

## Output Style Required

Your output must be extremely practical and structured.

Use this format:

1. Project understanding
2. Final MVP definition
3. Recommended stack
4. Folder structure
5. DB design
6. Redis design
7. API design
8. Service design
9. Phase plan
10. Step-by-step implementation tasks
11. First code to generate

## Important Constraints

* Do not jump directly into advanced features like RAG, 25 intents, multi-tenant scaling, or 150 concurrent calls.
* Mention them only in a “future phases” section.
* The first version must be realistic for a solo developer / small team.
* Prefer simplicity and correctness over unnecessary complexity.
* Keep the codebase ready for future production hardening.

## Engineering Expectations

Whenever you generate code or structure:

* use clear naming
* use environment-based config
* separate controller/service/repository logic cleanly
* include validation
* include error handling
* include comments only where useful
* avoid fake integrations
* mark placeholders clearly for STT/TTS/provider credentials

## Final Requirement

At the end of your response, give:

1. the final recommended MVP architecture
2. the exact folder tree
3. the exact implementation order
4. the first safe coding step to start immediately

Base your design on a modern hospital AI telephony product vision with config-driven flows, Redis session state, MongoDB persistence, Node.js services, and Asterisk-oriented telephony design. The architecture should support future evolution into a scalable healthcare voice platform.    

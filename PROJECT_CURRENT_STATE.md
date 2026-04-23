# AI Hospital Telephony - Current Project State

## Short Summary

This project is a pnpm monorepo for an AI hospital or clinic receptionist platform.

Its goal is to receive phone-call audio, convert speech to text, understand the caller's intent, run appointment or clinic workflows, generate a spoken reply, and expose an admin dashboard for doctors, settings, calls, appointments, prompts, analytics, and provider configuration.

The codebase is currently a working MVP-style platform with:

- A React admin dashboard.
- Multiple Node/Express backend services.
- MongoDB models for doctors, users, appointments, patients, call logs, FAQs, and bot flows.
- Redis connection helpers, mostly prepared for future session/state use.
- A bot engine with a large conversation state machine for booking, rescheduling, cancellation, transfer, emergency handling, availability checking, and fallback behavior.
- A standalone WebSocket audio server for real-time Asterisk-style audio streaming.
- Mock and configurable STT/TTS/LLM provider support.

It is not only a skeleton anymore. The project already contains real workflow logic, demo data seeding, admin APIs, call logging, cost tracking, and voice streaming experiments.

## Repository Shape

```text
.
|-- apps/
|   `-- admin-web/                  React + Vite admin dashboard
|-- services/
|   |-- doctor-service/             Auth, doctors, settings, calls, analytics, admin APIs
|   |-- appointment-service/        Appointment CRUD-style service
|   |-- ai-service/                 Simple keyword intent detection service
|   |-- bot-engine/                 Main call conversation engine
|   `-- telephony-gateway/          Express + WebSocket telephony gateway scaffold
|-- packages/
|   |-- shared-config/              Shared environment/config loading
|   |-- shared-db/                  MongoDB connection, schemas, seed data
|   |-- shared-redis/               Redis helper package
|   `-- shared-utils/               Logger, HTTP response helpers, security/JWT helpers
|-- docs/                           Extra notes
|-- infra/                          Infrastructure scripts placeholder
|-- ws_audio_server.js              Standalone real-time audio WebSocket server
|-- greeting-service.js             TTS/greeting audio generation helper
|-- stt-service.js                  STT helper
|-- audio-format.js                 Audio format helper
|-- welcome.wav / welcome.sln       Static welcome audio assets
|-- package.json                    Root workspace scripts
|-- pnpm-workspace.yaml             Workspace definition
`-- .env.example                    Expected environment variables
```

## Runtime Stack

The main technologies are:

- Node.js 20+
- pnpm workspace
- TypeScript for services and shared packages
- Express for backend HTTP APIs
- WebSocket support through `ws`
- React + Vite for admin UI
- Tailwind CSS in the admin frontend
- MongoDB via Mongoose
- Redis helper package
- Standalone JavaScript audio bridge scripts for voice experiments

## Root Scripts

The root `package.json` defines these important commands:

```text
pnpm run build:shared
pnpm dev
pnpm build
pnpm start
```

`pnpm dev` builds the shared packages and starts these services in parallel:

- `doctor-service`
- `appointment-service`
- `ai-service`
- `bot-engine`
- `telephony-gateway`
- `admin-web`

The standalone `ws_audio_server.js` is not part of the root `pnpm dev` script. It appears to be run separately when testing real-time audio/Asterisk integration.

## Environment And Ports

`.env.example` defines the expected local service ports:

```text
doctor-service:       4001
appointment-service:  4002
ai-service:           4003
bot-engine:           4004
telephony-gateway:    4005
admin-web:            5173
ws_audio_server.js:   8080 by default
```

Important URLs:

```text
DOCTOR_SERVICE_URL=http://localhost:4001
APPOINTMENT_SERVICE_URL=http://localhost:4002
AI_SERVICE_URL=http://localhost:4003
BOT_ENGINE_URL=http://localhost:4004
TELEPHONY_GATEWAY_URL=http://localhost:4005
VITE_DOCTOR_SERVICE_URL=http://localhost:4001
VITE_BOT_ENGINE_URL=http://localhost:4004
```

Voice/demo flags:

```text
DEMO_MODE=true
DEMO_STT_MODE=true
DEMO_TTS_MODE=true
PLAY_WELCOME_FILE=true
ENABLE_DYNAMIC_GREETING=false
GREETING_TTS_PROVIDER=mock
STT_PROVIDER=mock
```

Provider-related config exists for Sarvam STT/TTS and can be extended for OpenAI, Deepgram, ElevenLabs, Claude, etc.

## High-Level Architecture

The intended system has this shape:

```text
Caller phone call
    |
    v
Telephony layer / Asterisk
    |
    v
WebSocket audio bridge
    |
    v
STT provider
    |
    v
Bot Engine
    |       \
    |        -> Doctor Service: settings, doctors, runtime config
    |        -> Appointment Service: book/cancel/reschedule
    |        -> AI Service: legacy/simple intent detection
    v
TTS provider
    |
    v
Audio sent back to caller
```

The admin web app talks mostly to `doctor-service`.

## Backend Services

### 1. Doctor Service

Path:

```text
services/doctor-service
```

This is currently the largest administrative/business service.

Responsibilities:

- Login and JWT-based auth.
- Current user lookup.
- Doctor listing, creation, and updates.
- Clinic settings and runtime bot config.
- Dashboard totals.
- Appointment listing, booking, cancellation, and rescheduling from admin-facing APIs.
- Call log listing and transcript retrieval.
- Live call listing.
- Bot settings management.
- Provider health/config validation.
- FAQ management.
- Bot flow management.
- Analytics.
- User creation.

Important route file:

```text
services/doctor-service/src/routes/index.ts
```

Important controller:

```text
services/doctor-service/src/controllers/doctor-controller.ts
```

Important service:

```text
services/doctor-service/src/services/doctor-service.ts
```

Main public/unprotected endpoints:

```text
GET  /health
POST /login
GET  /doctor
GET  /clinic-settings
GET  /runtime-config
```

Main protected endpoints:

```text
GET  /me
GET  /dashboard
GET  /analytics
GET  /doctors
POST /doctors
PUT  /doctors/:id
GET  /appointments
POST /book
POST /cancel
POST /reschedule
GET  /calls
GET  /calls/live
GET  /calls/:id
GET  /calls/:id/transcript
GET  /settings
PUT  /settings
POST /provider-health
GET  /faq
PUT  /faq
GET  /bot-flows
PUT  /bot-flows
POST /users
```

Auth roles:

```text
ADMIN
DOCTOR
READ_ONLY
```

The service scopes some data for doctor users so a doctor sees only their own doctor-specific records.

### 2. Bot Engine

Path:

```text
services/bot-engine
```

This is the brain of the call workflow.

Responsibilities:

- Process caller transcript turns.
- Maintain session state.
- Detect intent and choose workflow actions.
- Handle appointment booking flow.
- Handle appointment reschedule flow.
- Handle appointment cancellation flow.
- Handle clinic info and doctor selection.
- Handle human transfer.
- Handle emergency escalation.
- Handle fallback attempts and fallback policies.
- Resolve doctor availability and alternative slots.
- Store transcript history and bot response history.
- Track usage events and estimated cost ledger.
- Sync session/call state into MongoDB call logs.
- Optionally use configured LLM provider to rewrite certain replies.

Important route file:

```text
services/bot-engine/src/routes/index.ts
```

Important service:

```text
services/bot-engine/src/services/bot-service.ts
```

Important related files:

```text
services/bot-engine/src/services/availability-resolver.ts
services/bot-engine/src/services/provider-factory.ts
services/bot-engine/src/services/costing.ts
services/bot-engine/src/repositories/call-repository.ts
```

Endpoints:

```text
GET  /health
POST /process-call
POST /usage-ledger
POST /end-session
GET  /demo/sessions
GET  /demo/sessions/:sessionId
```

The `process-call` endpoint is called by the standalone audio server after STT produces a transcript.

### 3. Appointment Service

Path:

```text
services/appointment-service
```

Responsibilities:

- List appointments.
- Create/book appointments.
- Cancel appointments.
- Reschedule appointments.

Important route file:

```text
services/appointment-service/src/routes/index.ts
```

Endpoints:

```text
GET  /health
GET  /appointments
POST /appointments
POST /book
POST /cancel
POST /reschedule
```

This service is simpler than `doctor-service`. It delegates to an appointment repository. The bot engine calls it during booking, cancellation, and rescheduling.

### 4. AI Service

Path:

```text
services/ai-service
```

Responsibilities:

- Keyword-based intent detection.

Important files:

```text
services/ai-service/src/services/intent-service.ts
services/ai-service/src/repositories/intent-repository.ts
```

Endpoints:

```text
GET  /health
POST /detect-intent
```

This is more of a legacy/simple service now. The bot engine contains much richer direct intent and state handling. `ai-service` is still used by the bot engine's legacy call path.

### 5. Telephony Gateway

Path:

```text
services/telephony-gateway
```

Responsibilities:

- HTTP health endpoint.
- Mock audio event logging endpoint.
- WebSocket server at `/stream`.
- Audio event repository/service scaffold.

Important files:

```text
services/telephony-gateway/src/server.ts
services/telephony-gateway/src/services/telephony-service.ts
services/telephony-gateway/src/controllers/telephony-controller.ts
```

Endpoints:

```text
GET  /health
POST /events/mock-audio
WS   /stream
```

This appears to be the clean TypeScript gateway scaffold. The more active real-time audio logic currently lives in the root `ws_audio_server.js`.

## Standalone Audio WebSocket Server

File:

```text
ws_audio_server.js
```

This file appears to be the current experimental/active real-time audio bridge.

Responsibilities:

- Starts a WebSocket server on `PORT` or `8080`.
- Accepts binary audio chunks.
- Accepts JSON control messages like `start`, `info`, and `hangup`.
- Fetches clinic settings from `doctor-service`.
- Plays a static welcome file or generates a dynamic greeting.
- Detects speech energy from 8 kHz PCM audio chunks.
- Batches caller audio into utterances.
- Sends audio to `stt-service.js`.
- Sends transcript to `bot-engine` at `/process-call`.
- Generates reply audio through `greeting-service.js`.
- Sends reply audio frames back to the connected socket.
- Sends transfer or hangup control messages when needed.
- Records STT/TTS usage events.
- Calls `/end-session` on cleanup.

Important constants:

```text
MAX_CHUNK_SIZE = 320
INTERVAL_MS = 100
BOT_ENGINE_URL = http://localhost:4004/process-call
WELCOME_FILE = welcome.sln
```

Important behavior:

- Assumes 8 kHz mono signed 16-bit PCM style framing.
- Sends 5 frames per 100 ms tick.
- Uses speech energy thresholding to determine whether audio contains speech.
- Uses mock scripted transcripts when configured STT provider is `mock`.
- Falls back to mock TTS if provider TTS fails.

This script is important, but it is outside the TypeScript service structure. That makes it powerful for experiments but harder to maintain long term.

## Admin Web App

Path:

```text
apps/admin-web
```

The admin dashboard is a React + Vite app.

Main files:

```text
apps/admin-web/src/App.tsx
apps/admin-web/src/api.ts
apps/admin-web/src/context/AuthContext.tsx
apps/admin-web/src/components/layout/AppShell.tsx
```

Important UI areas:

```text
components/admin/dashboard/DashboardPage.tsx
components/admin/directory/DirectoryPage.tsx
components/admin/call-logs/CallLogsPage.tsx
components/admin/analytics/AnalyticsPage.tsx
components/admin/settings/SettingsPage.tsx
components/admin/settings/BehaviourPage.tsx
components/admin/settings/AIConfigPage.tsx
components/admin/settings/PromptsPage.tsx
```

What the frontend does:

- Shows login page if no user is authenticated.
- Stores and uses JWT auth through `AuthContext`.
- Calls `doctor-service` APIs.
- Displays dashboard stats.
- Manages doctors and directory data.
- Manages appointments.
- Shows call logs and transcripts.
- Shows analytics.
- Edits bot behavior/settings/prompts/provider config.

The frontend API base is resolved from:

```text
VITE_PLATFORM_API_URL
VITE_DOCTOR_SERVICE_URL
/api fallback
```

## Shared Packages

### shared-db

Path:

```text
packages/shared-db
```

Responsibilities:

- Connect to MongoDB.
- Continue booting if Mongo is unavailable.
- Define Mongoose schemas and models.
- Seed default platform data.

Main models:

- `User`
- `Doctor`
- `DoctorBotSettings`
- `Patient`
- `Appointment`
- `CallLog`
- `DoctorFaq`
- `BotFlow`

Seeded demo users:

```text
admin@sunrise.test      Admin@123
doctor@sunrise.test     Doctor@123
readonly@sunrise.test   Viewer@123
ananya@sunrise.test     Ananya@123
rohan@sunrise.test      Rohan@123
meera@sunrise.test      Meera@123
```

Seeded demo doctors:

- Dr. Ananya Sharma, General Medicine
- Dr. Rohan Patel, Cardiology
- Dr. Meera Shah, Dermatology

### shared-utils

Path:

```text
packages/shared-utils
```

Responsibilities:

- Logging.
- Standard HTTP success/error response helpers.
- Security helpers such as password hashing/verification and JWT signing.

### shared-config

Path:

```text
packages/shared-config
```

Responsibilities:

- Shared config/environment helpers.

### shared-redis

Path:

```text
packages/shared-redis
```

Responsibilities:

- Redis client creation and connection helper.

Redis is connected by services, but the current heavy call session logic still appears to live mostly in memory and MongoDB sync rather than a fully Redis-backed distributed session store.

## Main Data Concepts

### User

Represents an admin, doctor, or read-only user.

Important fields:

- email
- name
- role
- passwordHash
- doctorId

### Doctor

Represents a doctor profile.

Important fields:

- doctorId
- name
- specialization
- fee
- clinicName
- active
- language
- scheduleLabel
- availability
- contactNumber

### Doctor Bot Settings

Represents bot behavior for a doctor.

Important fields:

- greetingMessage
- afterHoursMessage
- fallbackResponse
- supportedIntents
- transferNumber
- bookingEnabled
- emergencyMessage
- fallbackPolicy
- intelligenceSettings
- costDisplay
- conversationPrompts
- llmProviders
- sttProviders
- ttsProviders

### Appointment

Represents a patient appointment.

Important fields:

- appointmentId
- patientId
- patientName
- phoneNumber
- doctorId
- doctorName
- appointmentDate
- reason
- status
- source

Statuses:

```text
booked
cancelled
rescheduled
```

### Call Log

Represents a voice session and its outcome.

Important fields:

- sessionId
- callerNumber
- callStatus
- bookingStage
- latestIntent
- selectedSpecialization
- selectedDoctor
- doctorId
- appointmentDate
- preferredDate
- preferredTime
- patientName
- patientType
- contactNumber
- bookingResult
- outcome
- costSummary
- usageLedger
- transcriptHistory
- startedAt
- updatedAt
- endedAt

### FAQ

Doctor-scoped or global FAQ entries for future bot knowledge.

### Bot Flow

Stores flow definitions. The current bot engine appears mostly hardcoded/state-machine driven, but bot flow storage exists for future configurable flows.

## Current Call Flow

A realistic current flow looks like this:

```text
1. Asterisk or another telephony layer connects to ws_audio_server.js.
2. The WebSocket sends a JSON start message with uuid/caller info.
3. ws_audio_server.js fetches clinic settings from doctor-service.
4. The server plays a static welcome file or dynamic TTS greeting.
5. Caller speaks.
6. The server detects speech chunks and waits for end-of-speech.
7. Captured audio is sent to STT.
8. STT returns a transcript.
9. The transcript is posted to bot-engine /process-call.
10. Bot engine updates/creates session state.
11. Bot engine asks doctor-service for runtime config and appointment-service for appointment actions as needed.
12. Bot engine returns a reply, intent, action, stage, and session.
13. ws_audio_server.js generates reply TTS audio.
14. Reply audio is streamed back over WebSocket.
15. Transfer/hangup controls are sent if the bot chooses that action.
16. Session is ended and synced when the socket closes or call completes.
```

## Supported Conversation Capabilities

The bot engine is designed to handle:

- Greeting and initial prompt.
- Appointment booking.
- Doctor/specialization selection.
- Availability-aware slot suggestions.
- Patient name collection.
- Mobile number collection and confirmation.
- New patient/follow-up collection.
- Booking confirmation.
- Rescheduling existing appointments.
- Cancelling existing appointments.
- Human escalation/transfer.
- Emergency detection/response.
- Fallback attempts.
- Fallback policies:
  - ask again
  - transfer
  - end call
  - create callback
- End conversation/goodbye intent.
- Optional configured LLM reply generation for certain actions.

## Provider Support

There are provider config structures for:

LLM:

- mock
- OpenAI
- Claude
- Sarvam

STT:

- mock
- Sarvam
- OpenAI
- Deepgram

TTS:

- mock
- Sarvam
- OpenAI
- ElevenLabs

`doctor-service` has a `/provider-health` endpoint that validates selected provider/model/key references without making a paid request.

## What Is Already Good

- Clear monorepo separation between apps, services, and shared packages.
- Most services have consistent Express structure: config, routes, controllers, services, repositories, middlewares.
- Admin dashboard exists and is connected to real APIs.
- Mongo schemas cover the important platform entities.
- Seed data makes local demos easier.
- Bot engine contains much more than simple intent detection.
- Conversation prompts and provider settings are configurable per doctor.
- There is role-based access control.
- Call logs include transcript history and cost summaries.
- The audio bridge has real turn-taking concepts: listening, processing, speaking.
- Fallback behavior and transfer handling are already considered.

## Main Concerns And Improvement Opportunities

### 1. Two Telephony Paths Exist

There is a TypeScript `telephony-gateway` service and a separate root `ws_audio_server.js`.

The root JS server appears to contain the real voice loop, while the TypeScript gateway is cleaner but much thinner.

Improvement direction:

- Decide which path is the source of truth.
- Move the standalone JS audio logic into `services/telephony-gateway`.
- Type the session state and audio pipeline.
- Keep one documented WebSocket protocol.

### 2. Bot Engine Is Very Large

`services/bot-engine/src/services/bot-service.ts` is very large and contains many responsibilities.

Improvement direction:

- Split intent matching, stage transitions, prompt rendering, appointment operations, session persistence, and provider reply generation into smaller modules.
- Add focused tests for each booking/reschedule/cancel stage.
- Keep the external behavior unchanged while refactoring.

### 3. Runtime State Is Not Fully Distributed

The bot engine has in-memory session repository behavior and syncs to MongoDB. Redis helpers exist, but Redis does not appear to be the main session store yet.

Improvement direction:

- Move active call session state to Redis.
- Keep MongoDB for durable call logs and analytics.
- Add session expiry and cleanup policy.

### 4. Validation Is Mostly Manual

Controllers manually check request bodies. There is no obvious central schema validation layer.

Improvement direction:

- Add a validation library such as Zod.
- Define request/response contracts per service.
- Share frontend/backend types where practical.

### 5. Tests Are Missing Or Not Obvious

No clear test setup appears in the workspace.

Improvement direction:

- Add unit tests for bot-stage transitions.
- Add integration tests for service APIs.
- Add frontend smoke tests for login/dashboard/settings.
- Add audio pipeline tests for chunking and turn-state behavior.

### 6. Service Boundaries Overlap

`doctor-service` can create/cancel/reschedule appointments, while `appointment-service` also owns appointment operations.

Improvement direction:

- Decide whether `doctor-service` is an admin facade or whether appointment operations should only go through `appointment-service`.
- Avoid duplicated booking/cancel/reschedule logic across services.

### 7. Security Needs Hardening Before Production

Current local seed credentials and fallback secrets are useful for MVP but not production-safe.

Improvement direction:

- Require `JWT_SECRET` in production.
- Remove or gate demo credentials.
- Add password policy and rate limiting.
- Add audit logging for settings/user changes.
- Review PHI/PII handling in call logs and transcripts.

### 8. Provider Integration Needs Clear Runtime Rules

Provider configs exist, but operational behavior needs stronger boundaries.

Improvement direction:

- Define provider failover policy clearly.
- Store only secret references, never secret values.
- Add real provider health checks as optional admin actions.
- Add timeout/retry/circuit breaker behavior.

### 9. Documentation Is Spread Across Many Markdown Files

There are many planning docs and phase docs at the root.

Improvement direction:

- Keep `README.md` as quick start.
- Keep one current architecture doc.
- Move old phase notes to `docs/archive`.
- Add API docs generated or maintained from route definitions.

## Suggested Next Improvement Phases

### Phase 1: Stabilize The Current MVP

- Make the project run reliably with one command.
- Document exact startup order.
- Confirm Mongo/Redis optional vs required behavior.
- Add health check page or script.
- Fix any TypeScript build errors.
- Add basic smoke tests.

### Phase 2: Clean Telephony Ownership

- Move `ws_audio_server.js` logic into `services/telephony-gateway`.
- Define the WebSocket control protocol.
- Type the audio session state.
- Add structured logs for call/session IDs.
- Add tests for audio frame chunking and turn state.

### Phase 3: Refactor Bot Engine Safely

- Extract stage handlers.
- Extract prompt rendering.
- Extract appointment actions.
- Extract intent helpers.
- Add regression tests for booking, reschedule, cancel, emergency, and transfer flows.

### Phase 4: Production Readiness

- Central validation.
- Better auth/security.
- Redis-backed active sessions.
- Observability.
- Deployment scripts.
- Provider failover and monitoring.
- Better admin audit trail.

## Best Questions To Ask Next

You can ask for improvements like:

- "Make the project easier to run locally and document startup."
- "Refactor the bot engine without changing behavior."
- "Move ws_audio_server.js into telephony-gateway TypeScript."
- "Add tests for the appointment booking conversation."
- "Add Zod validation to doctor-service APIs."
- "Make Redis the session store for active calls."
- "Review security risks before production."
- "Improve the admin dashboard UX."
- "Create an API documentation file for all services."

## Final Understanding

This project is an MVP hospital AI receptionist platform. It already has a real admin layer, persistent MongoDB models, configurable doctors and bot behavior, call log analytics, a strong conversation engine, and an experimental real-time audio bridge.

The biggest next step is not adding more features blindly. The best next step is to stabilize the runtime path, consolidate telephony logic, split the large bot engine into testable modules, and add validation/tests so future improvements do not break the call flow.

# AI Telephony SaaS Upgrade

## 1. Current system and safe boundaries

Working today:
- `ws_audio_server.js` is the live websocket audio loop.
- It accepts Asterisk websocket audio, plays `welcome.sln`, batches inbound audio, mocks STT, calls `bot-engine`, generates mock TTS audio, and sends playback frames back.
- `services/bot-engine` owns conversational state progression and appointment-booking stage management.
- `services/doctor-service` and `services/appointment-service` were placeholder config/data sources.
- Logs are emitted through `console` in `ws_audio_server.js` and `logger` in the TypeScript services.
- Session state was in-memory in `services/bot-engine/src/repositories/call-repository.ts`.

Do not modify:
- `ws_audio_server.js` call transport loop
- `welcome.sln` / welcome playback behavior
- Asterisk websocket shape
- STT/TTS adapter sequencing

Extension points used:
- `doctor-service` now acts as the SaaS control API.
- `appointment-service` is persisted but still keeps its old `/appointments` contract for the bot.
- `bot-engine` still owns call decisions, but now syncs call logs/transcripts to Mongo and reads runtime config from the control API.

## 2. Target architecture

Layers:
- Telephony runtime: `ws_audio_server.js`
- Bot engine: `services/bot-engine`
- Control/API layer: `services/doctor-service`
- Appointment persistence adapter: `services/appointment-service`
- Shared DB/auth utilities: `packages/shared-db`, `packages/shared-utils`
- SaaS UI: `apps/admin-web`

Flow:
- Asterisk -> websocket audio server -> bot-engine -> appointment/doctor services -> DB
- Admin/Doctor/Read-only UI -> doctor-service APIs -> DB
- Bot-engine -> doctor-service `/runtime-config` -> DB-backed doctor/bot configuration

## 3. Collections

Mongo collections introduced in `packages/shared-db/src/index.ts`:
- `users`
- `doctors`
- `doctorbotsettings`
- `patients`
- `appointments`
- `calllogs`
- `doctorfaqs`
- `botflows`

Stored fields cover:
- doctors, specialization, fee, contact, schedule label, availability
- doctor bot settings, greeting, after-hours, fallback, supported intents, transfer number, emergency message
- appointments, patient info, doctor mapping, status, source
- call logs, current node, status, outcome, transcript history, session timing
- RBAC users with role and optional `doctorId`

## 4. API surface

Implemented in `services/doctor-service`:
- `POST /login`
- `GET /me`
- `GET /dashboard`
- `GET /analytics`
- `GET /doctors`
- `POST /doctors`
- `PUT /doctors/:id`
- `GET /appointments`
- `POST /book`
- `POST /cancel`
- `POST /reschedule`
- `GET /calls`
- `GET /calls/live`
- `GET /calls/:id/transcript`
- `GET /settings`
- `PUT /settings`
- `GET /faq`
- `PUT /faq`
- `GET /bot-flows`
- `PUT /bot-flows`
- `POST /users`
- compatibility endpoints: `GET /doctor`, `GET /clinic-settings`, `GET /runtime-config`

Implemented in `services/appointment-service`:
- `GET /appointments`
- `POST /appointments`
- `POST /book`
- `POST /cancel`
- `POST /reschedule`

## 5. RBAC

Roles:
- `ADMIN`: full access
- `DOCTOR`: scoped to own doctor/settings/calls/appointments
- `READ_ONLY`: analytics and operational visibility only

JWT/auth:
- HMAC-signed token helpers in `packages/shared-utils/src/security.ts`
- Express auth/role middleware in `services/doctor-service/src/middlewares/auth.ts`

Seeded demo users:
- `admin@sunrise.test / Admin@123`
- `doctor@sunrise.test / Doctor@123`
- `readonly@sunrise.test / Viewer@123`

## 6. Frontend structure

Updated `apps/admin-web` to a single-role-aware React console with:
- login screen
- sidebar navigation by role
- admin dashboard, doctors, appointments, calls, transcripts, settings, analytics
- doctor dashboard, appointments, schedule, calls, transcripts, settings
- read-only dashboard, calls, transcripts, analytics
- live call monitor polling
- FAQ and JSON bot-flow editor

## 7. Migration plan

1. Start Mongo and existing services as usual.
2. Start `doctor-service`; it seeds users/doctors/settings if the DB is empty.
3. Start `appointment-service`; it continues serving `/appointments` for the bot.
4. Start `bot-engine`; it keeps existing call behavior, but now mirrors sessions into `calllogs` and reads `/runtime-config`.
5. Start `admin-web` and log in with seeded users.
6. Move hardcoded prompt content and schedules into DB via Settings/FAQ/Bot Flow screens.
7. Once validated, swap mock STT/TTS adapters with real services without changing the control layer.

## 8. Known follow-ups

- Add tests once dependencies are installed in this environment.
- Add stricter DTO validation and pagination.
- Add websocket/SSE for true streaming live transcripts if polling is not enough.
- Add dedicated `transcripts` collection if transcript volume outgrows embedded call-log storage.

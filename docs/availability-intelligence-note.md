# Availability Intelligence Implementation Note

## Current Working Flow

- `ws_audio_server.js` receives websocket audio, detects end-of-speech, sends audio to STT, then calls bot-engine at `POST /process-call`.
- Bot-engine returns `{ reply, stage, action, session }`; `ws_audio_server.js` converts `reply` to TTS and streams audio back on the same websocket.
- Bot-engine stores call/session progress through `CallRepository` and persists final call logs through the existing call log model.
- On booking confirmation, bot-engine writes the appointment through the existing appointment-service `POST /appointments` endpoint.
- Appointment-service writes the existing `Appointment` shape: `patientName`, `phoneNumber`, `appointmentDate`, `reason`, `doctorId`, `doctorName`, `status`.
- Admin and doctor views already read these existing appointment/call records, so the booking write shape must remain unchanged.

## Current Booking State Machine

- Main stages: `waiting_for_intent`, `waiting_for_specialization`, `waiting_for_doctor_preference`, `waiting_for_date`, `waiting_for_time`, `waiting_for_patient_name`, `waiting_for_mobile`, `waiting_for_patient_type`, `confirming`, `booked`, `cancelled`, `fallback`.
- Existing fallbacks reprompt, transfer, end call, or create callback based on configured fallback policy.
- Current API contracts remain unchanged: websocket control/audio messages, bot-engine `/process-call`, doctor-service `/runtime-config`, and appointment-service `/appointments`.

## Current Source Of Truth

- Doctor settings live in shared DB `Doctor`: `name`, `specialization`, `fee`, `scheduleLabel`, `availability[]` with `day`, `start`, `end`, `blocked`, `leave`.
- Doctor bot settings carry `bookingEnabled` and intelligence flags.
- Existing appointments live in shared DB `Appointment` and are exposed by appointment-service `GET /appointments`.

## Safe Insertion Point

- Add an availability resolver inside bot-engine after transcript/entity extraction and before asking the next missing booking field.
- The resolver only reads existing runtime doctors and appointments; it does not write appointments or alter the booking persistence path.

## Files To Change

- `services/bot-engine/src/services/availability-resolver.ts`: new helper for slot generation and availability decisions.
- `services/bot-engine/src/services/bot-service.ts`: call the helper before field prompts when doctor/date/time are known.
- `services/doctor-service/src/services/doctor-service.ts`: add optional `availability` to runtime doctor payload, backward-compatible.

## Low-Risk/Backward-Compatible Reasoning

- Existing API requests and responses remain valid; new data is optional.
- Existing booking confirmation still writes through the same appointment-service endpoint.
- If availability resolution cannot run, the bot falls back to the current ask-only-missing-fields flow.
- No websocket, STT, TTS, appointment write, dashboard, or doctor panel contract is replaced.

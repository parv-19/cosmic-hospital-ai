# AI Hospital Telephony

MVP monorepo for a hospital AI receptionist platform. This workspace includes:

- `apps/admin-web` for the admin dashboard
- `services/*` for telephony, orchestration, AI, doctor, and appointment services
- `packages/*` for shared config, utils, Mongo, and Redis helpers

## Quick start

1. Copy `.env.example` to `.env`
2. Install dependencies with `pnpm install`
3. Start all apps with `pnpm dev`

## Included MVP endpoints

- `doctor-service`
  - `GET /health`
  - `GET /doctor`
  - `GET /clinic-settings`
- `appointment-service`
  - `GET /health`
  - `GET /appointments`
  - `POST /appointments`
- `ai-service`
  - `GET /health`
  - `POST /detect-intent`
- `bot-engine`
  - `GET /health`
  - `POST /process-call`
- `telephony-gateway`
  - `GET /health`
  - `POST /events/mock-audio`
  - WebSocket server on `/stream`

## Notes

- MongoDB and Redis helpers are wired in with safe placeholders.
- Services continue to boot even if MongoDB or Redis is unavailable locally.
- AI intent detection and telephony streaming are intentionally mocked for the MVP scaffold.


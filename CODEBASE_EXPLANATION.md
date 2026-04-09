# AI Hospital Telephony Platform - Codebase Details

This document provides a comprehensive overview of the `ai-hospital_telephony` monorepo structure. You can copy and provide this file to other AI assistants (like ChatGPT or Codex) so they understand the context, architecture, and current state of the project before suggesting improvements or writing code.

---

## 1. High-Level Architecture & Tech Stack

This project is a **real-time AI voice receptionist platform** designed to act as an automated receptionist for clinics and hospitals. It handles incoming calls, extracts intent via Speech-to-Text (STT), interacts with business logic, and responds via Text-to-Speech (TTS).

**Core Tech Stack:**
- **Monorepo:** `pnpm` workspaces
- **Backend Services:** Node.js, Express, TypeScript
- **Frontend Admin Web:** React, Vite, Tailwind CSS
- **Databases & Caching:** MongoDB (Mongoose), Redis (ioredis)
- **Telephony Flow:** Asterisk (planned) + Telephony Gateway WebSockets

---

## 2. Directory & Component Details

The platform is cleanly divided into `apps`, `packages`, `services`, and `infra`. Below is the directory tree and the responsibility of each folder and file within the ecosystem.

### A. Root Configuration

The root directory contains infrastructure mappings and project rules.

- **`PROJECT_OVERVIEW.md` / `project_goal.md` / `project skeleton.md`**: Foundational documents explaining the *why* and the *how* of the architecture. They explicitly establish this as an MVP focusing on core flows (book, cancel, info, human transfer, emergency) without overengineering.
- **`pnpm-workspace.yaml`**: The pnpm workspace config tying the `/apps`, `/packages`, and `/services` directories together. 
- **`package.json`**: Exposes fundamental root workspace scripts.
- **`tsconfig.base.json`**: Standard TypeScript compilation rules enforcing strict mode across all microservices and apps.
- **`.env.example` / `.env`**: Centralized configurations for application ports, MONGO_URI, REDIS_URL, and internal API URLs.

### B. Microservices (`/services/`)

The core domain logic is broken down into Express/Typescript microservices. **Every microservice follows this identical folder structure:**
- `src/server.ts`: Entry point initializing Express.
- `src/config/env.ts`: Validates service-specific environment variables.
- `src/routes/index.ts`: Standard Express route definitions.
- `src/controllers/`: Handles inbound HTTP/WS requests and outgoing responses.
- `src/services/`: Core business logic (kept separate from Express transports).
- `src/repositories/`: Storage layer handling MongoDB/Redis interactions.
- `src/middlewares/error-handler.ts`: Common error boundary logic.
- `src/utils/not-found.ts`: Standard 404 handler.

**The microservices include:**
1. **`telephony-gateway/`**: The entry point for live calls. It hosts a WebSocket server that bridges audio streams between the Asterisk telephony layer and the AI endpoints (ingesting STT, outputting TTS).
2. **`bot-engine/`**: The central brain/orchestrator. Based on detected intents, it manages the conversation state, routes commands contextually to either the `ai-service`, `doctor-service`, or `appointment-service`, and determines what happens next.
3. **`ai-service/`**: Encapsulates external LLMs natively. It detects the caller’s intent (e.g. `book_appointment`, `clinic_info`) from the STT transcripts and structures the logic. 
4. **`doctor-service/`**: Exposes internal APIs to fetch clinic-specific settings, working hours, exact fees, custom greetings, and human transfer numbers.
5. **`appointment-service/`**: Dedicated solely to CRUD operations for patient appointments (checking time slots, booking, cancelling).

### C. Internal Shared Packages (`/packages/`)

Code shared by the microservices lives here to ensure DRY principles.
1. **`shared-config/`**: Contains generalized `.env` loader helpers and schema validation.
2. **`shared-db/`**: Centralized MongoDB integration using Mongoose, keeping models syncable.
3. **`shared-redis/`**: Redis client (ioredis) configuration, crucial for maintaining fast, short-lived session states for active live-calls without relying solely on the DB.
4. **`shared-utils/`**: Utilities widely used across services, including standardized JSON logging (`logger.ts`) and HTTP wrapper helpers (`http.ts`).

### D. Frontend Interfaces (`/apps/`)

1. **`admin-web/`**: The web dashboard for clinic admins and receptionists.
   - Built on **React, Vite, and Tailwind CSS**.
   - Contains components to set up clinic info, greeting texts, toggle appointment systems, manage transfer numbers, over-ride emergency settings, and review prior call logs and AI-transcribed conversations.
   - **Key files:** `index.css` (Tailwind inputs), `vite.config.ts`, `App.tsx` (Root React DOM).

### E. Infrastructure (`/infra/`)

1. **`scripts/`**: Houses utility deployment and development scripts (e.g. scripts that boot up all pnpm workspaces simultaneously, handle automated database seeding, or deploy docker images).

---

## 3. Recommended Workflow for ChatGPT / Codex Prompts

When pasting snippets of this codebase into your AI assistant, focus your questions based on these architectural goals:

1. **Microservice Flow Optimization:** "How should the `bot-engine` effectively orchestrate payload transfers between the `ai-service` and `appointment-service` via REST to ensure minimal latency during a live SIP call?"
2. **WebSocket & Audio Chunking:** "Given the `telephony-gateway`, write a controller methodology that elegantly buffers continuous binary audio chunks (PCM/G.711) for LLM ingestion over WebSockets."
3. **State Management Logic:** "How do I best structure data in `shared-redis` to keep track of a phone caller's conversation context (e.g., locking a booking slot temporarily) securely?"
4. **LLM Prompt Engineering:** "Create a strict system prompt tailored for `ai-service` that coerces the LLM solely to extract ISO 8601 timestamps and mapped intents."

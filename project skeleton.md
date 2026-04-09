You are a senior backend architect and code generator.

I already have:

* PROJECT_OVERVIEW.md
* project_goal.md

Now your job is to **generate the actual project structure and starter code**.

## 🎯 Goal

Create a **production-ready monorepo structure** for an AI Telephony platform (hospital receptionist system).

This is a **fresh project** — nothing exists yet.

---

## ⚠️ Rules (VERY IMPORTANT)

* Do NOT overengineer
* Do NOT add unnecessary services
* Build only **MVP-ready structure**
* Use **clean, scalable patterns**
* Code must be **runnable**
* Use **environment-based config**
* Use **TypeScript everywhere (Node + React)**

---

## 🧱 Tech Stack (STRICT)

* Node.js + Express (TypeScript)
* React + Vite + Tailwind
* MongoDB (Mongoose)
* Redis (ioredis)
* pnpm workspace (monorepo)
* dotenv for config

---

## 📁 Required Folder Structure

Create this EXACT structure:

ai-hospital-telephony/
├── apps/
│   └── admin-web/
├── services/
│   ├── telephony-gateway/
│   ├── bot-engine/
│   ├── ai-service/
│   ├── doctor-service/
│   └── appointment-service/
├── packages/
│   ├── shared-config/
│   ├── shared-utils/
│   ├── shared-db/
│   └── shared-redis/
├── infra/
│   └── scripts/
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── README.md

---

## 🧩 What to Generate

### 1. Root Setup

* pnpm workspace config
* root package.json
* basic README

---

### 2. Shared Packages

#### shared-config

* env loader (dotenv + validation)

#### shared-db

* MongoDB connection (mongoose)

#### shared-redis

* Redis client setup (ioredis)

#### shared-utils

* logger
* response helpers

---

### 3. Services (IMPORTANT)

For EACH service:

* use Express + TypeScript
* folder structure:

src/
├── config/
├── routes/
├── controllers/
├── services/
├── repositories/
├── middlewares/
├── utils/
└── server.ts

---

### 4. Minimum Working Services

#### doctor-service

* GET /doctor
* GET /clinic-settings

#### appointment-service

* POST /appointments
* GET /appointments

#### ai-service

* POST /detect-intent (mock logic for now)

#### bot-engine

* POST /process-call
* orchestrates:

  * ai-service
  * doctor-service
  * appointment-service

#### telephony-gateway

* basic WebSocket server
* logs incoming audio events (mock for now)

---

### 5. Admin Web (React)

Create:

* Vite + React + Tailwind setup
* simple dashboard page:

  * clinic name
  * doctor name
  * greeting
* API integration placeholder

---

### 6. Environment Config

Create `.env.example` with:

* PORTS for each service
* MONGO_URI
* REDIS_URL
* API URLs

---

### 7. Scripts

Create scripts:

* dev: run all services
* build
* start

---

### 8. Code Quality

* Use TypeScript strict mode
* Add basic error handling
* Use async/await
* No fake business logic — use placeholders clearly

---

## 📦 Output Format

You MUST provide:

1. Folder tree (final structure)
2. All important files with code
3. Commands to run project:

   * install
   * dev
   * run services
4. What is working after setup

---

## 🔥 Final Requirement

At the end, ensure:

* All services can start
* Health route works (/health)
* No runtime errors
* Project runs locally

---

Start now. Generate step-by-step.

Do NOT skip code.
Do NOT summarize.

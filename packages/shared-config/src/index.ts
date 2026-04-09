import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export type ServiceEnv = {
  nodeEnv: string;
  port: number;
  mongoUri: string;
  redisUrl: string;
  doctorServiceUrl: string;
  appointmentServiceUrl: string;
  aiServiceUrl: string;
  botEngineUrl: string;
  telephonyGatewayUrl: string;
};

type ServiceEnvOptions = {
  portKey: string;
  defaultPort: number;
};

const FALLBACKS = {
  NODE_ENV: "development",
  MONGO_URI: "mongodb://127.0.0.1:27017/ai_hospital_telephony",
  REDIS_URL: "redis://127.0.0.1:6379",
  DOCTOR_SERVICE_URL: "http://localhost:4001",
  APPOINTMENT_SERVICE_URL: "http://localhost:4002",
  AI_SERVICE_URL: "http://localhost:4003",
  BOT_ENGINE_URL: "http://localhost:4004",
  TELEPHONY_GATEWAY_URL: "http://localhost:4005"
} as const;

function loadEnvFiles(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../../../.env")
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: false });
    }
  }
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number.`);
  }

  return parsed;
}

function readString(name: keyof typeof FALLBACKS): string {
  return process.env[name] ?? FALLBACKS[name];
}

export function createServiceEnv(options: ServiceEnvOptions): ServiceEnv {
  loadEnvFiles();

  return {
    nodeEnv: process.env.NODE_ENV ?? FALLBACKS.NODE_ENV,
    port: readNumber(options.portKey, options.defaultPort),
    mongoUri: process.env.MONGO_URI ?? FALLBACKS.MONGO_URI,
    redisUrl: process.env.REDIS_URL ?? FALLBACKS.REDIS_URL,
    doctorServiceUrl: readString("DOCTOR_SERVICE_URL"),
    appointmentServiceUrl: readString("APPOINTMENT_SERVICE_URL"),
    aiServiceUrl: readString("AI_SERVICE_URL"),
    botEngineUrl: readString("BOT_ENGINE_URL"),
    telephonyGatewayUrl: readString("TELEPHONY_GATEWAY_URL")
  };
}


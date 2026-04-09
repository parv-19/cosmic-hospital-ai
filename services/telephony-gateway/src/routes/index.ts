import { Router } from "express";

import { sendSuccess } from "@ai-hospital/shared-utils";

import { TelephonyController } from "../controllers/telephony-controller";

export function createRoutes(controller: TelephonyController): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    sendSuccess(res, { service: "telephony-gateway", status: "ok" });
  });

  router.post("/events/mock-audio", controller.logMockAudio);

  return router;
}


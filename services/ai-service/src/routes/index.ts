import { Router } from "express";

import { sendSuccess } from "@ai-hospital/shared-utils";

import { IntentController } from "../controllers/intent-controller";

export function createRoutes(controller: IntentController): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    sendSuccess(res, { service: "ai-service", status: "ok" });
  });

  router.post("/detect-intent", controller.detectIntent);

  return router;
}


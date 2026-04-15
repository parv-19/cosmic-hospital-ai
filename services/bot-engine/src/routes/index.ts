import { Router } from "express";

import { sendSuccess } from "@ai-hospital/shared-utils";

import { BotController } from "../controllers/bot-controller";

export function createRoutes(controller: BotController): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    sendSuccess(res, { service: "bot-engine", status: "ok" });
  });

  router.post("/process-call", controller.processCall);
  router.post("/usage-ledger", controller.recordUsage);
  router.post("/end-session", controller.endSession);
  router.get("/demo/sessions", controller.listSessions);
  router.get("/demo/sessions/:sessionId", controller.getSession);

  return router;
}

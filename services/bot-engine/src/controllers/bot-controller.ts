import type { Request, Response } from "express";

import { sendError, sendSuccess } from "@ai-hospital/shared-utils";

import { env } from "../config/env";
import { BotService } from "../services/bot-service";

function getRouteParam(value: string | string[] | undefined, fallback = ""): string {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

export class BotController {
  constructor(private readonly botService: BotService) {}

  processCall = async (req: Request, res: Response): Promise<void> => {
    const { transcript, sessionId, callerNumber } = req.body as Record<string, string | undefined>;

    if (!transcript) {
      sendError(res, "transcript is required.", 400);
      return;
    }

    const result = await this.botService.processCall({
      transcript,
      sessionId: sessionId ?? "demo-session",
      callerNumber,
      aiServiceUrl: env.aiServiceUrl,
      doctorServiceUrl: env.doctorServiceUrl,
      appointmentServiceUrl: env.appointmentServiceUrl
    });

    sendSuccess(res, result);
  };

  listSessions = async (_req: Request, res: Response): Promise<void> => {
    sendSuccess(res, this.botService.listSessions());
  };

  getSession = async (req: Request, res: Response): Promise<void> => {
    const session = this.botService.getSession(getRouteParam(req.params.sessionId));

    if (!session) {
      sendError(res, "Session not found.", 404);
      return;
    }

    sendSuccess(res, session);
  };
}

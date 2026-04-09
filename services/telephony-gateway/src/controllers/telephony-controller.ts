import type { Request, Response } from "express";

import { sendError, sendSuccess } from "@ai-hospital/shared-utils";

import { TelephonyService } from "../services/telephony-service";

export class TelephonyController {
  constructor(private readonly telephonyService: TelephonyService) {}

  logMockAudio = async (req: Request, res: Response): Promise<void> => {
    const { callId, payload } = req.body as Record<string, string | undefined>;

    if (!callId || !payload) {
      sendError(res, "callId and payload are required.", 400);
      return;
    }

    await this.telephonyService.logMockAudio(callId, payload);
    sendSuccess(res, { callId, received: true });
  };
}


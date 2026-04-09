import type { Request, Response } from "express";

import { sendError, sendSuccess } from "@ai-hospital/shared-utils";

import { IntentService } from "../services/intent-service";

export class IntentController {
  constructor(private readonly intentService: IntentService) {}

  detectIntent = async (req: Request, res: Response): Promise<void> => {
    const { transcript } = req.body as Record<string, string | undefined>;

    if (!transcript) {
      sendError(res, "transcript is required.", 400);
      return;
    }

    const result = await this.intentService.detectIntent(transcript);
    sendSuccess(res, result);
  };
}


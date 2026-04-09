import type { NextFunction, Request, Response } from "express";

import { logger, sendError } from "@ai-hospital/shared-utils";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  logger.error("doctor-service request failed", error);
  sendError(res, "Internal server error");
}


import type { Request, Response } from "express";

import { sendError } from "@ai-hospital/shared-utils";

export function notFoundHandler(_req: Request, res: Response): void {
  sendError(res, "Route not found", 404);
}


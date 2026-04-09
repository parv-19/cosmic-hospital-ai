import type { NextFunction, Request, Response } from "express";

import { sendError, verifyToken } from "@ai-hospital/shared-utils";

const JWT_SECRET = process.env.JWT_SECRET ?? "ai-hospital-dev-secret";

type AuthPayload = {
  userId: string;
  role: "ADMIN" | "DOCTOR" | "READ_ONLY";
  doctorId?: string | null;
  email: string;
};

export type AuthenticatedRequest = Request & {
  auth?: AuthPayload;
};

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    sendError(res, "Authentication required.", 401);
    return;
  }

  const token = authorization.replace("Bearer ", "").trim();
  const payload = verifyToken<AuthPayload>(token, JWT_SECRET);

  if (!payload) {
    sendError(res, "Invalid or expired token.", 401);
    return;
  }

  req.auth = payload;
  next();
}

export function requireRole(...roles: Array<AuthPayload["role"]>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      sendError(res, "Authentication required.", 401);
      return;
    }

    if (!roles.includes(req.auth.role)) {
      sendError(res, "You do not have permission to access this resource.", 403);
      return;
    }

    next();
  };
}

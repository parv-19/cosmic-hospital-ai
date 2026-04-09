import { Router } from "express";

import { sendSuccess } from "@ai-hospital/shared-utils";

import { AppointmentController } from "../controllers/appointment-controller";

export function createRoutes(controller: AppointmentController): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    sendSuccess(res, { service: "appointment-service", status: "ok" });
  });

  router.get("/appointments", controller.listAppointments);
  router.post("/appointments", controller.createAppointment);
  router.post("/book", controller.createAppointment);
  router.post("/cancel", controller.cancelAppointment);
  router.post("/reschedule", controller.rescheduleAppointment);

  return router;
}

import { Router } from "express";

import { sendSuccess } from "@ai-hospital/shared-utils";

import { DoctorController } from "../controllers/doctor-controller";
import { requireAuth, requireRole } from "../middlewares/auth";

export function createRoutes(controller: DoctorController): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    sendSuccess(res, { service: "doctor-service", status: "ok" });
  });

  router.post("/login", controller.login);
  router.get("/doctor", controller.getDoctor);
  router.get("/clinic-settings", controller.getClinicSettings);
  router.get("/runtime-config", controller.getRuntimeConfig);

  router.get("/me", requireAuth, controller.me);
  router.get("/dashboard", requireAuth, controller.getDashboard);
  router.get("/analytics", requireAuth, controller.getAnalytics);

  router.get("/doctors", requireAuth, controller.listDoctors);
  router.post("/doctors", requireAuth, requireRole("ADMIN"), controller.createDoctor);
  router.put("/doctors/:id", requireAuth, requireRole("ADMIN", "DOCTOR"), controller.updateDoctor);

  router.get("/appointments", requireAuth, controller.listAppointments);
  router.post("/book", requireAuth, controller.bookAppointment);
  router.post("/cancel", requireAuth, controller.cancelAppointment);
  router.post("/reschedule", requireAuth, controller.rescheduleAppointment);

  router.get("/calls", requireAuth, controller.listCalls);
  router.get("/calls/live", requireAuth, controller.getLiveCalls);
  router.get("/calls/:id", requireAuth, controller.getCall);
  router.get("/calls/:id/transcript", requireAuth, controller.getTranscript);

  router.get("/settings", requireAuth, controller.getSettings);
  router.put("/settings", requireAuth, requireRole("ADMIN", "DOCTOR"), controller.updateSettings);
  router.post("/provider-health", requireAuth, requireRole("ADMIN", "DOCTOR"), controller.checkProviderHealth);

  router.get("/faq", requireAuth, controller.listFaq);
  router.put("/faq", requireAuth, requireRole("ADMIN", "DOCTOR"), controller.upsertFaq);

  router.get("/bot-flows", requireAuth, controller.listFlows);
  router.put("/bot-flows", requireAuth, requireRole("ADMIN", "DOCTOR"), controller.upsertFlow);

  router.post("/users", requireAuth, requireRole("ADMIN"), controller.createUser);

  return router;
}

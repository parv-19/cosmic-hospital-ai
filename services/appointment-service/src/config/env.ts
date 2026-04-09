import { createServiceEnv } from "@ai-hospital/shared-config";

export const env = createServiceEnv({
  portKey: "APPOINTMENT_SERVICE_PORT",
  defaultPort: 4002
});


import { createServiceEnv } from "@ai-hospital/shared-config";

export const env = createServiceEnv({
  portKey: "DOCTOR_SERVICE_PORT",
  defaultPort: 4001
});


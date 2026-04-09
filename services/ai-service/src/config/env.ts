import { createServiceEnv } from "@ai-hospital/shared-config";

export const env = createServiceEnv({
  portKey: "AI_SERVICE_PORT",
  defaultPort: 4003
});


import { createServiceEnv } from "@ai-hospital/shared-config";

export const env = createServiceEnv({
  portKey: "BOT_ENGINE_PORT",
  defaultPort: 4004
});


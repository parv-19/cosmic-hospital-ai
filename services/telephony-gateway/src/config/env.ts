import { createServiceEnv } from "@ai-hospital/shared-config";

export const env = createServiceEnv({
  portKey: "TELEPHONY_GATEWAY_PORT",
  defaultPort: 4005
});


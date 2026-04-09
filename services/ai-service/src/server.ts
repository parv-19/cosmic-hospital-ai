import cors from "cors";
import express from "express";

import { connectMongo } from "@ai-hospital/shared-db";
import { connectRedis, createRedisClient } from "@ai-hospital/shared-redis";
import { logger } from "@ai-hospital/shared-utils";

import { env } from "./config/env";
import { IntentController } from "./controllers/intent-controller";
import { errorHandler } from "./middlewares/error-handler";
import { IntentRepository } from "./repositories/intent-repository";
import { createRoutes } from "./routes";
import { IntentService } from "./services/intent-service";
import { notFoundHandler } from "./utils/not-found";

async function bootstrap(): Promise<void> {
  await connectMongo(env.mongoUri);
  const redis = createRedisClient(env.redisUrl);
  await connectRedis(redis);

  const repository = new IntentRepository();
  const service = new IntentService(repository);
  const controller = new IntentController(service);

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(createRoutes(controller));
  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(env.port, () => {
    logger.info(`ai-service listening on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  logger.error("ai-service failed to start", error);
  process.exit(1);
});

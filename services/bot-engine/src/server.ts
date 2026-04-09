import cors from "cors";
import express from "express";

import { connectMongo } from "@ai-hospital/shared-db";
import { connectRedis, createRedisClient } from "@ai-hospital/shared-redis";
import { logger } from "@ai-hospital/shared-utils";

import { env } from "./config/env";
import { BotController } from "./controllers/bot-controller";
import { errorHandler } from "./middlewares/error-handler";
import { CallRepository } from "./repositories/call-repository";
import { createRoutes } from "./routes";
import { BotService } from "./services/bot-service";
import { notFoundHandler } from "./utils/not-found";

async function bootstrap(): Promise<void> {
  await connectMongo(env.mongoUri);
  const redis = createRedisClient(env.redisUrl);
  await connectRedis(redis);

  const repository = new CallRepository();
  const service = new BotService(repository);
  const controller = new BotController(service);

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(createRoutes(controller));
  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(env.port, () => {
    logger.info(`bot-engine listening on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  logger.error("bot-engine failed to start", error);
  process.exit(1);
});


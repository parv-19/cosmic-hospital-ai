import cors from "cors";
import express from "express";

import { connectMongo } from "@ai-hospital/shared-db";
import { connectRedis, createRedisClient } from "@ai-hospital/shared-redis";
import { logger } from "@ai-hospital/shared-utils";

import { env } from "./config/env";
import { AppointmentController } from "./controllers/appointment-controller";
import { errorHandler } from "./middlewares/error-handler";
import { AppointmentRepository } from "./repositories/appointment-repository";
import { createRoutes } from "./routes";
import { AppointmentService } from "./services/appointment-service";
import { notFoundHandler } from "./utils/not-found";

async function bootstrap(): Promise<void> {
  await connectMongo(env.mongoUri);
  const redis = createRedisClient(env.redisUrl);
  await connectRedis(redis);

  const repository = new AppointmentRepository();
  const service = new AppointmentService(repository);
  const controller = new AppointmentController(service);

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(createRoutes(controller));
  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(env.port, () => {
    logger.info(`appointment-service listening on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  logger.error("appointment-service failed to start", error);
  process.exit(1);
});


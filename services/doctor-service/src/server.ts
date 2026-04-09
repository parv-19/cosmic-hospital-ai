import cors from "cors";
import express from "express";

import { connectMongo, ensurePlatformSeedData } from "@ai-hospital/shared-db";
import { connectRedis, createRedisClient } from "@ai-hospital/shared-redis";
import { logger } from "@ai-hospital/shared-utils";

import { env } from "./config/env";
import { DoctorController } from "./controllers/doctor-controller";
import { errorHandler } from "./middlewares/error-handler";
import { createRoutes } from "./routes";
import { DoctorService } from "./services/doctor-service";
import { notFoundHandler } from "./utils/not-found";

async function bootstrap(): Promise<void> {
  await connectMongo(env.mongoUri);
  await ensurePlatformSeedData();

  const redis = createRedisClient(env.redisUrl);
  await connectRedis(redis);

  const service = new DoctorService();
  const controller = new DoctorController(service);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(createRoutes(controller));
  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(env.port, () => {
    logger.info(`doctor-service listening on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  logger.error("doctor-service failed to start", error);
  process.exit(1);
});

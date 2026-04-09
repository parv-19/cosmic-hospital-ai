import { createServer } from "node:http";

import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";

import { connectMongo } from "@ai-hospital/shared-db";
import { connectRedis, createRedisClient } from "@ai-hospital/shared-redis";
import { logger } from "@ai-hospital/shared-utils";

import { env } from "./config/env";
import { TelephonyController } from "./controllers/telephony-controller";
import { errorHandler } from "./middlewares/error-handler";
import { AudioEventRepository } from "./repositories/audio-event-repository";
import { createRoutes } from "./routes";
import { TelephonyService } from "./services/telephony-service";
import { notFoundHandler } from "./utils/not-found";

async function bootstrap(): Promise<void> {
  await connectMongo(env.mongoUri);
  const redis = createRedisClient(env.redisUrl);
  await connectRedis(redis);

  const repository = new AudioEventRepository();
  const service = new TelephonyService(repository);
  const controller = new TelephonyController(service);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(createRoutes(controller));
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = createServer(app);
  const webSocketServer = new WebSocketServer({ server, path: "/stream" });

  webSocketServer.on("connection", (socket, request) => {
    service.registerSocket(socket, request);
  });

  server.listen(env.port, () => {
    logger.info(`telephony-gateway listening on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  logger.error("telephony-gateway failed to start", error);
  process.exit(1);
});


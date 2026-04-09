import type { IncomingMessage } from "node:http";

import type { WebSocket } from "ws";

import { logger } from "@ai-hospital/shared-utils";

import { AudioEventRepository } from "../repositories/audio-event-repository";

export class TelephonyService {
  constructor(private readonly repository: AudioEventRepository) {}

  async logMockAudio(callId: string, payload: string): Promise<void> {
    await this.repository.add({
      callId,
      chunkSize: payload.length,
      receivedAt: new Date().toISOString()
    });

    logger.info("Mock audio event logged", { callId, chunkSize: payload.length });
  }

  registerSocket(socket: WebSocket, request: IncomingMessage): void {
    logger.info("WebSocket client connected", { path: request.url });

    socket.on("message", async (message) => {
      const payload = message.toString();
      await this.logMockAudio(`ws-${Date.now()}`, payload);
    });

    socket.on("close", () => {
      logger.info("WebSocket client disconnected");
    });
  }
}


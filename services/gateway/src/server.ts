import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { liveRoutes } from "./routes/live.js";
import { analyzeRoutes } from "./routes/analyze.js";

const server = Fastify({
  logger: {
    level: config.LOG_LEVEL,
  },
});

await server.register(cors, {
  origin: config.CORS_ORIGIN === "*" ? true : [config.CORS_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true,
});

await server.register(multipart, {
  limits: {
    fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
  },
});

await server.register(websocket, {
  options: {
    maxPayload: 1024 * 1024,
  },
});

await server.register(liveRoutes);
await server.register(analyzeRoutes);

const start = async () => {
  try {
    const address = await server.listen({ port: config.PORT, host: "0.0.0.0" });
    server.log.info(`Gateway listening on ${address}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

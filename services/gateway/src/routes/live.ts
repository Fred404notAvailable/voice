import { FastifyInstance } from "fastify";
import { WebSocket as WsClient } from "ws";
import crypto from "crypto";
import { config } from "../config.js";
import { WindowResult, ServerMessage } from "../protocol.js";

// In-memory bounded session timelines for export
const sessionTimelines = new Map<string, WindowResult[]>();

export function getSessionTimeline(sessionId: string): WindowResult[] | undefined {
  return sessionTimelines.get(sessionId);
}

export async function liveRoutes(fastify: FastifyInstance) {
  fastify.get("/ws/live", { websocket: true }, (socket, req) => {
    const sessionId = crypto.randomUUID();
    sessionTimelines.set(sessionId, []);
    fastify.log.info({ sessionId }, "Client connected to /ws/live");

    let upstream: WsClient | null = null;
    let isAlive = true;
    let droppedFrames = 0;

    // Connect to upstream ML service
    try {
      upstream = new WsClient(config.ML_WS_URL);
    } catch (err: any) {
      fastify.log.error({ err, sessionId }, "Failed to initiate upstream ML connection");
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "error", code: "ML_UNAVAILABLE", message: "Cannot connect to ML service" }));
        socket.close(1011, "ML unavailable");
      }
      return;
    }

    const pendingQueue: Array<{ data: any; isBinary: boolean }> = [];

    // Upstream ML handlers
    upstream.on("open", () => {
      fastify.log.info({ sessionId }, "Connected to ML upstream");
      // Inform ML of session start
      upstream?.send(JSON.stringify({
        type: "start",
        session_id: sessionId,
        sample_rate: 16000,
        mode: "live"
      }));

      // Flush any queued frames
      while (pendingQueue.length > 0) {
        const item = pendingQueue.shift()!;
        if (item.isBinary) {
          upstream?.send(item.data, { binary: true });
        } else {
          upstream?.send(item.data.toString());
        }
      }
    });

    upstream.on("message", (data: any, isBinary: boolean) => {
      if (isBinary) {
        // Forward binary if any
        if (socket.readyState === socket.OPEN) {
          socket.send(data, { binary: true });
        }
      } else {
        const text = data.toString();
        try {
          const parsed = JSON.parse(text) as ServerMessage;
          if (parsed.type === "window_result") {
            const now = performance.now();
            if (parsed.timings_ms) {
              parsed.timings_ms.gateway = Math.round((performance.now() - now) * 10) / 10;
            }
            // Store in bounded timeline
            const timeline = sessionTimelines.get(sessionId);
            if (timeline) {
              timeline.push(parsed);
              if (timeline.length > 600) timeline.shift();
            }
          }
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(parsed));
          }
        } catch {
          if (socket.readyState === socket.OPEN) {
            socket.send(text);
          }
        }
      }
    });

    upstream.on("error", (err: any) => {
      fastify.log.warn({ err: err.message, sessionId }, "Upstream ML error");
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "error", code: "ML_UNAVAILABLE", message: "ML upstream error" }));
        socket.close(1011, "ML upstream error");
      }
    });

    upstream.on("close", () => {
      fastify.log.info({ sessionId }, "Upstream ML closed");
      if (socket.readyState === socket.OPEN) {
        socket.close(1000, "ML session closed");
      }
    });

    // Client handlers
    socket.on("message", (data: any, isBinary: boolean) => {
      if (!upstream || upstream.readyState === upstream.CLOSED || upstream.readyState === upstream.CLOSING) {
        return;
      }

      if (upstream.readyState === upstream.CONNECTING) {
        if (pendingQueue.length < 50) {
          pendingQueue.push({ data, isBinary });
        }
        return;
      }

      if (isBinary) {
        // Backpressure check: if bufferedAmount > 64KB, drop frame
        if (upstream.bufferedAmount > 64 * 1024) {
          droppedFrames++;
          if (droppedFrames % 10 === 1) {
            fastify.log.warn({ droppedFrames, sessionId }, "Backpressure: dropping frames to ML");
          }
          return;
        }
        upstream.send(data, { binary: true });
      } else {
        const text = data.toString();
        try {
          const parsed = JSON.parse(text);
          if (parsed.type === "start" || parsed.type === "stop" || parsed.type === "reset") {
            upstream.send(text);
          }
        } catch {
          // ignore malformed client control message
        }
      }
    });

    // Heartbeat
    socket.on("pong", () => {
      isAlive = true;
    });

    const pingInterval = setInterval(() => {
      if (!isAlive) {
        fastify.log.info({ sessionId }, "Terminating dead client socket");
        socket.terminate();
        return;
      }
      isAlive = false;
      socket.ping();
      if (upstream && upstream.readyState === upstream.OPEN) {
        upstream.ping();
      }
    }, 10000);

    const cleanup = () => {
      clearInterval(pingInterval);
      if (upstream && (upstream.readyState === upstream.OPEN || upstream.readyState === upstream.CONNECTING)) {
        upstream.close();
      }
    };

    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });

  // Export session timeline JSON
  fastify.get<{ Params: { id: string } }>("/api/session/:id/export", async (req, reply) => {
    const { id } = req.params;
    const timeline = sessionTimelines.get(id);
    if (!timeline) {
      reply.status(404).send({ error: "Session not found", session_id: id });
      return;
    }
    return {
      session_id: id,
      total_windows: timeline.length,
      exported_at: new Date().toISOString(),
      timeline,
    };
  });
}

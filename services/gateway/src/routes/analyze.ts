import { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { getSessionTimeline } from "./live.js";

const ALLOWED_EXTENSIONS = [".wav", ".mp3", ".flac", ".ogg", ".m4a"];

export async function analyzeRoutes(fastify: FastifyInstance) {
  // Session timeline export
  fastify.get("/api/session/:id/export", async (req, reply) => {
    const { id } = req.params as { id: string };
    const timeline = getSessionTimeline(id);
    if (!timeline) {
      return reply.status(404).send({ error: "Session not found or expired" });
    }
    return reply.send({
      session_id: id,
      total_windows: timeline.length,
      windows: timeline,
    });
  });

  // Health endpoint aggregating ML
  fastify.get("/api/health", async (_req, reply) => {
    let mlHealth: any = null;
    try {
      const res = await fetch(`${config.ML_HTTP_URL}/health`);
      if (res.ok) {
        mlHealth = await res.json();
      } else {
        mlHealth = { status: "unhealthy", http_code: res.status };
      }
    } catch (err: any) {
      mlHealth = { status: "down", error: err.message };
    }

    const isHealthy = mlHealth && mlHealth.status === "ok";
    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? "ok" : "degraded",
      gateway: "ok",
      ml: mlHealth,
    });
  });

  // File analysis endpoint
  fastify.post("/api/analyze", async (req, reply) => {
    const data = await req.file({
      limits: {
        fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
      },
    });

    if (!data) {
      return reply.status(400).send({ error: "No file provided" });
    }

    const filename = data.filename.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => filename.endsWith(ext));
    if (!hasValidExt) {
      return reply.status(415).send({
        error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
      });
    }

    try {
      const buffer = await data.toBuffer();
      if (data.file.truncated) {
        return reply.status(413).send({
          error: `File size exceeds ${config.MAX_UPLOAD_MB} MB limit`,
        });
      }

      const formData = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: data.mimetype });
      formData.append("file", blob, data.filename);

      const mlRes = await fetch(`${config.ML_HTTP_URL}/analyze_file`, {
        method: "POST",
        body: formData,
      });

      if (!mlRes.ok) {
        const errText = await mlRes.text();
        return reply.status(mlRes.status).send({ error: errText });
      }

      const result = await mlRes.json();
      return reply.send(result);
    } catch (err: any) {
      fastify.log.error({ err }, "Error analyzing file with ML service");
      return reply.status(500).send({ error: "Failed to analyze file", details: err.message });
    }
  });
}

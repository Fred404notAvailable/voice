import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  ML_WS_URL: z.string().default("ws://localhost:8000/ws/session"),
  ML_HTTP_URL: z.string().default("http://localhost:8000"),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.string().default("info"),
});

export const config = envSchema.parse(process.env);

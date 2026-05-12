import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { trackInflight } from "./lib/inflight";

const app: Express = express();

app.disable("x-powered-by");

// Trust proxy hops, driven by env. Without this, behind nginx /
// Cloudflare / Vercel etc., req.ip becomes the proxy's IP and the
// per-IP rate limiter collapses every client into one bucket. Also
// breaks `secure: true` cookies when TLS terminates upstream.
//
// Set TRUST_PROXY_HOPS to the number of trusted reverse proxies in
// front of the api-server (typically 1). Leave unset (0) for direct
// connections (local dev).
const trustHops = Number(process.env["TRUST_PROXY_HOPS"] ?? "0");
if (Number.isFinite(trustHops) && trustHops > 0) {
  app.set("trust proxy", trustHops);
}

app.use(helmet());

const corsOriginEnv = process.env["CORS_ORIGIN"]?.trim();
const corsOptions: CorsOptions = corsOriginEnv
  ? {
      origin: corsOriginEnv.split(",").map((s) => s.trim()).filter(Boolean),
      credentials: true,
    }
  : process.env["NODE_ENV"] === "production"
    ? { origin: false }
    : { credentials: true };
app.use(cors(corsOptions));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// Track in-flight requests so SIGTERM can wait for them to drain.
app.use(trackInflight);

app.use("/api", router);

export default app;

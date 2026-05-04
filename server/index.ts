import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pulseRouter from "./routes/pulse.js";
import sessionsRouter from "./routes/sessions.js";
import { apiKeyAuth, rateLimit, requestId, securityHeaders } from "./middleware/security.js";

const app = express();
const PORT = Number(process.env.PORT ?? 5000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(requestId);
app.use(securityHeaders);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "1mb" }));
app.use(rateLimit);

app.use((req, _res, next) => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), method: req.method, path: req.path, requestId: (req as any).requestId }));
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), version: process.env.APP_VERSION ?? "1.2.0-commercial" });
});

app.use(apiKeyAuth);
app.use("/api/pulse", pulseRouter);
app.use("/api/sessions", sessionsRouter);

if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "public");
  app.use(express.static(clientDist, { maxAge: "1h", etag: true }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
}

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server] Unhandled error:", { requestId: (req as any).requestId, error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error", requestId: (req as any).requestId });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] NomadGo backend running on port ${PORT}`);
  });
}

export default app;

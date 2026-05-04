import { Request, Response, NextFunction } from "express";

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 120);
const buckets = new Map<string, { count: number; resetAt: number }>();

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  const id = incoming && incoming.length <= 80 ? incoming : cryptoRandomId();
  res.setHeader("x-request-id", id);
  (req as Request & { requestId?: string }).requestId = id;
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  next();
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();
  if (process.env.NODE_ENV === "test") return next();

  const expected = process.env.API_KEY;
  if (!expected || expected.length < 16) {
    res.status(500).json({ error: "Server API key is not configured securely" });
    return;
  }

  const supplied = req.header("x-api-key");
  if (supplied !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "test") return next();

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const key = `${ip}:${req.path}`;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  current.count += 1;
  if (current.count > MAX_REQUESTS) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  next();
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

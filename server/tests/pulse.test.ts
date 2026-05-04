import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

// ── Mock the DB so tests run without Postgres ─────────────────────────────────

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
  schema: {
    sessions: { sessionId: "session_id", deviceId: "device_id", totalItemsCounted: "total_items_counted", isActive: "is_active" },
    pulses:   { sessionId: "session_id", timestamp: "timestamp" },
  },
}));

import app from "../index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePulse(overrides = {}) {
  return {
    pulseId:   "pulse-001",
    sessionId: "sess-abc123",
    deviceId:  "device-xyz",
    timestamp: new Date().toISOString(),
    totalCount: 12,
    rowCount:   3,
    countsByLabel: [
      { label: "bottle", count: 8 },
      { label: "cup",    count: 4 },
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/pulse", () => {
  it("returns 201 with valid payload", async () => {
    const res = await request(app).post("/api/pulse").send(makePulse());
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it("returns 400 when pulseId is missing", async () => {
    const { pulseId: _, ...body } = makePulse();
    const res = await request(app).post("/api/pulse").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details[0].field).toBe("pulseId");
  });

  it("returns 400 when totalCount is negative", async () => {
    const res = await request(app)
      .post("/api/pulse")
      .send(makePulse({ totalCount: -1 }));
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe("totalCount");
  });

  it("returns 400 when sessionId is empty string", async () => {
    const res = await request(app)
      .post("/api/pulse")
      .send(makePulse({ sessionId: "" }));
    expect(res.status).toBe(400);
  });

  it("accepts pulse with empty countsByLabel", async () => {
    const res = await request(app)
      .post("/api/pulse")
      .send(makePulse({ countsByLabel: [] }));
    expect(res.status).toBe(201);
  });
});

describe("GET /health", () => {
  it("returns 200 with ok:true", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.ts).toBe("string");
  });
});

describe("404 handler", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/api/unknown-route");
    expect(res.status).toBe(404);
  });
});

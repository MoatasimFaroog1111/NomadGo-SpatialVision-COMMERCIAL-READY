import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// ── Mock the DB ───────────────────────────────────────────────────────────────
// NOTE: vi.mock is hoisted — all data must be defined INSIDE the factory,
// not as top-level variables (they would not yet be initialised when hoisted).

vi.mock("../db/index.js", () => {
  const session = {
    id: 1,
    sessionId: "sess-abc123",
    deviceId: "device-xyz",
    startTime: new Date().toISOString(),
    endTime: null,
    totalItemsCounted: 12,
    isActive: true,
    metadata: null,
  };

  const pulses = [
    { id: 1, pulseId: "p-001", sessionId: "sess-abc123", totalCount: 12, rowCount: 3 },
  ];

  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([session]),
          }),
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([session]),
            orderBy: vi.fn().mockResolvedValue(pulses),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              { ...session, isActive: false, endTime: new Date() },
            ]),
          }),
        }),
      }),
    },
    schema: {
      sessions: { sessionId: "session_id", startTime: "start_time" },
      pulses:   { sessionId: "session_id", timestamp: "timestamp" },
    },
  };
});

import app from "../index.js";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/sessions", () => {
  it("returns array of sessions", async () => {
    const res = await request(app).get("/api/sessions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });
});

describe("GET /api/sessions/:sessionId", () => {
  it("returns session with its pulses", async () => {
    const res = await request(app).get("/api/sessions/sess-abc123");
    expect(res.status).toBe(200);
    expect(res.body.session.sessionId).toBe("sess-abc123");
    expect(Array.isArray(res.body.pulses)).toBe(true);
  });
});

describe("PATCH /api/sessions/:sessionId/end", () => {
  it("marks session as ended", async () => {
    const res = await request(app).patch("/api/sessions/sess-abc123/end");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.session.isActive).toBe(false);
  });
});

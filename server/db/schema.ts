import { pgTable, text, integer, real, boolean, timestamp, jsonb, serial } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// ── Sessions ──────────────────────────────────────────────────────────────────

export const sessions = pgTable("sessions", {
  id:                serial("id").primaryKey(),
  sessionId:         text("session_id").notNull().unique(),
  deviceId:          text("device_id").notNull(),
  startTime:         timestamp("start_time").notNull().defaultNow(),
  endTime:           timestamp("end_time"),
  totalItemsCounted: integer("total_items_counted").notNull().default(0),
  isActive:          boolean("is_active").notNull().default(true),
  metadata:          jsonb("metadata"),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export const selectSessionSchema = createSelectSchema(sessions);
export type Session    = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// ── Pulses ────────────────────────────────────────────────────────────────────

export const pulses = pgTable("pulses", {
  id:          serial("id").primaryKey(),
  pulseId:     text("pulse_id").notNull().unique(),
  sessionId:   text("session_id").notNull(),
  deviceId:    text("device_id").notNull(),
  timestamp:   timestamp("timestamp").notNull().defaultNow(),
  totalCount:  integer("total_count").notNull().default(0),
  rowCount:    integer("row_count").notNull().default(0),
  countsByLabel: jsonb("counts_by_label").notNull().default([]),
  receivedAt:  timestamp("received_at").notNull().defaultNow(),
});

export const insertPulseSchema = createInsertSchema(pulses).omit({ id: true, receivedAt: true });
export const selectPulseSchema = createSelectSchema(pulses);
export type Pulse    = typeof pulses.$inferSelect;
export type NewPulse = typeof pulses.$inferInsert;

// ── Pulse payload (from Unity client) ─────────────────────────────────────────

export const pulsePayloadSchema = z.object({
  pulseId:   z.string().min(1).max(80),
  sessionId: z.string().min(1).max(120),
  deviceId:  z.string().min(1).max(120),
  timestamp: z.string().datetime(),
  totalCount: z.number().int().min(0).max(1_000_000),
  rowCount:   z.number().int().min(0).max(100_000),
  countsByLabel: z.array(
    z.object({ label: z.string().min(1).max(120), count: z.number().int().min(0).max(1_000_000) })
  ).max(500).default([]),
});

export type PulsePayload = z.infer<typeof pulsePayloadSchema>;

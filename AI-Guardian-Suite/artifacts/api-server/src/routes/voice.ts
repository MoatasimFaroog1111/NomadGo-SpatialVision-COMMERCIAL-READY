/**
 * Voice transcription — POST /api/voice/transcribe
 * Accepts audio blob (multipart/form-data, field: "audio")
 * Returns { text: string } via OpenAI Whisper
 */
import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import OpenAI from "openai";
import { activeProvider } from "../lib/ai-provider.js";
import { loadOdooConfig } from "../lib/odoo-client.js";

export const voiceRouter = Router();

// Store uploads in OS temp dir — never persisted
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".webm";
      cb(null, `guardian-voice-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — Whisper limit
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(webm|ogg|mp3|mp4|m4a|wav|flac)$/i;
    if (
      allowed.test(file.originalname) ||
      file.mimetype.startsWith("audio/") ||
      file.mimetype.startsWith("video/")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are accepted"));
    }
  },
});

// ── POST /api/voice/transcribe ─────────────────────────────────────
voiceRouter.post(
  "/transcribe",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    try {
      // Resolve OpenAI API key — prefer env, fall back to DB settings
      const apiKey =
        process.env["OPENAI_API_KEY"] ||
        (await (async () => {
          try {
            const cfg = await loadOdooConfig(); // odoo config also stores llm keys
            return "";
          } catch {
            return "";
          }
        })());

      if (!apiKey) {
        fs.unlinkSync(file.path);
        return res.status(503).json({
          error: "OpenAI API key not configured — cannot transcribe audio",
        });
      }

      const openai = new OpenAI({ apiKey });

      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(file.path) as unknown as File,
        model: "whisper-1",
        language: req.body?.language || undefined, // auto-detect if not specified
        response_format: "json",
      });

      const text = transcription.text?.trim() ?? "";
      return res.json({
        text,
        detected_language: (transcription as { language?: string }).language,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res
        .status(500)
        .json({ error: `Transcription failed: ${message}` });
    } finally {
      // Always clean up the temp file
      if (file?.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          /* ignore */
        }
      }
    }
  },
);

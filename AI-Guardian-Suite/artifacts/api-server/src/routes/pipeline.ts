import { Router } from "express";
import {
  RunExtractionParams,
  RunClassificationParams,
  RunValidationParams,
  RunPostingParams,
} from "@workspace/api-zod";
import {
  runExtractionAgent,
  runClassificationAgent,
  runValidationAgent,
  runPostingAgent,
  runCpaAnalysisAgent,
  runFullPipeline,
} from "../lib/pipeline-agents.js";

const router = Router();

// POST /api/pipeline/extract/:documentId
router.post("/extract/:documentId", async (req, res) => {
  try {
    const { documentId } = RunExtractionParams.parse({
      documentId: Number(req.params.documentId),
    });
    const result = await runExtractionAgent(documentId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "runExtraction error");
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/pipeline/classify/:documentId
router.post("/classify/:documentId", async (req, res) => {
  try {
    const { documentId } = RunClassificationParams.parse({
      documentId: Number(req.params.documentId),
    });
    const result = await runClassificationAgent(documentId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "runClassification error");
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/pipeline/validate/:documentId
router.post("/validate/:documentId", async (req, res) => {
  try {
    const { documentId } = RunValidationParams.parse({
      documentId: Number(req.params.documentId),
    });
    const result = await runValidationAgent(documentId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "runValidation error");
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/pipeline/post/:documentId
router.post("/post/:documentId", async (req, res) => {
  try {
    const { documentId } = RunPostingParams.parse({
      documentId: Number(req.params.documentId),
    });
    const result = await runPostingAgent(documentId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "runPosting error");
    return res.status(400).json({ error: String(err) });
  }
});

// POST /api/pipeline/cpa-analysis/:documentId
// Trigger the CPA analysis agent manually (also auto-runs in full pipeline)
router.post("/cpa-analysis/:documentId", async (req, res) => {
  try {
    const documentId = Number(req.params.documentId);
    if (!documentId || isNaN(documentId))
      return res.status(400).json({ error: "Invalid documentId" });
    const result = await runCpaAnalysisAgent(documentId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "runCpaAnalysis error");
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/pipeline/run/:documentId — full pipeline
router.post("/run/:documentId", async (req, res) => {
  try {
    const documentId = Number(req.params.documentId);
    if (!documentId || isNaN(documentId))
      return res.status(400).json({ error: "Invalid documentId" });
    const result = await runFullPipeline(documentId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "runFullPipeline error");
    return res.status(500).json({ error: String(err) });
  }
});

export default router;

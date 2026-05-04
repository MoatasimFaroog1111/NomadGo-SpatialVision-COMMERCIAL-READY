/**
 * File Upload Route
 * Accepts PDF/image documents, saves them to DB, runs the full pipeline.
 *
 * PDF  → text extracted via pdf-parse at upload time
 * Image → raw bytes stored as base64 for Claude Vision in extraction agent
 * JSON  → rawContent passed directly
 */
import { Router } from "express";
import { db, documentsTable } from "@workspace/db";
import { runFullPipeline } from "../lib/pipeline-agents.js";

const router = Router();

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

function detectFileType(
  filename: string,
  contentType: string,
): "pdf" | "image" | "email" | "whatsapp" | "csv" | "other" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || contentType.includes("pdf")) return "pdf";
  if (
    ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff"].includes(ext) ||
    contentType.startsWith("image/")
  )
    return "image";
  if (["msg", "eml"].includes(ext) || contentType.includes("message"))
    return "email";
  if (ext === "csv") return "csv";
  return "other";
}

/** Extract text from a PDF buffer. Returns empty string on failure. */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse =
      (
        (await import("pdf-parse")) as unknown as {
          default?: (b: Buffer) => Promise<{ text: string }>;
        }
      ).default ??
      ((await import("pdf-parse")) as unknown as (
        b: Buffer,
      ) => Promise<{ text: string }>);
    const result = await pdfParse(buffer);
    return (result.text ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Convert the first page of a PDF buffer to a JPEG image using pdftoppm.
 * Returns base64-encoded JPEG, or null if conversion fails.
 */
export async function convertPdfToJpeg(buffer: Buffer): Promise<string | null> {
  const { execFile } = await import("child_process");
  const { writeFile, readFile, rm, mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const { tmpdir } = await import("os");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  const tmpDir = join(
    tmpdir(),
    `pdf_conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  const pdfPath = join(tmpDir, "input.pdf");
  const outPrefix = join(tmpDir, "page");

  try {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(pdfPath, buffer);

    // Convert first page to JPEG at 150 DPI
    await execFileAsync(
      "pdftoppm",
      ["-jpeg", "-r", "150", "-l", "1", pdfPath, outPrefix],
      {
        timeout: 15_000,
      },
    );

    // pdftoppm names files page-1.jpg (with leading zero padding varies)
    const files = await (await import("fs/promises")).readdir(tmpDir);
    const jpegFile = files.find(
      (f) =>
        f.startsWith("page") && (f.endsWith(".jpg") || f.endsWith(".jpeg")),
    );
    if (!jpegFile) return null;

    const imageBuffer = await readFile(join(tmpDir, jpegFile));
    return imageBuffer.toString("base64");
  } catch (err) {
    console.warn(
      "[Upload] pdftoppm PDF→JPEG conversion failed:",
      String(err).slice(0, 200),
    );
    return null;
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * POST /api/upload
 * Accepts multipart/form-data (PDF, image, text) or application/json.
 */
router.post("/", async (req, res) => {
  try {
    let fileName = "document.pdf";
    let rawContent = "";
    let source: "upload" | "email" | "whatsapp" | "api" = "upload";
    let fileType: "pdf" | "image" | "email" | "whatsapp" | "csv" | "other" =
      "pdf";

    const contentType = req.headers["content-type"] ?? "";

    // ── JSON body ──────────────────────────────────────────────────
    if (contentType.includes("application/json")) {
      const body = req.body as Record<string, unknown>;
      fileName = String(body["fileName"] ?? "document.pdf");
      rawContent = String(
        body["rawContent"] ?? body["content"] ?? body["rawText"] ?? "",
      );
      const srcRaw = String(body["source"] ?? "upload");
      source = (["upload", "email", "whatsapp", "api"] as const).includes(
        srcRaw as never,
      )
        ? (srcRaw as typeof source)
        : "upload";
      fileType = detectFileType(fileName, "application/json");

      // ── Multipart form-data ────────────────────────────────────────
    } else if (contentType.includes("multipart/form-data")) {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", resolve);
        req.on("error", reject);
      });

      const rawBody = Buffer.concat(chunks);
      const fileSize = rawBody.length;

      if (fileSize > MAX_SIZE) {
        return res.status(413).json({ error: "File too large (max 20 MB)" });
      }

      const boundary = contentType.split("boundary=")[1]?.trim();
      if (!boundary) {
        return res.status(400).json({ error: "Invalid multipart boundary" });
      }

      // Split on boundary delimiters
      const boundaryBuf = Buffer.from(`--${boundary}`);
      const parts: Buffer[] = [];
      let start = 0;
      while (start < rawBody.length) {
        const idx = rawBody.indexOf(boundaryBuf, start);
        if (idx === -1) break;
        if (start > 0) parts.push(rawBody.slice(start, idx));
        start = idx + boundaryBuf.length;
      }

      for (const part of parts) {
        const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
        if (headerEnd === -1) continue;
        const headerStr = part.slice(0, headerEnd).toString("utf8");
        const bodyBuf = part.slice(headerEnd + 4);
        // Strip trailing \r\n
        const bodyClean = bodyBuf.slice(
          0,
          bodyBuf.length - (bodyBuf.slice(-2).toString() === "\r\n" ? 2 : 0),
        );

        const filenameMatch = headerStr.match(/filename="([^"]+)"/);
        const nameMatch = headerStr.match(/name="([^"]+)"/);

        if (filenameMatch) {
          fileName = filenameMatch[1];
          const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/);
          const partContentType = ctMatch
            ? ctMatch[1].trim()
            : "application/octet-stream";
          fileType = detectFileType(fileName, partContentType);

          if (fileType === "pdf") {
            // Step 1: Try text extraction with pdf-parse
            const pdfText = await extractPdfText(bodyClean);
            if (pdfText.length > 50) {
              rawContent = pdfText;
            } else {
              // Step 2: pdf-parse returned no text (scanned PDF) → convert to JPEG for Vision
              console.log(
                `[Upload] pdf-parse returned no text for "${fileName}", converting to image via pdftoppm...`,
              );
              const jpegBase64 = await convertPdfToJpeg(bodyClean);
              if (jpegBase64) {
                rawContent = `[IMAGE_BASE64:image/jpeg:${jpegBase64}]`;
                console.log(
                  `[Upload] PDF converted to JPEG (${Math.round((jpegBase64.length * 0.75) / 1024)} KB) for vision extraction`,
                );
              } else {
                // Step 3: Last resort — store raw binary (Anthropic can handle this natively)
                rawContent = `[PDF_BINARY_FALLBACK:${bodyClean.toString("base64").slice(0, 200000)}]`;
                console.warn(
                  `[Upload] pdftoppm failed for "${fileName}", storing as binary fallback`,
                );
              }
            }
          } else if (fileType === "image") {
            // Image → store as base64 for Claude Vision in extraction agent
            const b64 = bodyClean.toString("base64");
            const ext2 = fileName.split(".").pop()?.toLowerCase() ?? "";
            const mimeType =
              ext2 === "png"
                ? "image/png"
                : ext2 === "gif"
                  ? "image/gif"
                  : ext2 === "webp"
                    ? "image/webp"
                    : partContentType.startsWith("image/")
                      ? (partContentType.split(";")[0].trim() as "image/jpeg")
                      : "image/jpeg";
            rawContent = `[IMAGE_BASE64:${mimeType}:${b64.slice(0, 2_000_000)}]`;
          } else {
            // CSV, email, other text-based formats
            rawContent = bodyClean.toString("utf8");
          }
        } else if (nameMatch?.[1] === "source") {
          const v = bodyClean.toString("utf8").trim();
          if (["upload", "email", "whatsapp", "api"].includes(v)) {
            source = v as typeof source;
          }
        }
      }
    } else {
      return res.status(400).json({
        error:
          "Unsupported content type. Use multipart/form-data or application/json",
      });
    }

    if (!fileName) return res.status(400).json({ error: "No file provided" });

    // Save document record
    const [doc] = await db
      .insert(documentsTable)
      .values({
        fileName,
        fileType,
        source,
        status: "pending",
        rawContent: rawContent.slice(0, 5_000_000), // 5 MB cap (covers base64 images)
      })
      .returning();

    // Run pipeline asynchronously
    runFullPipeline(doc.id).catch((err) => {
      console.error(`Pipeline failed for doc ${doc.id}:`, err);
    });

    return res.status(201).json({
      message: "Document uploaded and pipeline started",
      documentId: doc.id,
      fileName,
      fileType,
      status: "pending",
    });
  } catch (err) {
    req.log.error({ err }, "Upload failed");
    return res.status(500).json({ error: String(err) });
  }
});

export default router;

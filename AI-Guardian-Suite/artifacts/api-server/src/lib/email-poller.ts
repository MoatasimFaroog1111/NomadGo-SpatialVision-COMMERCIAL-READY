/**
 * Guardian Autonomous Email Poller
 *
 * Production IMAP client (imapflow) that:
 *   1. Connects to the configured mailbox
 *   2. Fetches unread emails with PDF/image attachments
 *   3. Creates a document record per attachment
 *   4. Runs the full 10-agent pipeline on each
 *   5. Auto-posts if confidence >= threshold and amount <= ceiling
 *   6. Sends oversized or low-confidence docs to the approval queue
 *   7. Marks processed emails as read (configurable)
 */

import { ImapFlow } from "imapflow";
import { db } from "@workspace/db";
import { emailSettingsTable, documentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { runFullPipeline } from "./pipeline-agents.js";
import { writeAuditLog } from "./audit.js";

export interface EmailPollResult {
  emailSubject: string;
  sender: string;
  attachmentsFound: number;
  documentsCreated: number;
  autoPosted: number;
  pendingApproval: number;
  errors: string[];
}

export interface PollSummary {
  polledAt: string;
  emailsScanned: number;
  attachmentsFound: number;
  documentsCreated: number;
  autoPosted: number;
  pendingApproval: number;
  errors: string[];
  durationMs: number;
}

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/tiff",
  "image/gif",
  "image/webp",
]);

const ALLOWED_EXT = /\.(pdf|jpg|jpeg|png|tiff|gif|webp)$/i;

/** Load email settings (id=1). Returns null if not configured or disabled. */
export async function loadEmailSettings() {
  try {
    const rows = await db
      .select()
      .from(emailSettingsTable)
      .where(eq(emailSettingsTable.id, 1))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Upsert email settings (always uses id=1) */
export async function saveEmailSettings(
  patch: Partial<typeof emailSettingsTable.$inferInsert>,
) {
  const existing = await db
    .select({ id: emailSettingsTable.id })
    .from(emailSettingsTable)
    .where(eq(emailSettingsTable.id, 1))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(emailSettingsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(emailSettingsTable.id, 1));
  } else {
    await db
      .insert(emailSettingsTable)
      .values({ id: 1, ...patch, updatedAt: new Date() });
  }
}

/** Test IMAP connectivity with provided credentials. Returns { ok, error }. */
export async function testImapConnection(cfg: {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}): Promise<{ ok: boolean; error?: string; mailboxCount?: number }> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.username, pass: cfg.password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX");
    await client.logout();
    return { ok: true, mailboxCount: mailbox.exists };
  } catch (err) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    return { ok: false, error: String(err) };
  }
}

/**
 * Poll the configured mailbox once.
 * Fetches all unseen messages with relevant attachments, creates documents,
 * and runs the full pipeline on each.
 */
export async function pollEmailOnce(): Promise<PollSummary> {
  const start = Date.now();
  const summary: PollSummary = {
    polledAt: new Date().toISOString(),
    emailsScanned: 0,
    attachmentsFound: 0,
    documentsCreated: 0,
    autoPosted: 0,
    pendingApproval: 0,
    errors: [],
    durationMs: 0,
  };

  const settings = await loadEmailSettings();
  if (!settings || !settings.enabled) {
    summary.errors.push("Email poller is disabled or not configured");
    summary.durationMs = Date.now() - start;
    return summary;
  }

  if (!settings.imapHost || !settings.imapUsername || !settings.imapPassword) {
    summary.errors.push(
      "IMAP credentials incomplete — set host, username, and password in Autonomous settings",
    );
    summary.durationMs = Date.now() - start;
    return summary;
  }

  const client = new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort,
    secure: settings.imapSsl,
    auth: { user: settings.imapUsername, pass: settings.imapPassword },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(settings.imapMailbox || "INBOX");

    if (mailbox.exists === 0) {
      await client.logout();
      summary.durationMs = Date.now() - start;
      await updatePollStats(settings, summary);
      return summary;
    }

    // Fetch unseen messages with full body structure
    const results: EmailPollResult[] = [];

    for await (const message of client.fetch(
      { seen: false },
      {
        envelope: true,
        bodyStructure: true,
        uid: true,
      },
    )) {
      summary.emailsScanned++;

      const sender = message.envelope?.from?.[0]
        ? `${message.envelope.from[0].name || ""} <${message.envelope.from[0].address || ""}>`.trim()
        : "unknown";
      const subject = message.envelope?.subject || `Email-${message.uid}`;

      const emailResult: EmailPollResult = {
        emailSubject: subject,
        sender,
        attachmentsFound: 0,
        documentsCreated: 0,
        autoPosted: 0,
        pendingApproval: 0,
        errors: [],
      };

      try {
        // Find attachment parts (cast imapflow's typed struct to generic map)
        const bodyStruct = message.bodyStructure as unknown as
          | Record<string, unknown>
          | undefined;
        const attachmentParts = collectAttachmentParts(bodyStruct);

        for (const part of attachmentParts) {
          const params = part["parameters"] as Record<string, string> | null;
          const dispParams = part["dispositionParameters"] as Record<
            string,
            string
          > | null;
          const fileName =
            params?.["name"] ||
            dispParams?.["filename"] ||
            `attachment.${String(part["subtype"] ?? "bin")}`;
          const mimeType =
            `${String(part["type"] ?? "")}/${String(part["subtype"] ?? "")}`.toLowerCase();

          if (!ALLOWED_MIME.has(mimeType) && !ALLOWED_EXT.test(fileName))
            continue;

          emailResult.attachmentsFound++;
          summary.attachmentsFound++;

          try {
            // Download attachment content
            const partNum = String(part["part"] ?? "1");
            const partData = await client.download(
              String(message.uid),
              partNum,
              { uid: true },
            );
            const chunks: Buffer[] = [];
            for await (const chunk of partData.content) {
              chunks.push(chunk as Buffer);
            }
            const rawBuffer = Buffer.concat(chunks);

            // Encode for storage
            const isImage = mimeType.startsWith("image/");
            let rawContent: string;
            if (isImage) {
              rawContent = `[IMAGE_BASE64:${mimeType}:${rawBuffer.toString("base64")}]`;
            } else {
              rawContent = `[PDF_BINARY_FALLBACK:${rawBuffer.toString("base64")}]`;
            }

            const fileType = isImage ? "image" : "pdf";

            // Create document record
            const [newDoc] = await db
              .insert(documentsTable)
              .values({
                fileName: `${subject} — ${fileName}`,
                fileType: fileType as "pdf" | "image",
                source: "email",
                status: "pending",
                rawContent,
              })
              .returning({ id: documentsTable.id });

            if (!newDoc) {
              emailResult.errors.push(
                `Failed to insert document for ${fileName}`,
              );
              continue;
            }

            await writeAuditLog({
              documentId: newDoc.id,
              agentName: "EmailPoller",
              action: "email_document_received",
              details: {
                subject,
                sender,
                fileName,
                mimeType,
                sizeBytes: rawBuffer.length,
              },
              severity: "info",
            });

            emailResult.documentsCreated++;
            summary.documentsCreated++;

            // Run full pipeline with autonomous amount ceiling
            const pipelineResult = await runFullPipeline(newDoc.id, {
              maxAutoPostAmount: settings.autoPostMaxAmount,
              sourceTag: "email",
            });

            if (pipelineResult.requiresApproval) {
              emailResult.pendingApproval++;
              summary.pendingApproval++;
            } else if (pipelineResult.finalStatus === "posted") {
              emailResult.autoPosted++;
              summary.autoPosted++;
            }
          } catch (attachErr) {
            const msg = `Failed to process attachment "${fileName}": ${String(attachErr).slice(0, 200)}`;
            emailResult.errors.push(msg);
            summary.errors.push(msg);
          }
        }

        // Mark email as read if configured
        if (settings.markAsRead && emailResult.documentsCreated > 0) {
          await client.messageFlagsAdd({ uid: message.uid }, ["\\Seen"], {
            uid: true,
          });
        }

        // Move to processed folder if configured
        if (settings.moveProcessedTo && emailResult.documentsCreated > 0) {
          try {
            await client.messageMove(
              { uid: message.uid },
              settings.moveProcessedTo,
              { uid: true },
            );
          } catch {
            /* Folder may not exist — silently skip */
          }
        }
      } catch (emailErr) {
        const msg = `Error processing email "${subject}": ${String(emailErr).slice(0, 200)}`;
        emailResult.errors.push(msg);
        summary.errors.push(msg);
      }

      results.push(emailResult);
    }

    await client.logout();
  } catch (connectErr) {
    summary.errors.push(
      `IMAP connection failed: ${String(connectErr).slice(0, 300)}`,
    );
  }

  summary.durationMs = Date.now() - start;
  await updatePollStats(settings, summary);
  return summary;
}

/** Recursively collect all attachment body parts from a BODYSTRUCTURE tree */
function collectAttachmentParts(
  structure: Record<string, unknown> | null | undefined,
  partNum = "",
): Array<Record<string, unknown>> {
  if (!structure) return [];
  const parts: Array<Record<string, unknown>> = [];

  const childParts = structure["childNodes"] as
    | Array<Record<string, unknown>>
    | undefined;
  if (Array.isArray(childParts)) {
    childParts.forEach((child, idx) => {
      const childPartNum = partNum ? `${partNum}.${idx + 1}` : String(idx + 1);
      const childWithPart = { ...child, part: child["part"] ?? childPartNum };
      parts.push(
        ...collectAttachmentParts(childWithPart, String(childWithPart["part"])),
      );
    });
    return parts;
  }

  const disposition = String(structure["disposition"] ?? "").toLowerCase();
  const mimeType =
    `${structure["type"] ?? ""}/${structure["subtype"] ?? ""}`.toLowerCase();
  const fileName =
    (structure["parameters"] as Record<string, string> | null)?.name ||
    (structure["dispositionParameters"] as Record<string, string> | null)
      ?.filename ||
    "";

  const isAttachment =
    disposition === "attachment" ||
    (ALLOWED_MIME.has(mimeType) && fileName.length > 0);

  if (isAttachment) {
    const withPart: Record<string, unknown> = { ...structure };
    if (!withPart["part"]) withPart["part"] = partNum || "1";
    parts.push(withPart);
  }

  return parts;
}

/** Persist last-polled timestamp and running stats */
async function updatePollStats(
  settings: typeof emailSettingsTable.$inferSelect,
  summary: PollSummary,
) {
  try {
    await db
      .update(emailSettingsTable)
      .set({
        lastPolledAt: new Date(),
        totalEmailsProcessed:
          (settings.totalEmailsProcessed ?? 0) + summary.emailsScanned,
        totalAutoPosted: (settings.totalAutoPosted ?? 0) + summary.autoPosted,
        totalPendingApproval:
          (settings.totalPendingApproval ?? 0) + summary.pendingApproval,
        updatedAt: new Date(),
      })
      .where(eq(emailSettingsTable.id, 1));
  } catch (e) {
    console.warn("[EmailPoller] Could not update poll stats:", e);
  }
}

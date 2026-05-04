import app from "./app";
import { logger } from "./lib/logger";
import { startAutonomousEngine } from "./lib/autonomous-engine.js";
import { loadEmailSettings } from "./lib/email-poller.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Auto-start the Autonomous Engine if configured and enabled in DB
  try {
    const emailSettings = await loadEmailSettings();
    if (
      emailSettings?.enabled &&
      emailSettings.imapHost &&
      emailSettings.imapUsername
    ) {
      const result = await startAutonomousEngine();
      logger.info(result, "Autonomous engine startup");
    } else {
      logger.info("Autonomous engine not started — disabled or unconfigured");
    }
  } catch (engineErr) {
    logger.warn(
      { err: engineErr },
      "Autonomous engine failed to auto-start — system still operational",
    );
  }
});

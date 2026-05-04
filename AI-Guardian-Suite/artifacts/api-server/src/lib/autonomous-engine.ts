/**
 * Guardian Autonomous Engine
 *
 * A lightweight in-process scheduler that fires the email poller on a
 * configurable interval.  State is kept in memory; settings are persisted
 * in the email_settings DB row.
 *
 * Lifecycle:
 *   startAutonomousEngine()  — start or restart the polling loop
 *   stopAutonomousEngine()   — gracefully stop
 *   getAutonomousStatus()    — current state snapshot
 */

import {
  pollEmailOnce,
  loadEmailSettings,
  type PollSummary,
} from "./email-poller.js";

// ── In-process state ─────────────────────────────────────────────────────────

export type EngineState = "stopped" | "running" | "polling" | "error";

interface EngineStatus {
  state: EngineState;
  startedAt: string | null;
  lastPollAt: string | null;
  nextPollAt: string | null;
  pollIntervalSeconds: number;
  totalPollCycles: number;
  totalEmailsScanned: number;
  totalDocumentsCreated: number;
  totalAutoPosted: number;
  totalPendingApproval: number;
  lastPollSummary: PollSummary | null;
  recentActivity: PollSummary[];
  errorMessage: string | null;
}

const MAX_ACTIVITY_LOG = 50;

const status: EngineStatus = {
  state: "stopped",
  startedAt: null,
  lastPollAt: null,
  nextPollAt: null,
  pollIntervalSeconds: 300,
  totalPollCycles: 0,
  totalEmailsScanned: 0,
  totalDocumentsCreated: 0,
  totalAutoPosted: 0,
  totalPendingApproval: 0,
  lastPollSummary: null,
  recentActivity: [],
  errorMessage: null,
};

let _timer: ReturnType<typeof setTimeout> | null = null;
let _running = false;

// ── Public API ───────────────────────────────────────────────────────────────

export function getAutonomousStatus(): EngineStatus & { enabled: boolean } {
  return {
    ...status,
    enabled: _running,
  };
}

export async function startAutonomousEngine(): Promise<{
  started: boolean;
  message: string;
}> {
  const settings = await loadEmailSettings();

  if (!settings) {
    return {
      started: false,
      message: "Email settings not found — configure IMAP credentials first",
    };
  }

  if (!settings.enabled) {
    return {
      started: false,
      message: "Autonomous mode is disabled in settings",
    };
  }

  if (!settings.imapHost || !settings.imapUsername || !settings.imapPassword) {
    return {
      started: false,
      message: "IMAP credentials incomplete — set host, username, and password",
    };
  }

  if (_running) {
    return { started: true, message: "Autonomous engine is already running" };
  }

  _running = true;
  status.state = "running";
  status.startedAt = new Date().toISOString();
  status.errorMessage = null;
  status.pollIntervalSeconds = settings.pollIntervalSeconds;

  console.log(
    `[AutonomousEngine] Started — polling every ${settings.pollIntervalSeconds}s`,
  );

  // Run immediately on start, then schedule
  _schedulePoll(settings.pollIntervalSeconds);

  return {
    started: true,
    message: `Autonomous engine started — polling every ${settings.pollIntervalSeconds}s`,
  };
}

export function stopAutonomousEngine(): { stopped: boolean; message: string } {
  if (!_running) {
    return { stopped: true, message: "Engine was not running" };
  }

  _running = false;
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  status.state = "stopped";
  console.log("[AutonomousEngine] Stopped");
  return { stopped: true, message: "Autonomous engine stopped" };
}

/** Manually trigger one poll cycle (for testing / on-demand) */
export async function triggerManualPoll(): Promise<PollSummary> {
  return _runPollCycle();
}

// ── Internal ─────────────────────────────────────────────────────────────────

function _schedulePoll(intervalSeconds: number) {
  if (!_running) return;

  // First poll immediately (delay=0), then regular interval
  const delay = status.totalPollCycles === 0 ? 0 : intervalSeconds * 1000;
  status.nextPollAt = new Date(Date.now() + delay).toISOString();

  _timer = setTimeout(async () => {
    if (!_running) return;
    await _runPollCycle();

    // Re-read interval in case settings changed
    const fresh = await loadEmailSettings();
    const nextInterval = fresh?.pollIntervalSeconds ?? intervalSeconds;
    status.pollIntervalSeconds = nextInterval;

    // Reschedule unless disabled or stopped
    if (_running && fresh?.enabled) {
      _schedulePoll(nextInterval);
    } else {
      stopAutonomousEngine();
    }
  }, delay);
}

async function _runPollCycle(): Promise<PollSummary> {
  status.state = "polling";
  status.lastPollAt = new Date().toISOString();
  status.nextPollAt = null;

  let summary: PollSummary;
  try {
    summary = await pollEmailOnce();
  } catch (err) {
    summary = {
      polledAt: new Date().toISOString(),
      emailsScanned: 0,
      attachmentsFound: 0,
      documentsCreated: 0,
      autoPosted: 0,
      pendingApproval: 0,
      errors: [String(err)],
      durationMs: 0,
    };
  }

  // Update counters
  status.totalPollCycles++;
  status.totalEmailsScanned += summary.emailsScanned;
  status.totalDocumentsCreated += summary.documentsCreated;
  status.totalAutoPosted += summary.autoPosted;
  status.totalPendingApproval += summary.pendingApproval;
  status.lastPollSummary = summary;

  // Keep rolling activity log
  status.recentActivity.unshift(summary);
  if (status.recentActivity.length > MAX_ACTIVITY_LOG) {
    status.recentActivity.length = MAX_ACTIVITY_LOG;
  }

  status.state = _running ? "running" : "stopped";
  status.errorMessage = summary.errors.length > 0 ? summary.errors[0] : null;

  if (summary.emailsScanned > 0 || summary.errors.length > 0) {
    console.log(
      `[AutonomousEngine] Poll #${status.totalPollCycles}: ${summary.emailsScanned} emails, ` +
        `${summary.documentsCreated} docs, ${summary.autoPosted} auto-posted, ` +
        `${summary.pendingApproval} pending. Errors: ${summary.errors.length}`,
    );
  }

  return summary;
}

import { createDefaultSustainContext } from "../../core/sustain/engine";
import { createOpenClawCli } from "../../services/openclaw-cli";
import { toErrorMessage } from "../../utils/errors";

let context: ReturnType<typeof createDefaultSustainContext> | null = null;

export type RetryJobSyncNote = {
  action: "created" | "removed" | "kept" | "skipped";
  message: string;
  warning: boolean;
};

export function getSustainContext() {
  if (!context) {
    context = createDefaultSustainContext();
  }
  return context;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export async function ensureRetryOrdersJob(): Promise<RetryJobSyncNote | null> {
  const openclaw = createOpenClawCli();

  try {
    if (!(await openclaw.checkAvailable())) {
      return {
        action: "skipped",
        message:
          "OpenClaw CLI is not available on PATH. The pending-order retry job was not scheduled.",
        warning: true,
      };
    }

    const result = await openclaw.ensureSustainRetryCronJob();
    if (result.action === "created") {
      return {
        action: "created",
        message: `Retry job scheduled: every ${result.job.every} in session ${result.job.session}.`,
        warning: false,
      };
    }

    if (result.removed.length > 0) {
      return {
        action: "kept",
        message: `Retry job kept. Removed stale retry jobs: ${result.removed.map((job) => job.name).join(", ")}.`,
        warning: false,
      };
    }

    return null;
  } catch (error) {
    return {
      action: "skipped",
      message: `The pending-order retry job could not be scheduled: ${toErrorMessage(error)}`,
      warning: true,
    };
  }
}

export async function syncRetryOrdersJobWithPendingState(
  emptyReason = "No pending top-up orders remain.",
): Promise<RetryJobSyncNote | null> {
  const pendingCount = getSustainContext().engine.listPendingOrders().length;
  if (pendingCount > 0) {
    return ensureRetryOrdersJob();
  }

  const openclaw = createOpenClawCli();

  try {
    if (!(await openclaw.checkAvailable())) {
      return {
        action: "skipped",
        message:
          "OpenClaw CLI is not available on PATH. The retry job could not be cleaned up automatically.",
        warning: true,
      };
    }

    const result = await openclaw.removeSustainRetryCronJobs();
    if (result.action === "removed") {
      return {
        action: "removed",
        message: `Retry job removed. ${emptyReason}`,
        warning: false,
      };
    }

    return null;
  } catch (error) {
    return {
      action: "skipped",
      message: `The retry job could not be cleaned up automatically: ${toErrorMessage(error)}`,
      warning: true,
    };
  }
}

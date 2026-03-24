import {
  DEFAULT_OPENCLAW_RETRY_EVERY,
  DEFAULT_OPENCLAW_SESSION,
  DEFAULT_OPENCLAW_TICK_EVERY,
  CRITICAL_OPENCLAW_TICK_EVERY,
  HEALTHY_OPENCLAW_TICK_EVERY,
  LOW_OPENCLAW_TICK_EVERY,
  createOpenClawCli,
} from "../../../services/openclaw-cli";
import { getSustainContext, printJson } from "../helpers";

export async function setupOpenClawAction(
  options: {
    tickEvery?: string;
    retryEvery?: string;
    session?: string;
    json?: boolean;
  } = {},
): Promise<void> {
  const openclaw = createOpenClawCli();
  if (!(await openclaw.checkAvailable())) {
    throw new Error("OpenClaw CLI is not available on PATH.");
  }

  const pendingCount = getSustainContext().engine.listPendingOrders().length;
  const includeRetryJob = pendingCount > 0;
  const result = await openclaw.registerSustainCronJobs({
    tickEvery: options.tickEvery,
    retryEvery: options.retryEvery,
    session: options.session,
    includeRetryJob,
  });
  const output = {
    ...result,
    includeRetryJob,
    pendingOrderCount: pendingCount,
  };

  if (options.json) {
    printJson(output);
    return;
  }

  console.log("OpenClaw sustain jobs registered.");
  console.log(
    `Initial Tick: every ${options.tickEvery?.trim() || DEFAULT_OPENCLAW_TICK_EVERY}`,
  );
  console.log(
    `Adaptive Health Cadence: healthy=${HEALTHY_OPENCLAW_TICK_EVERY}, low=${LOW_OPENCLAW_TICK_EVERY}, critical=${CRITICAL_OPENCLAW_TICK_EVERY}`,
  );
  if (includeRetryJob) {
    console.log(
      `Retry Orders: every ${options.retryEvery?.trim() || DEFAULT_OPENCLAW_RETRY_EVERY}`,
    );
    console.log(`Pending Orders: ${pendingCount}`);
  } else {
    console.log("Retry Orders: on-demand only. No pending orders were found.");
  }
  console.log(`Session: ${options.session?.trim() || DEFAULT_OPENCLAW_SESSION}`);
  console.log(`Created: ${result.created.map((job) => job.name).join(", ")}`);
  if (result.removed.length > 0) {
    console.log(`Replaced: ${result.removed.map((job) => job.name).join(", ")}`);
  }
}

import {
  DEFAULT_OPENCLAW_RETRY_EVERY,
  DEFAULT_OPENCLAW_SESSION,
  DEFAULT_OPENCLAW_TICK_EVERY,
  createOpenClawCli,
} from "../../../services/openclaw-cli";
import { printJson } from "../helpers";

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

  const result = await openclaw.registerSustainCronJobs({
    tickEvery: options.tickEvery,
    retryEvery: options.retryEvery,
    session: options.session,
  });

  if (options.json) {
    printJson(result);
    return;
  }

  console.log("OpenClaw sustain jobs registered.");
  console.log(
    `Tick: every ${options.tickEvery?.trim() || DEFAULT_OPENCLAW_TICK_EVERY}`,
  );
  console.log(
    `Retry Orders: every ${options.retryEvery?.trim() || DEFAULT_OPENCLAW_RETRY_EVERY}`,
  );
  console.log(`Session: ${options.session?.trim() || DEFAULT_OPENCLAW_SESSION}`);
  console.log(`Created: ${result.created.map((job) => job.name).join(", ")}`);
  if (result.removed.length > 0) {
    console.log(`Replaced: ${result.removed.map((job) => job.name).join(", ")}`);
  }
}

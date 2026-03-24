import { cleanupDeepskyOpenClaw } from "../../../services/openclaw-config";
import { createOpenClawCli } from "../../../services/openclaw-cli";
import { toErrorMessage } from "../../../utils/errors";
import { printJson } from "../../sustain/helpers";

export async function cleanOpenClawAction(
  options: {
    providerOnly?: boolean;
    jobsOnly?: boolean;
    json?: boolean;
  } = {},
): Promise<void> {
  if (options.providerOnly && options.jobsOnly) {
    throw new Error("`--provider-only` and `--jobs-only` cannot be used together.");
  }

  const shouldCleanProvider = !options.jobsOnly;
  const shouldCleanJobs = !options.providerOnly;
  const result: {
    success: boolean;
    provider?: ReturnType<typeof cleanupDeepskyOpenClaw>;
    jobs?: {
      removed: string[];
    };
    errors: string[];
  } = {
    success: true,
    errors: [],
  };

  if (shouldCleanProvider) {
    try {
      result.provider = cleanupDeepskyOpenClaw();
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to clean OpenClaw provider config: ${toErrorMessage(error)}`);
    }
  }

  if (shouldCleanJobs) {
    try {
      const openclaw = createOpenClawCli();
      if (!(await openclaw.checkAvailable())) {
        throw new Error("OpenClaw CLI is not available on PATH.");
      }

      const jobsResult = await openclaw.removeSustainCronJobs();
      result.jobs = {
        removed: jobsResult.removed.map((job) => job.name),
      };
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to clean OpenClaw sustain jobs: ${toErrorMessage(error)}`);
    }
  }

  if (options.json) {
    printJson(result);
    if (!result.success) {
      process.exitCode = 1;
    }
    return;
  }

  if (result.success) {
    console.log("OpenClaw cleanup completed.");
  } else {
    console.error("OpenClaw cleanup partially completed.");
  }

  if (result.provider) {
    console.log(
      `Provider: ${result.provider.changed ? "cleaned" : "no Deepsky provider settings found"}`,
    );
    console.log(`Config Path: ${result.provider.configPath}`);
    if (result.provider.removedModelRefs.length > 0) {
      console.log(`Removed Model Refs: ${result.provider.removedModelRefs.join(", ")}`);
    }
    console.log(
      `Selection Changed: ${result.provider.selectionChanged ? "yes" : "no"}`,
    );
  }

  if (result.jobs) {
    console.log(
      `Jobs: ${result.jobs.removed.length > 0 ? result.jobs.removed.join(", ") : "no sustain jobs found"}`,
    );
  }

  for (const error of result.errors) {
    console.error(error);
  }

  if (!result.success) {
    process.exitCode = 1;
  }
}

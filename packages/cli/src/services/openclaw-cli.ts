import { spawn } from "node:child_process";
import { isRecord } from "../storage/json-store";
import { toErrorMessage } from "../utils/errors";

export const HEALTHY_OPENCLAW_TICK_EVERY = "2h";
export const LOW_OPENCLAW_TICK_EVERY = "1h";
export const CRITICAL_OPENCLAW_TICK_EVERY = "20m";
export const DEFAULT_OPENCLAW_TICK_EVERY = CRITICAL_OPENCLAW_TICK_EVERY;
export const DEFAULT_OPENCLAW_RETRY_EVERY = "10m";
export const DEFAULT_OPENCLAW_SESSION = "isolated";
export const SUSTAIN_TICK_JOB_NAME = "deepsky-sustain-tick";
export const SUSTAIN_RETRY_JOB_NAME = "deepsky-sustain-retry-orders";
const LEGACY_SUSTAIN_JOB_NAMES = new Set([
  "market-sustain-tick",
  "market-sustain-retry-orders",
]);

export type OpenClawCommandResult = {
  stdout: string;
  stderr: string;
};

export type OpenClawCronJob = {
  id: string;
  name: string;
  every: string | null;
  session: string | null;
  raw: Record<string, unknown>;
};

export type OpenClawCronStatus = {
  enabled: boolean | null;
  jobs: number | null;
  storePath: string | null;
  raw: Record<string, unknown> | null;
};

export type SustainOpenClawJobDefinition = {
  name: string;
  every: string;
  session: string;
  message: string;
  description: string;
  announce: boolean;
};

export type RegisterSustainOpenClawJobsOptions = {
  tickEvery?: string;
  retryEvery?: string;
  session?: string;
  includeRetryJob?: boolean;
};

export type RegisterSustainOpenClawJobsResult = {
  removed: OpenClawCronJob[];
  created: Array<{
    name: string;
    raw: unknown;
  }>;
  jobs: SustainOpenClawJobDefinition[];
};

export type EnsureSustainRetryCronJobResult = {
  action: "created" | "kept";
  removed: OpenClawCronJob[];
  created?: {
    name: string;
    raw: unknown;
  };
  job: SustainOpenClawJobDefinition;
};

export type RemoveSustainRetryCronJobsResult = {
  action: "removed" | "kept";
  removed: OpenClawCronJob[];
};

export type RemoveSustainCronJobsResult = {
  action: "removed" | "kept";
  removed: OpenClawCronJob[];
};

export type OpenClawExecutor = (args: string[]) => Promise<OpenClawCommandResult>;

export function createOpenClawCli(executor: OpenClawExecutor = runOpenClawCommand) {
  return {
    async checkAvailable(): Promise<boolean> {
      try {
        await executor(["--version"]);
        return true;
      } catch {
        return false;
      }
    },

    async listCronJobs(): Promise<OpenClawCronJob[]> {
      const { stdout } = await executor(["cron", "list", "--json"]);
      return normalizeCronJobs(parseJsonOutput(stdout, "cron list"));
    },

    async removeCronJob(id: string): Promise<void> {
      await executor(["cron", "rm", id, "--json"]);
    },

    async getCronStatus(): Promise<OpenClawCronStatus> {
      const { stdout } = await executor(["cron", "status", "--json"]);
      return normalizeCronStatus(parseJsonOutput(stdout, "cron status"));
    },

    async registerSustainCronJobs(
      options: RegisterSustainOpenClawJobsOptions = {},
    ): Promise<RegisterSustainOpenClawJobsResult> {
      const jobs = buildSustainOpenClawJobs(options);
      const existing = await this.listCronJobs();
      const targetNames = new Set([
        SUSTAIN_TICK_JOB_NAME,
        SUSTAIN_RETRY_JOB_NAME,
        ...LEGACY_SUSTAIN_JOB_NAMES,
      ]);
      const removed: OpenClawCronJob[] = [];

      for (const job of existing) {
        if (!targetNames.has(job.name)) {
          continue;
        }
        await this.removeCronJob(job.id);
        removed.push(job);
      }

      const created: RegisterSustainOpenClawJobsResult["created"] = [];

      for (const job of jobs) {
        created.push(await createCronJob(executor, job));
      }

      const persisted = await this.listCronJobs();
      const persistedNames = new Set(persisted.map((job) => job.name));
      const missingNames = jobs
        .map((job) => job.name)
        .filter((name) => !persistedNames.has(name));

      if (missingNames.length > 0) {
        const status = await this.getCronStatus().catch(() => null);
        const statusDetails = status
          ? ` Scheduler status: enabled=${status.enabled ?? "unknown"}, jobs=${status.jobs ?? "unknown"}${status.storePath ? `, storePath=${status.storePath}` : ""}.`
          : "";
        throw new Error(
          `OpenClaw reported cron job creation, but the jobs were not persisted: ${missingNames.join(", ")}.${statusDetails}`,
        );
      }

      return {
        removed,
        created,
        jobs,
      };
    },

    async ensureSustainRetryCronJob(
      options: RegisterSustainOpenClawJobsOptions = {},
    ): Promise<EnsureSustainRetryCronJobResult> {
      const existing = await this.listCronJobs();
      const removed: OpenClawCronJob[] = [];
      let currentRetryJob: OpenClawCronJob | null = null;

      for (const job of existing) {
        if (!isRetryCronJobName(job.name)) {
          continue;
        }

        if (job.name === SUSTAIN_RETRY_JOB_NAME && currentRetryJob === null) {
          currentRetryJob = job;
          continue;
        }

        await this.removeCronJob(job.id);
        removed.push(job);
      }

      const jobDefinition = buildSustainOpenClawRetryJob(
        resolveRetryJobOptions(existing, options),
      );

      if (currentRetryJob) {
        return {
          action: "kept",
          removed,
          job: jobDefinition,
        };
      }

      return {
        action: "created",
        removed,
        created: await createCronJob(executor, jobDefinition),
        job: jobDefinition,
      };
    },

    async removeSustainRetryCronJobs(): Promise<RemoveSustainRetryCronJobsResult> {
      const existing = await this.listCronJobs();
      const removed: OpenClawCronJob[] = [];

      for (const job of existing) {
        if (!isRetryCronJobName(job.name)) {
          continue;
        }

        await this.removeCronJob(job.id);
        removed.push(job);
      }

      return {
        action: removed.length > 0 ? "removed" : "kept",
        removed,
      };
    },

    async removeSustainCronJobs(): Promise<RemoveSustainCronJobsResult> {
      const existing = await this.listCronJobs();
      const removed: OpenClawCronJob[] = [];

      for (const job of existing) {
        if (!isSustainCronJobName(job.name)) {
          continue;
        }

        await this.removeCronJob(job.id);
        removed.push(job);
      }

      return {
        action: removed.length > 0 ? "removed" : "kept",
        removed,
      };
    },
  };
}

export function buildSustainOpenClawJobs(
  options: RegisterSustainOpenClawJobsOptions = {},
): SustainOpenClawJobDefinition[] {
  const jobs = [buildSustainOpenClawTickJob(options)];

  if (options.includeRetryJob ?? true) {
    jobs.push(buildSustainOpenClawRetryJob(options));
  }

  return jobs;
}

export function buildSustainOpenClawTickJob(
  options: RegisterSustainOpenClawJobsOptions = {},
): SustainOpenClawJobDefinition {
  const tickEvery = options.tickEvery?.trim() || DEFAULT_OPENCLAW_TICK_EVERY;
  const retryEvery = options.retryEvery?.trim() || DEFAULT_OPENCLAW_RETRY_EVERY;
  const session = options.session?.trim() || DEFAULT_OPENCLAW_SESSION;
  const announce = session !== "main";
  const cadenceInstructions = buildAdaptiveTickCadenceInstructions({
    retryEvery,
    session,
  });

  return {
    name: SUSTAIN_TICK_JOB_NAME,
    every: tickEvery,
    session,
    message: [
      "You are an autonomous agent. Run a sustain review now.",
      "1. Run `deepsky sustain health-check --json` and `deepsky sustain forecast --json`.",
      cadenceInstructions,
      "3. If balance is healthy, do nothing else.",
      "4. If balance is low, run `deepsky sustain list-models --json` if pricing context would help you decide next steps.",
      "5. If balance is critical or runway is too short, choose a top-up amount yourself and run `deepsky sustain top-up <amount>`.",
      "6. If the wallet rejects the transfer amount or policy, report the exact wallet-side error.",
      "7. Briefly announce important actions. Stay quiet if nothing needs doing.",
    ].join(" "),
    description: "Deepsky sustain keep-alive: observe, decide, act, and report",
    announce,
  };
}

export function buildSustainOpenClawRetryJob(
  options: RegisterSustainOpenClawJobsOptions = {},
): SustainOpenClawJobDefinition {
  const retryEvery = options.retryEvery?.trim() || DEFAULT_OPENCLAW_RETRY_EVERY;
  const session = options.session?.trim() || DEFAULT_OPENCLAW_SESSION;
  const announce = session !== "main";

  return {
    name: SUSTAIN_RETRY_JOB_NAME,
    every: retryEvery,
    session,
    message: [
      "Run `deepsky sustain retry-orders --json` to check for pending top-up orders that need retry.",
      "If there are no pending orders, remove this retry job and stay quiet.",
      "If any orders were escalated to manual review, report full details to the user and stop scheduling automatic retries for those orders.",
    ].join(" "),
    description: "Retry pending Deepsky sustain top-up orders and escalate true failures",
    announce,
  };
}

function buildAdaptiveTickCadenceInstructions(
  options: Required<Pick<RegisterSustainOpenClawJobsOptions, "retryEvery" | "session">>,
): string {
  return [
    "2. Use the `status` field from `deepsky sustain health-check --json` to set the next review cadence.",
    `If status is healthy, run \`${buildSustainSetupCommand({
      tickEvery: HEALTHY_OPENCLAW_TICK_EVERY,
      retryEvery: options.retryEvery,
      session: options.session,
    })}\`.`,
    `If status is low, run \`${buildSustainSetupCommand({
      tickEvery: LOW_OPENCLAW_TICK_EVERY,
      retryEvery: options.retryEvery,
      session: options.session,
    })}\`.`,
    `If status is critical, run \`${buildSustainSetupCommand({
      tickEvery: CRITICAL_OPENCLAW_TICK_EVERY,
      retryEvery: options.retryEvery,
      session: options.session,
    })}\`.`,
  ].join(" ");
}

function buildSustainSetupCommand(
  options: {
    tickEvery: string;
    retryEvery: string;
    session: string;
  },
): string {
  return [
    "deepsky sustain setup openclaw",
    `--tick-every ${options.tickEvery}`,
    `--retry-every ${options.retryEvery}`,
    `--session ${options.session}`,
  ].join(" ");
}

function createCronAddArgs(job: SustainOpenClawJobDefinition): string[] {
  const args = [
    "cron",
    "add",
    "--json",
    "--name",
    job.name,
    "--every",
    job.every,
    "--session",
    job.session,
    "--description",
    job.description,
  ];

  if (job.session === "main") {
    args.push("--system-event", job.message);
  } else {
    args.push("--message", job.message);
  }

  if (job.announce && job.session !== "main") {
    args.push("--announce");
  }

  return args;
}

async function createCronJob(
  executor: OpenClawExecutor,
  job: SustainOpenClawJobDefinition,
): Promise<{
  name: string;
  raw: unknown;
}> {
  const { stdout } = await executor(createCronAddArgs(job));
  return {
    name: job.name,
    raw: tryParseJson(stdout),
  };
}

function resolveRetryJobOptions(
  existing: OpenClawCronJob[],
  options: RegisterSustainOpenClawJobsOptions = {},
): RegisterSustainOpenClawJobsOptions {
  const retryTemplate = existing.find((job) => isRetryCronJobName(job.name));
  const tickTemplate = existing.find((job) => job.name === SUSTAIN_TICK_JOB_NAME);

  return {
    retryEvery:
      options.retryEvery?.trim() ||
      retryTemplate?.every ||
      DEFAULT_OPENCLAW_RETRY_EVERY,
    session:
      options.session?.trim() ||
      retryTemplate?.session ||
      tickTemplate?.session ||
      DEFAULT_OPENCLAW_SESSION,
  };
}

async function runOpenClawCommand(args: string[]): Promise<OpenClawCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("openclaw", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const details = stderr.trim() || stdout.trim() || `exit code ${code ?? "unknown"}`;
      reject(new Error(details));
    });
  });
}

function parseJsonOutput(stdout: string, label: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`OpenClaw ${label} returned invalid JSON: ${toErrorMessage(error)}`);
  }
}

function tryParseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    return stdout.trim();
  }
}

function normalizeCronJobs(value: unknown): OpenClawCronJob[] {
  const jobsValue = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.jobs)
      ? value.jobs
      : [];

  return jobsValue.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const id = readStringField(item, ["id", "jobId", "cronId"]);
    const name = readStringField(item, ["name"]);

    if (!id || !name) {
      return [];
    }

    return [
      {
        id,
        name,
        every: readCronEvery(item),
        session: readCronSession(item),
        raw: item,
      },
    ];
  });
}

function normalizeCronStatus(value: unknown): OpenClawCronStatus {
  if (!isRecord(value)) {
    return {
      enabled: null,
      jobs: null,
      storePath: null,
      raw: null,
    };
  }

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : null,
    jobs: typeof value.jobs === "number" ? value.jobs : null,
    storePath: typeof value.storePath === "string" ? value.storePath : null,
    raw: value,
  };
}

function readStringField(
  value: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function readCronEvery(value: Record<string, unknown>): string | null {
  const direct = readStringField(value, ["every", "interval"]);
  if (direct) {
    return direct;
  }

  if (isRecord(value.schedule)) {
    return readStringField(value.schedule, ["every", "interval"]);
  }

  return null;
}

function readCronSession(value: Record<string, unknown>): string | null {
  const direct = readStringField(value, ["session", "targetSession"]);
  if (direct) {
    return direct;
  }

  if (isRecord(value.target)) {
    return readStringField(value.target, ["session"]);
  }

  return null;
}

function isRetryCronJobName(name: string): boolean {
  return name === SUSTAIN_RETRY_JOB_NAME || name === "market-sustain-retry-orders";
}

function isSustainCronJobName(name: string): boolean {
  return (
    name === SUSTAIN_TICK_JOB_NAME ||
    isRetryCronJobName(name) ||
    name === "market-sustain-tick"
  );
}

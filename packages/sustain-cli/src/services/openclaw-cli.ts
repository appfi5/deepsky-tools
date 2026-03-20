import { spawn } from "node:child_process";
import { isRecord } from "../storage/json-store";
import { toErrorMessage } from "../utils/errors";

export const DEFAULT_OPENCLAW_TICK_EVERY = "5m";
export const DEFAULT_OPENCLAW_RETRY_EVERY = "10m";
export const DEFAULT_OPENCLAW_SESSION = "isolated";

export type OpenClawCommandResult = {
  stdout: string;
  stderr: string;
};

export type OpenClawCronJob = {
  id: string;
  name: string;
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
};

export type RegisterSustainOpenClawJobsResult = {
  removed: OpenClawCronJob[];
  created: Array<{
    name: string;
    raw: unknown;
  }>;
  jobs: SustainOpenClawJobDefinition[];
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
      const targetNames = new Set(jobs.map((job) => job.name));
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

        const { stdout } = await executor(args);
        created.push({
          name: job.name,
          raw: tryParseJson(stdout),
        });
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
  };
}

export function buildSustainOpenClawJobs(
  options: RegisterSustainOpenClawJobsOptions = {},
): SustainOpenClawJobDefinition[] {
  const tickEvery = options.tickEvery?.trim() || DEFAULT_OPENCLAW_TICK_EVERY;
  const retryEvery = options.retryEvery?.trim() || DEFAULT_OPENCLAW_RETRY_EVERY;
  const session = options.session?.trim() || DEFAULT_OPENCLAW_SESSION;
  const announce = session !== "main";

  return [
    {
      name: "market-sustain-tick",
      every: tickEvery,
      session,
      message: [
        "You are an autonomous agent. Run a sustain review now.",
        "1. Run `superise market-sustain health-check --json` and `superise market-sustain forecast --json`.",
        "2. If balance is healthy, do nothing.",
        "3. If balance is low, run `superise market-sustain list-models --json` if pricing context would help you decide next steps.",
        "4. If balance is critical or runway is too short, choose a top-up amount yourself and run `superise market-sustain top-up <amount>`.",
        "5. If the wallet rejects the transfer amount or policy, report the exact wallet-side error.",
        "6. If a recharge may have partially failed, run `superise market-sustain retry-orders --json`.",
        "7. Briefly announce important actions. Stay quiet if nothing needs doing.",
      ].join(" "),
      description: "Market sustain keep-alive: observe, decide, act, and report",
      announce,
    },
    {
      name: "market-sustain-retry-orders",
      every: retryEvery,
      session,
      message: [
        "Run `superise market-sustain retry-orders --json` to check for pending top-up orders that need retry.",
        "If there are no pending orders, do not bother the user.",
        "If any orders were escalated to manual review, report full details to the user.",
      ].join(" "),
      description: "Retry pending market sustain top-up orders and escalate true failures",
      announce,
    },
  ];
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

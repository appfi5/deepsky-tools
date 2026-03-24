import { spawn } from "node:child_process";
import { DEFAULT_CONFIG } from "../utils/constants";
import { toErrorMessage } from "../utils/errors";

export const SUPERISE_AGENT_WALLET_CONTAINER_NAME = "superise-agent-wallet";
export const SUPERISE_AGENT_WALLET_VOLUME_NAME = "superise-agent-wallet-data";
export const SUPERISE_AGENT_WALLET_IMAGE = "superise/agent-wallet:latest";
export const SUPERISE_AGENT_WALLET_OWNER_NOTICE_PATH = "/app/runtime-data/owner-credential.txt";

const INITIAL_OWNER_PASSWORD_PREFIX = "Quickstart initial Owner password (shown once):";

export type WalletInstallCommandResult = {
  stdout: string;
  stderr: string;
};

export type WalletInstallExecutor = (
  command: string,
  args: string[],
) => Promise<WalletInstallCommandResult>;

export type EnsureSuperiseAgentWalletOptions = {
  walletMcpUrl?: string;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  maxWaitMs?: number;
};

export type InspectSuperiseAgentWalletResult =
  | {
      status: "unsupported";
      managed: false;
      walletMcpUrl: string;
      healthUrl: string | null;
      containerState: null;
      message: string;
    }
  | {
      status: "not-installed";
      managed: true;
      walletMcpUrl: string;
      healthUrl: string;
      containerState: null;
      message: string;
    }
  | {
      status: "stopped";
      managed: true;
      walletMcpUrl: string;
      healthUrl: string;
      containerState: string;
      message: string;
    }
  | {
      status: "running";
      managed: true;
      walletMcpUrl: string;
      healthUrl: string;
      containerState: "running" | null;
      message: string;
    }
  | {
      status: "unhealthy";
      managed: true;
      walletMcpUrl: string;
      healthUrl: string;
      containerState: string;
      message: string;
    };

export type EnsureSuperiseAgentWalletResult =
  | {
      action: "skipped";
      managed: false;
      walletMcpUrl: string;
      healthUrl: string | null;
      containerName: string;
      volumeName: string;
      image: string;
      message: string;
      initialOwnerPassword: null;
    }
  | {
      action: "already-running" | "started-existing" | "installed";
      managed: true;
      walletMcpUrl: string;
      healthUrl: string;
      containerName: string;
      volumeName: string;
      image: string;
      message: string;
      initialOwnerPassword: string | null;
    };

export function canAutoInstallSuperiseAgentWallet(walletMcpUrl: string): boolean {
  try {
    const url = new URL(walletMcpUrl);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      url.port === "18799" &&
      normalizePathname(url.pathname) === "/mcp"
    );
  } catch {
    return false;
  }
}

export function getSuperiseAgentWalletHealthUrl(walletMcpUrl: string): string | null {
  try {
    const url = new URL(walletMcpUrl);
    url.pathname = "/health";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export async function inspectSuperiseAgentWallet(
  options: EnsureSuperiseAgentWalletOptions = {},
  dependencies: {
    fetchImpl?: typeof fetch;
    executor?: WalletInstallExecutor;
  } = {},
): Promise<InspectSuperiseAgentWalletResult> {
  const walletMcpUrl = options.walletMcpUrl?.trim() || DEFAULT_CONFIG.walletMcpUrl;
  const healthUrl = getSuperiseAgentWalletHealthUrl(walletMcpUrl);
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_CONFIG.requestTimeoutMs;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const executor = dependencies.executor ?? runCommand;

  if (!healthUrl || !canAutoInstallSuperiseAgentWallet(walletMcpUrl)) {
    return {
      status: "unsupported",
      managed: false,
      walletMcpUrl,
      healthUrl,
      containerState: null,
      message:
        "Configured wallet MCP URL is not the default local SupeRISE Agent Wallet endpoint, so automatic wallet setup was skipped.",
    };
  }

  if (await isWalletHealthy(healthUrl, requestTimeoutMs, fetchImpl)) {
    return {
      status: "running",
      managed: true,
      walletMcpUrl,
      healthUrl,
      containerState: "running",
      message: "SupeRISE Agent Wallet is already installed and running. Skipped startup.",
    };
  }

  const containerState = await getContainerState(executor);
  if (!containerState) {
    return {
      status: "not-installed",
      managed: true,
      walletMcpUrl,
      healthUrl,
      containerState: null,
      message: "SupeRISE Agent Wallet is not installed yet.",
    };
  }

  if (containerState !== "running") {
    return {
      status: "stopped",
      managed: true,
      walletMcpUrl,
      healthUrl,
      containerState,
      message: `SupeRISE Agent Wallet is installed but the container is ${containerState}.`,
    };
  }

  return {
    status: "unhealthy",
    managed: true,
    walletMcpUrl,
    healthUrl,
    containerState,
    message:
      "SupeRISE Agent Wallet container is running, but the MCP health endpoint is not ready. Check `docker logs superise-agent-wallet`.",
  };
}

export async function ensureSuperiseAgentWallet(
  options: EnsureSuperiseAgentWalletOptions = {},
  dependencies: {
    fetchImpl?: typeof fetch;
    executor?: WalletInstallExecutor;
  } = {},
): Promise<EnsureSuperiseAgentWalletResult> {
  const inspection = await inspectSuperiseAgentWallet(options, dependencies);
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_CONFIG.requestTimeoutMs;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const maxWaitMs = options.maxWaitMs ?? 20_000;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const executor = dependencies.executor ?? runCommand;

  if (inspection.status === "unsupported") {
    return {
      action: "skipped",
      managed: inspection.managed,
      walletMcpUrl: inspection.walletMcpUrl,
      healthUrl: inspection.healthUrl,
      containerName: SUPERISE_AGENT_WALLET_CONTAINER_NAME,
      volumeName: SUPERISE_AGENT_WALLET_VOLUME_NAME,
      image: SUPERISE_AGENT_WALLET_IMAGE,
      message: inspection.message,
      initialOwnerPassword: null,
    };
  }

  if (inspection.status === "running") {
    return {
      action: "already-running",
      managed: inspection.managed,
      walletMcpUrl: inspection.walletMcpUrl,
      healthUrl: inspection.healthUrl,
      containerName: SUPERISE_AGENT_WALLET_CONTAINER_NAME,
      volumeName: SUPERISE_AGENT_WALLET_VOLUME_NAME,
      image: SUPERISE_AGENT_WALLET_IMAGE,
      message: inspection.message,
      initialOwnerPassword: null,
    };
  }

  if (inspection.status === "not-installed") {
    await ensureVolume(executor);
    await execDocker(executor, ["pull", SUPERISE_AGENT_WALLET_IMAGE]);
    await execDocker(executor, [
      "run",
      "-d",
      "--name",
      SUPERISE_AGENT_WALLET_CONTAINER_NAME,
      "--restart",
      "unless-stopped",
      "-p",
      "127.0.0.1:18799:18799",
      "-v",
      `${SUPERISE_AGENT_WALLET_VOLUME_NAME}:/app/runtime-data`,
      SUPERISE_AGENT_WALLET_IMAGE,
    ]);
    await waitForWalletHealth(
      inspection.healthUrl,
      requestTimeoutMs,
      pollIntervalMs,
      maxWaitMs,
      fetchImpl,
    );
    const initialOwnerPassword = await readInitialOwnerPassword(executor);
    return {
      action: "installed",
      managed: true,
      walletMcpUrl: inspection.walletMcpUrl,
      healthUrl: inspection.healthUrl,
      containerName: SUPERISE_AGENT_WALLET_CONTAINER_NAME,
      volumeName: SUPERISE_AGENT_WALLET_VOLUME_NAME,
      image: SUPERISE_AGENT_WALLET_IMAGE,
      message: "Installed and started SupeRISE Agent Wallet via Docker.",
      initialOwnerPassword,
    };
  }

  if (inspection.status === "stopped") {
    await execDocker(executor, ["start", SUPERISE_AGENT_WALLET_CONTAINER_NAME]);
    await waitForWalletHealth(
      inspection.healthUrl,
      requestTimeoutMs,
      pollIntervalMs,
      maxWaitMs,
      fetchImpl,
    );
    return {
      action: "started-existing",
      managed: true,
      walletMcpUrl: inspection.walletMcpUrl,
      healthUrl: inspection.healthUrl,
      containerName: SUPERISE_AGENT_WALLET_CONTAINER_NAME,
      volumeName: SUPERISE_AGENT_WALLET_VOLUME_NAME,
      image: SUPERISE_AGENT_WALLET_IMAGE,
      message: "Started the existing SupeRISE Agent Wallet container.",
      initialOwnerPassword: null,
    };
  }

  throw new Error(inspection.message);
}

async function getContainerState(executor: WalletInstallExecutor): Promise<string | null> {
  const result = await execDocker(executor, [
    "ps",
    "-a",
    "--filter",
    `name=^/${SUPERISE_AGENT_WALLET_CONTAINER_NAME}$`,
    "--format",
    "{{.Names}}\t{{.State}}",
  ]);
  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const firstLine = lines[0];
  if (!firstLine) {
    return null;
  }

  const parts = firstLine.split(/\s+/);
  return parts[1] ?? null;
}

async function ensureVolume(executor: WalletInstallExecutor): Promise<void> {
  const result = await execDocker(executor, [
    "volume",
    "ls",
    "--format",
    "{{.Name}}",
    "--filter",
    `name=^${SUPERISE_AGENT_WALLET_VOLUME_NAME}$`,
  ]);
  const exists = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === SUPERISE_AGENT_WALLET_VOLUME_NAME);

  if (!exists) {
    await execDocker(executor, ["volume", "create", SUPERISE_AGENT_WALLET_VOLUME_NAME]);
  }
}

async function waitForWalletHealth(
  healthUrl: string,
  requestTimeoutMs: number,
  pollIntervalMs: number,
  maxWaitMs: number,
  fetchImpl: typeof fetch,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() <= deadline) {
    if (await isWalletHealthy(healthUrl, requestTimeoutMs, fetchImpl)) {
      return;
    }

    await delay(pollIntervalMs);
  }

  throw new Error(
    `SupeRISE Agent Wallet did not become healthy at ${healthUrl}. Check \`docker logs ${SUPERISE_AGENT_WALLET_CONTAINER_NAME}\` for details.`,
  );
}

async function isWalletHealthy(
  healthUrl: string,
  requestTimeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetchImpl(healthUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function execDocker(
  executor: WalletInstallExecutor,
  args: string[],
): Promise<WalletInstallCommandResult> {
  try {
    return await executor("docker", args);
  } catch (error) {
    throw new Error(
      `Unable to manage SupeRISE Agent Wallet with Docker. Install and start it manually, or skip the wallet setup step. Root cause: ${toErrorMessage(error)}`,
    );
  }
}

async function readInitialOwnerPassword(
  executor: WalletInstallExecutor,
): Promise<string | null> {
  const fromLogs = await readInitialOwnerPasswordFromLogs(executor);
  if (fromLogs) {
    return fromLogs;
  }

  return readInitialOwnerPasswordFromNoticeFile(executor);
}

async function readInitialOwnerPasswordFromLogs(
  executor: WalletInstallExecutor,
): Promise<string | null> {
  try {
    const result = await executor("docker", ["logs", SUPERISE_AGENT_WALLET_CONTAINER_NAME]);
    return extractInitialOwnerPassword(`${result.stdout}\n${result.stderr}`);
  } catch {
    return null;
  }
}

async function readInitialOwnerPasswordFromNoticeFile(
  executor: WalletInstallExecutor,
): Promise<string | null> {
  try {
    const result = await executor("docker", [
      "exec",
      SUPERISE_AGENT_WALLET_CONTAINER_NAME,
      "cat",
      SUPERISE_AGENT_WALLET_OWNER_NOTICE_PATH,
    ]);
    return extractPasswordFromNoticeFile(result.stdout);
  } catch {
    return null;
  }
}

function extractInitialOwnerPassword(logOutput: string): string | null {
  for (const rawLine of logOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    const index = line.indexOf(INITIAL_OWNER_PASSWORD_PREFIX);
    if (index < 0) {
      continue;
    }

    const value = line.slice(index + INITIAL_OWNER_PASSWORD_PREFIX.length).trim();
    if (value.length > 0) {
      return value;
    }
  }

  return null;
}

function extractPasswordFromNoticeFile(contents: string): string | null {
  const lines = contents.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() !== "Login password:") {
      continue;
    }

    const password = lines[index + 1]?.trim() ?? "";
    return password.length > 0 ? password : null;
  }

  return null;
}

async function runCommand(
  command: string,
  args: string[],
): Promise<WalletInstallCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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

function normalizePathname(pathname: string): string {
  if (pathname.length === 0) {
    return "/";
  }
  return pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

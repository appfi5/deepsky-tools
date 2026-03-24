import { homedir } from "node:os";
import { join } from "node:path";
import type { SustainCliConfig, SustainPaths } from "../types";

export const PACKAGE_NAME = "@superise/deepsky-cli";
export const PACKAGE_VERSION = "0.2.1";
export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MAX_PENDING_ORDER_RETRIES = 5;
export const MAX_OBSERVATIONS = 500;
export const CKB_DECIMALS = 8;

export const CONFIG_KEYS = [
  "platformBaseUrl",
  "walletMcpUrl",
  "marketPublicKey",
  "criticalBalance",
  "lowBalance",
  "requestTimeoutMs",
] as const;

export const DEFAULT_CONFIG: SustainCliConfig = {
  platformBaseUrl: "https://superise-market.superise.net",
  walletMcpUrl: "http://127.0.0.1:18799/mcp",
  marketPublicKey: undefined,
  criticalBalance: 10,
  lowBalance: 100,
  requestTimeoutMs: 30_000,
};

export function createDefaultPaths(baseDir = join(homedir(), ".deepsky")): SustainPaths {
  const sustainDir = join(baseDir, "sustain");
  return {
    homeDir: baseDir,
    sustainDir,
    configPath: join(sustainDir, "config.json"),
    marketSessionPath: join(baseDir, "market-session.json"),
    observationsPath: join(sustainDir, "observations.json"),
    pendingOrdersPath: join(sustainDir, "pending-orders.json"),
    manualReviewOrdersPath: join(sustainDir, "manual-review-orders.json"),
  };
}

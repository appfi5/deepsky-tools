import { DEFAULT_CONFIG } from "./defaults";
import { CONFIG_KEYS, createDefaultPaths } from "../../utils/constants";
import { readJsonFile, removeFileIfExists, writeJsonFile } from "../../storage/json-store";
import { parseNonNegativeNumber, parsePositiveInteger } from "../../utils/validator";
import type { SustainCliConfig, SustainPaths } from "./types";

export type SustainConfigKey = (typeof CONFIG_KEYS)[number];

export class SustainConfigStore {
  constructor(
    readonly paths: SustainPaths = createDefaultPaths(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  load(): SustainCliConfig {
    return normalizeConfig({
      ...DEFAULT_CONFIG,
      ...this.loadEnvOverrides(),
      ...this.loadFileOverrides(),
    });
  }

  get<K extends SustainConfigKey>(key: K): SustainCliConfig[K] {
    return this.load()[key];
  }

  set(key: SustainConfigKey, rawValue: string): SustainCliConfig {
    const currentOverrides = this.loadFileOverrides();
    const previous = this.load();
    const nextOverrides = {
      ...currentOverrides,
      [key]: parseConfigValue(key, rawValue),
    };
    const next = normalizeConfig({
      ...DEFAULT_CONFIG,
      ...this.loadEnvOverrides(),
      ...nextOverrides,
    });

    writeJsonFile(this.paths.configPath, serializeConfigOverrides(nextOverrides));
    this.clearSessionIfNeeded(previous, next);
    return next;
  }

  unset(key: SustainConfigKey): SustainCliConfig {
    const currentOverrides = this.loadFileOverrides();
    const previous = this.load();
    delete currentOverrides[key];

    if (Object.keys(currentOverrides).length === 0) {
      removeFileIfExists(this.paths.configPath);
    } else {
      writeJsonFile(this.paths.configPath, serializeConfigOverrides(currentOverrides));
    }

    const next = this.load();
    this.clearSessionIfNeeded(previous, next);
    return next;
  }

  reset(): SustainCliConfig {
    const previous = this.load();
    removeFileIfExists(this.paths.configPath);
    const next = this.load();
    this.clearSessionIfNeeded(previous, next, true);
    return next;
  }

  describe(): string {
    const config = this.load();
    return [
      "Sustain CLI Configuration",
      "",
      `platformBaseUrl: ${config.platformBaseUrl}`,
      `walletMcpUrl: ${config.walletMcpUrl}`,
      `marketPublicKey: ${config.marketPublicKey ?? "(unset)"}`,
      `criticalBalance: ${config.criticalBalance}`,
      `lowBalance: ${config.lowBalance}`,
      `requestTimeoutMs: ${config.requestTimeoutMs}`,
      "",
      `configPath: ${this.paths.configPath}`,
    ].join("\n");
  }

  private loadEnvOverrides(): Partial<SustainCliConfig> {
    const overrides: Partial<SustainCliConfig> = {};

    if (this.env.DEEPSKY_MARKET_BASE_URL) {
      overrides.platformBaseUrl = this.env.DEEPSKY_MARKET_BASE_URL;
    }
    if (this.env.DEEPSKY_WALLET_MCP_URL) {
      overrides.walletMcpUrl = this.env.DEEPSKY_WALLET_MCP_URL;
    }
    if (this.env.DEEPSKY_MARKET_PUBLIC_KEY) {
      overrides.marketPublicKey = this.env.DEEPSKY_MARKET_PUBLIC_KEY;
    }
    if (this.env.SUSTAIN_CRITICAL_BALANCE) {
      overrides.criticalBalance = parseNonNegativeNumber(
        this.env.SUSTAIN_CRITICAL_BALANCE,
        "SUSTAIN_CRITICAL_BALANCE",
      );
    }
    if (this.env.SUSTAIN_LOW_BALANCE) {
      overrides.lowBalance = parseNonNegativeNumber(
        this.env.SUSTAIN_LOW_BALANCE,
        "SUSTAIN_LOW_BALANCE",
      );
    }
    if (this.env.SUSTAIN_REQUEST_TIMEOUT_MS) {
      overrides.requestTimeoutMs = parsePositiveInteger(
        this.env.SUSTAIN_REQUEST_TIMEOUT_MS,
        "SUSTAIN_REQUEST_TIMEOUT_MS",
      );
    }

    return overrides;
  }

  private loadFileOverrides(): Partial<SustainCliConfig> {
    return sanitizeConfigOverrides(
      readJsonFile<Record<string, unknown>>(this.paths.configPath, {}),
    );
  }

  private clearSessionIfNeeded(
    previous: SustainCliConfig,
    next: SustainCliConfig,
    force = false,
  ): void {
    if (
      force ||
      previous.platformBaseUrl !== next.platformBaseUrl ||
      previous.walletMcpUrl !== next.walletMcpUrl ||
      previous.marketPublicKey !== next.marketPublicKey
    ) {
      removeFileIfExists(this.paths.marketSessionPath);
    }
  }
}

function normalizeConfig(input: Partial<SustainCliConfig>): SustainCliConfig {
  const platformBaseUrl = readString(input.platformBaseUrl, "platformBaseUrl");
  const walletMcpUrl = readString(input.walletMcpUrl, "walletMcpUrl");
  const criticalBalance = parseNonNegativeNumber(
    input.criticalBalance ?? DEFAULT_CONFIG.criticalBalance,
    "criticalBalance",
  );
  const lowBalance = parseNonNegativeNumber(
    input.lowBalance ?? DEFAULT_CONFIG.lowBalance,
    "lowBalance",
  );
  const requestTimeoutMs = parsePositiveInteger(
    input.requestTimeoutMs ?? DEFAULT_CONFIG.requestTimeoutMs,
    "requestTimeoutMs",
  );

  if (criticalBalance > lowBalance) {
    throw new Error("criticalBalance must be less than or equal to lowBalance");
  }

  return {
    platformBaseUrl,
    walletMcpUrl,
    marketPublicKey: normalizeOptionalString(input.marketPublicKey),
    criticalBalance,
    lowBalance,
    requestTimeoutMs,
  };
}

function parseConfigValue(key: SustainConfigKey, rawValue: string): string | number | undefined {
  switch (key) {
    case "platformBaseUrl":
    case "walletMcpUrl":
      return readString(rawValue, key);
    case "marketPublicKey":
      return normalizeOptionalString(rawValue);
    case "requestTimeoutMs":
      return parsePositiveInteger(rawValue, key);
    case "criticalBalance":
    case "lowBalance":
      return parseNonNegativeNumber(rawValue, key);
    default:
      throw new Error(`Unsupported config key: ${String(key)}`);
  }
}

function serializeConfigOverrides(overrides: Partial<SustainCliConfig>): Partial<SustainCliConfig> {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as Partial<SustainCliConfig>;
}

function sanitizeConfigOverrides(overrides: Record<string, unknown>): Partial<SustainCliConfig> {
  return Object.fromEntries(
    Object.entries(overrides).filter(([key]) =>
      (CONFIG_KEYS as readonly string[]).includes(key),
    ),
  ) as Partial<SustainCliConfig>;
}

function readString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.toLowerCase() === "null" ||
    normalized.toLowerCase() === "undefined"
  ) {
    return undefined;
  }

  return normalized;
}

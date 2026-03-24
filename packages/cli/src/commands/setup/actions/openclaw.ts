import { randomBytes } from "node:crypto";
import {
  cancel as cancelPrompt,
  intro,
  isCancel,
  confirm as confirmPrompt,
  outro,
  select,
  spinner as createSpinner,
  text,
} from "@clack/prompts";
import { createDefaultSustainContext } from "../../../core/sustain/engine";
import {
  configureDeepskyOpenClaw,
  createOpenClawModelRef,
} from "../../../services/openclaw-config";
import {
  DEFAULT_SETUP_SKILL_INSTALL_LABEL,
  DEFAULT_SETUP_SKILL_REPOSITORY_URLS,
  installSkillsFromRepositories,
} from "../../../services/skill-installer";
import {
  ensureSuperiseAgentWallet,
  inspectSuperiseAgentWallet,
} from "../../../services/wallet-installer";
import { printJson } from "../../sustain/helpers";
import { toErrorMessage } from "../../../utils/errors";

const DEFAULT_LOWEST_PRICE = 1;
const DEFAULT_HIGHEST_PRICE = 20_000;

type WalletSetupResult =
  | {
      success: true;
      action: "already-running" | "started-existing" | "installed";
      message: string;
      walletMcpUrl: string;
      initialOwnerPassword: string | null;
    }
  | {
      success: false;
      error: string;
      walletMcpUrl: string;
    }
  | {
      success: null;
      skipped: true;
      message: string;
      walletMcpUrl: string;
    };

export async function setupOpenClawAction(
  options: {
    apiKey?: string;
    defaults?: boolean;
    json?: boolean;
    skipSkillInstall?: boolean;
    skipWalletInstall?: boolean;
    skillRepo?: string;
  } = {},
): Promise<void> {
  const interactive =
    !options.defaults && !options.json && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const progress = createSetupProgressLogger(options.defaults === true && !options.json);

  try {
    if (interactive) {
      intro("Configure OpenClaw for Deepsky");
    }

    progress("Starting OpenClaw setup with default values...");

    const context = createDefaultSustainContext();
    const config = context.configStore.load();
    let walletInstall = options.skipWalletInstall
      ? createSkippedWalletResult(config.walletMcpUrl, "Skipped by --skip-wallet-install.")
      : await ensureWalletPrerequisite({
          interactive,
          walletMcpUrl: config.walletMcpUrl,
          requestTimeoutMs: config.requestTimeoutMs,
          options,
        });

    if (walletInstall.success === false) {
      const walletError = `Wallet setup failed before OpenClaw configuration. ${walletInstall.error}`;
      if (options.json) {
        printJson({
          success: false,
          error: walletError,
          walletInstall,
        });
        process.exitCode = 1;
        return;
      }

      throw new Error(walletError);
    }

    if (!options.json) {
      printWalletSetupStatus(walletInstall);
    }

    const providedApiKey =
      options.apiKey?.trim() || process.env.DEEPSKY_OPENCLAW_API_KEY?.trim() || "";

    progress("Fetching available Deepsky models...");
    const models = await context.marketClient.fetchModels();

    if (models.length === 0) {
      throw new Error("No Deepsky models were returned by the platform.");
    }

    let apiKeyId: string | null = null;
    let apiKeyValue = providedApiKey;
    let apiKeySource: "provided" | "created" = providedApiKey ? "provided" : "created";
    let alias: string | null = null;
    let inputPriceRange: { low: number; high: number } | null = null;
    let outputPriceRange: { low: number; high: number } | null = null;

    if (!apiKeyValue) {
      progress("Using default API key alias and price ranges.");
      const defaultAlias = createDefaultApiKeyAlias();
      alias = interactive
        ? await promptTextValue("API key alias", defaultAlias)
        : defaultAlias;

      inputPriceRange = interactive
        ? await promptParsedValue(
            "Input price range (min-max)",
            `${DEFAULT_LOWEST_PRICE}-${DEFAULT_HIGHEST_PRICE}`,
            parsePriceRange,
          )
        : parsePriceRange(`${DEFAULT_LOWEST_PRICE}-${DEFAULT_HIGHEST_PRICE}`);
      outputPriceRange = interactive
        ? await promptParsedValue(
            "Output price range (min-max)",
            `${DEFAULT_LOWEST_PRICE}-${DEFAULT_HIGHEST_PRICE}`,
            parsePriceRange,
          )
        : parsePriceRange(`${DEFAULT_LOWEST_PRICE}-${DEFAULT_HIGHEST_PRICE}`);

      progress("Checking existing Deepsky market login...");
      await context.authService.ensureToken();

      progress("Creating a Deepsky model API key...");
      apiKeyId = await context.marketClient.createModelApiKey(alias);
      await context.marketClient.setModelApiKeyPriceRange({
        id: apiKeyId,
        lowestInputPrice: inputPriceRange.low,
        highestInputPrice: inputPriceRange.high,
        lowestOutputPrice: outputPriceRange.low,
        highestOutputPrice: outputPriceRange.high,
      });
      const apiKey = await context.marketClient.getModelApiKey(apiKeyId);
      apiKeyValue = apiKey.apiKey;
    } else {
      progress("Using the provided Deepsky API key.");
    }

    const shouldSwitchModel = interactive
      ? await promptConfirmValue(
          "Switch OpenClaw primary model to a Deepsky model now",
          false,
        )
      : false;

    let selectedModelId: string | undefined;
    if (shouldSwitchModel) {
      selectedModelId = interactive
        ? await promptSelectModel(models)
        : models[0]?.shortName;
    }

    progress("Writing the OpenClaw Deepsky provider configuration...");
    const configResult = configureDeepskyOpenClaw({
      apiKey: apiKeyValue,
      models: models.map((model) => ({
        id: model.shortName,
        name: model.displayName,
      })),
      selectedModelId,
    });
    const manualModelSwitchMessage = options.defaults
      ? "Primary model was left unchanged. Switch the OpenClaw primary model to a Deepsky model manually."
      : null;

    let skillInstall:
      | {
          success: true;
          label: string;
          repositoryUrls: string[];
          skillName: string;
          commands: string[];
        }
      | {
          success: false;
          error: string;
          label: string;
          repositoryUrls: string[];
          skillName: string | null;
        }
      | {
          success: null;
          skipped: true;
        };

    const shouldInstallSkill = !options.skipSkillInstall;
    const skillInstallSpinner =
      interactive && shouldInstallSkill ? createSpinner() : null;

    if (!shouldInstallSkill) {
      skillInstall = {
        success: null,
        skipped: true,
      };
    } else {
      const skillRepositoryUrls = normalizeSkillRepositoryUrls(options.skillRepo);
      try {
        progress(`${DEFAULT_SETUP_SKILL_INSTALL_LABEL}...`);
        skillInstallSpinner?.start(DEFAULT_SETUP_SKILL_INSTALL_LABEL);
        const installedSkill = await installSkillsFromRepositories({
          repositoryUrls: skillRepositoryUrls,
        });
        skillInstallSpinner?.stop(DEFAULT_SETUP_SKILL_INSTALL_LABEL);
        skillInstall = {
          success: true,
          label: installedSkill.label,
          repositoryUrls: installedSkill.repositoryUrls,
          skillName: installedSkill.skillName,
          commands: installedSkill.commands,
        };
      } catch (error) {
        skillInstallSpinner?.error(`${DEFAULT_SETUP_SKILL_INSTALL_LABEL} failed`);
        skillInstall = {
          success: false,
          error: toErrorMessage(error),
          label: DEFAULT_SETUP_SKILL_INSTALL_LABEL,
          repositoryUrls: skillRepositoryUrls,
          skillName: "all skills",
        };
      }
    }

    const result = {
      success: true,
      alias,
      apiKeyId,
      apiKeySource,
      modelCount: configResult.modelCount,
      configPath: configResult.configPath,
      switchedModel: configResult.selectedModelRef ?? null,
      selectedModelId: selectedModelId ?? null,
      manualModelSwitchRequired: manualModelSwitchMessage !== null,
      manualModelSwitchMessage,
      walletInstall,
      inputPriceRange: inputPriceRange
        ? {
            low: inputPriceRange.low,
            high: inputPriceRange.high,
          }
        : null,
      outputPriceRange: outputPriceRange
        ? {
            low: outputPriceRange.low,
            high: outputPriceRange.high,
          }
        : null,
      skillInstall,
    };

    if (options.json) {
      printJson(result);
      return;
    }

    if (interactive) {
      outro("OpenClaw Deepsky provider configured.");
    }

    if (!interactive) {
      console.log("OpenClaw Deepsky provider configured.");
    }
    console.log(`Config Path: ${configResult.configPath}`);
    console.log(`Imported Models: ${configResult.modelCount}`);
    if (configResult.selectedModelRef) {
      console.log(`Primary Model: ${configResult.selectedModelRef}`);
    } else {
      console.log("Primary Model: unchanged");
    }
    if (manualModelSwitchMessage) {
      console.log(`Manual Model Switch: ${manualModelSwitchMessage}`);
    }
    console.log(`API Key Source: ${apiKeySource}`);
    if (alias) {
      console.log(`API Key Alias: ${alias}`);
    }
    if (apiKeyId) {
      console.log(`API Key ID: ${apiKeyId}`);
    }
    if (inputPriceRange) {
      console.log(`Input Price Range: ${inputPriceRange.low}-${inputPriceRange.high}`);
    }
    if (outputPriceRange) {
      console.log(`Output Price Range: ${outputPriceRange.low}-${outputPriceRange.high}`);
    }
    if (skillInstall.success === true) {
      console.log(
        `${skillInstall.label}: ${skillInstall.repositoryUrls.join(", ")} (global copy)`,
      );
    } else if (skillInstall.success === null) {
      console.log(`${DEFAULT_SETUP_SKILL_INSTALL_LABEL}: skipped`);
    } else {
      console.error(`${skillInstall.label} failed: ${skillInstall.error}`);
    }
  } catch (error) {
    if (options.json) {
      printJson({
        success: false,
        error: toErrorMessage(error),
      });
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

function createDefaultApiKeyAlias(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  const bytes = randomBytes(5);

  for (const value of bytes) {
    suffix += alphabet[value % alphabet.length];
  }

  return `openclaw-${suffix}`;
}

function createSkippedWalletResult(walletMcpUrl: string, message: string): WalletSetupResult {
  return {
    success: null,
    skipped: true,
    message,
    walletMcpUrl,
  };
}

function printWalletSetupStatus(walletInstall: Exclude<WalletSetupResult, { success: false }>): void {
  if (walletInstall.success === true) {
    console.log(`Wallet Ready: ${walletInstall.message}`);
    if (walletInstall.action === "installed") {
      if (walletInstall.initialOwnerPassword) {
        console.log(`Wallet Initial Password: ${walletInstall.initialOwnerPassword}`);
        console.log(
          "Wallet Password Rotation: change the initial Owner password immediately after the first login.",
        );
      } else {
        console.log(
          "Wallet Initial Password: unavailable; check the wallet startup logs or owner notice file if this was a reused runtime volume.",
        );
      }
    }
    return;
  }

  console.log(`Wallet Ready: ${walletInstall.message}`);
}

async function ensureWalletPrerequisite(input: {
  interactive: boolean;
  walletMcpUrl: string;
  requestTimeoutMs: number;
  options: {
    defaults?: boolean;
    json?: boolean;
  };
}): Promise<WalletSetupResult> {
  if (input.options.defaults && !input.options.json) {
    console.log("[setup] Preparing SupeRISE Agent Wallet...");
  }

  return ensureWalletSetupForOpenClaw({
    interactive: input.interactive,
    walletMcpUrl: input.walletMcpUrl,
    requestTimeoutMs: input.requestTimeoutMs,
  });
}

function createSetupProgressLogger(enabled: boolean): (message: string) => void {
  if (!enabled) {
    return () => undefined;
  }

  return (message: string) => {
    console.log(`[setup] ${message}`);
  };
}

async function ensureWalletSetupForOpenClaw(input: {
  interactive: boolean;
  walletMcpUrl: string;
  requestTimeoutMs: number;
}): Promise<WalletSetupResult> {
  try {
    const inspection = await inspectSuperiseAgentWallet({
      walletMcpUrl: input.walletMcpUrl,
      requestTimeoutMs: input.requestTimeoutMs,
    });

    if (inspection.status === "unsupported") {
      const healthCheck = await checkWalletHealthForSetup({
        walletMcpUrl: inspection.walletMcpUrl,
        requestTimeoutMs: input.requestTimeoutMs,
      });

      if (healthCheck.healthy) {
        return {
          success: true,
          action: "already-running",
          message:
            "Configured wallet MCP endpoint is reachable. Automatic wallet install/start was skipped because the URL is not the default local SupeRISE Agent Wallet endpoint.",
          walletMcpUrl: inspection.walletMcpUrl,
          initialOwnerPassword: null,
        };
      }

      return {
        success: false,
        error: healthCheck.message,
        walletMcpUrl: inspection.walletMcpUrl,
      };
    }

    if (inspection.status === "running") {
      return {
        success: true,
        action: "already-running",
        message: inspection.message,
        walletMcpUrl: inspection.walletMcpUrl,
        initialOwnerPassword: null,
      };
    }

    if (inspection.status === "unhealthy") {
      return {
        success: false,
        error: inspection.message,
        walletMcpUrl: inspection.walletMcpUrl,
      };
    }

    const spinnerMessage = inspection.status === "not-installed"
      ? "Installing SupeRISE Agent Wallet..."
      : "Starting SupeRISE Agent Wallet...";

    const walletSpinner = input.interactive ? createSpinner() : null;
    try {
      walletSpinner?.start(spinnerMessage);
      const ensuredWallet = await ensureSuperiseAgentWallet({
        walletMcpUrl: input.walletMcpUrl,
        requestTimeoutMs: input.requestTimeoutMs,
      });
      walletSpinner?.stop(ensuredWallet.message);
      if (ensuredWallet.action === "skipped") {
        return createSkippedWalletResult(ensuredWallet.walletMcpUrl, ensuredWallet.message);
      }
      return {
        success: true,
        action: ensuredWallet.action,
        message: ensuredWallet.message,
        walletMcpUrl: ensuredWallet.walletMcpUrl,
        initialOwnerPassword: ensuredWallet.initialOwnerPassword,
      };
    } catch (error) {
      walletSpinner?.error("Failed to prepare SupeRISE Agent Wallet");
      return {
        success: false,
        error: toErrorMessage(error),
        walletMcpUrl: input.walletMcpUrl,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error),
      walletMcpUrl: input.walletMcpUrl,
    };
  }
}

async function checkWalletHealthForSetup(input: {
  walletMcpUrl: string;
  requestTimeoutMs: number;
}): Promise<{
  healthy: boolean;
  healthUrl: string | null;
  message: string;
}> {
  const healthUrl = getWalletHealthUrl(input.walletMcpUrl);
  if (!healthUrl) {
    return {
      healthy: false,
      healthUrl: null,
      message:
        `Configured wallet MCP URL \`${input.walletMcpUrl}\` is invalid, and automatic wallet setup is only supported for the default local SupeRISE Agent Wallet endpoint.`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.requestTimeoutMs);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        healthy: true,
        healthUrl,
        message: `Wallet health check succeeded at ${healthUrl}.`,
      };
    }

    return {
      healthy: false,
      healthUrl,
      message:
        `Configured wallet MCP URL is not the default local SupeRISE Agent Wallet endpoint, and the wallet health check at ${healthUrl} returned HTTP ${response.status}. Start the wallet manually or update DEEPSKY_WALLET_MCP_URL before rerunning setup.`,
    };
  } catch (error) {
    return {
      healthy: false,
      healthUrl,
      message:
        `Configured wallet MCP URL is not the default local SupeRISE Agent Wallet endpoint, and the wallet health check at ${healthUrl} failed. Start the wallet manually or update DEEPSKY_WALLET_MCP_URL before rerunning setup. Root cause: ${toErrorMessage(error)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getWalletHealthUrl(walletMcpUrl: string): string | null {
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

function normalizeSkillRepositoryUrls(extraRepositoryUrl?: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const repositoryUrl of [...DEFAULT_SETUP_SKILL_REPOSITORY_URLS, extraRepositoryUrl ?? ""]) {
    const normalized = repositoryUrl.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function parsePriceRange(input: string): { low: number; high: number } {
  const normalized = input.trim();
  const match = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(normalized);
  if (!match) {
    throw new Error("Price range must use the format `<min>-<max>`, for example `1-20000`.");
  }

  const low = Number(match[1]);
  const high = Number(match[2]);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) {
    throw new Error("Price range values must be positive numbers.");
  }
  if (low > high) {
    throw new Error("Price range minimum must be less than or equal to the maximum.");
  }

  return { low, high };
}

async function promptTextValue(message: string, defaultValue: string): Promise<string> {
  const result = await text({
    message: `${message} (default: ${defaultValue})`,
    placeholder: defaultValue,
    defaultValue,
    validate(value = "") {
      if ((value.trim() || defaultValue).trim().length === 0) {
        return "A value is required.";
      }
    },
  });

  const value = unwrapPromptResult(result);
  return value.trim() || defaultValue;
}

async function promptParsedValue<T>(
  message: string,
  defaultValue: string,
  parser: (value: string) => T,
): Promise<T> {
  const result = await text({
    message: `${message} (default: ${defaultValue})`,
    placeholder: defaultValue,
    defaultValue,
    validate(value = "") {
      try {
        parser(value.trim() || defaultValue);
      } catch (error) {
        return toErrorMessage(error);
      }
    },
  });

  const value = unwrapPromptResult(result);
  return parser(value.trim() || defaultValue);
}

async function promptConfirmValue(
  message: string,
  defaultValue: boolean,
): Promise<boolean> {
  const result = await confirmPrompt({
    message: `${message} (default: ${defaultValue ? "Yes" : "No"})`,
    initialValue: defaultValue,
  });

  return unwrapPromptResult(result);
}

async function promptSelectModel(
  models: Array<{
    shortName: string;
    displayName: string;
    avgPrice: number;
  }>,
): Promise<string> {
  const result = await select({
    message: "Choose a Deepsky model to set as OpenClaw primary",
    initialValue: models[0]?.shortName,
    options: models.map((model) => ({
      value: model.shortName,
      label: model.displayName,
      hint: `${createOpenClawModelRef(model.shortName)} avg=${model.avgPrice}`,
    })),
  });

  return unwrapPromptResult(result);
}

function unwrapPromptResult<T>(value: T | symbol): T {
  if (isCancel(value)) {
    const message = "Setup cancelled.";
    cancelPrompt(message);
    throw new Error(message);
  }

  return value;
}

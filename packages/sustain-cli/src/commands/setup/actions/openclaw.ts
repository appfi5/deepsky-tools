import { randomBytes } from "node:crypto";
import {
  cancel as cancelPrompt,
  confirm as confirmPrompt,
  intro,
  isCancel,
  outro,
  select,
  text,
} from "@clack/prompts";
import { createDefaultSustainContext } from "../../../core/sustain/engine";
import {
  configureDeepskyOpenClaw,
  createOpenClawModelRef,
} from "../../../services/openclaw-config";
import { printJson } from "../../sustain/helpers";
import { toErrorMessage } from "../../../utils/errors";

const DEFAULT_LOWEST_PRICE = 1;
const DEFAULT_HIGHEST_PRICE = 20_000;

export async function setupOpenClawAction(
  options: { json?: boolean } = {},
): Promise<void> {
  const interactive = !options.json && Boolean(process.stdin.isTTY && process.stdout.isTTY);

  try {
    if (interactive) {
      intro("Configure OpenClaw for Deepsky");
    }

    const context = createDefaultSustainContext();
    await context.authService.ensureToken();
    const models = await context.marketClient.fetchModels();

    if (models.length === 0) {
      throw new Error("No Deepsky models were returned by the platform.");
    }

    const defaultAlias = createDefaultApiKeyAlias();
    const alias = interactive
      ? await promptTextValue("API key alias", defaultAlias)
      : defaultAlias;

    const inputPriceRange = interactive
      ? await promptParsedValue(
          "Input price range (min-max)",
          `${DEFAULT_LOWEST_PRICE}-${DEFAULT_HIGHEST_PRICE}`,
          parsePriceRange,
        )
      : parsePriceRange(`${DEFAULT_LOWEST_PRICE}-${DEFAULT_HIGHEST_PRICE}`);
    const outputPriceRange = interactive
      ? await promptParsedValue(
          "Output price range (min-max)",
          `${DEFAULT_LOWEST_PRICE}-${DEFAULT_HIGHEST_PRICE}`,
          parsePriceRange,
        )
      : parsePriceRange(`${DEFAULT_LOWEST_PRICE}-${DEFAULT_HIGHEST_PRICE}`);

    const apiKeyId = await context.marketClient.createModelApiKey(alias);
    await context.marketClient.setModelApiKeyPriceRange({
      id: apiKeyId,
      lowestInputPrice: inputPriceRange.low,
      highestInputPrice: inputPriceRange.high,
      lowestOutputPrice: outputPriceRange.low,
      highestOutputPrice: outputPriceRange.high,
    });
    const apiKey = await context.marketClient.getModelApiKey(apiKeyId);

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

    const configResult = configureDeepskyOpenClaw({
      apiKey: apiKey.apiKey,
      models: models.map((model) => ({
        id: model.shortName,
        name: model.displayName,
      })),
      selectedModelId,
    });

    const result = {
      success: true,
      alias,
      apiKeyId,
      modelCount: configResult.modelCount,
      configPath: configResult.configPath,
      switchedModel: configResult.selectedModelRef ?? null,
      selectedModelId: selectedModelId ?? null,
      inputPriceRange: {
        low: inputPriceRange.low,
        high: inputPriceRange.high,
      },
      outputPriceRange: {
        low: outputPriceRange.low,
        high: outputPriceRange.high,
      },
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
    console.log(`API Key Alias: ${alias}`);
    console.log(`API Key ID: ${apiKeyId}`);
    console.log(`Input Price Range: ${inputPriceRange.low}-${inputPriceRange.high}`);
    console.log(`Output Price Range: ${outputPriceRange.low}-${outputPriceRange.high}`);
    console.log(`Config Path: ${configResult.configPath}`);
    console.log(`Imported Models: ${configResult.modelCount}`);
    if (configResult.selectedModelRef) {
      console.log(`Primary Model: ${configResult.selectedModelRef}`);
    } else {
      console.log("Primary Model: unchanged");
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

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import JSON5 from "json5";
import { ensureParentDir, isRecord } from "../storage/json-store";

export const OPENCLAW_PROVIDER_ID = "deepsky";
export const OPENCLAW_PROVIDER_API = "openai-completions";
export const DEFAULT_OPENCLAW_BASE_URL = "https://superise-market.superise.net/v1";
export const DEFAULT_OPENCLAW_CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");

export type OpenClawProviderModel = {
  id: string;
  name: string;
};

export type UpdateDeepskyProviderConfigInput = {
  apiKey: string;
  models: OpenClawProviderModel[];
  selectedModelId?: string;
  baseUrl?: string;
};

export type UpdateDeepskyProviderConfigResult = {
  configPath: string;
  modelCount: number;
  selectedModelRef?: string;
};

export function createOpenClawModelRef(modelId: string): string {
  return `${OPENCLAW_PROVIDER_ID}/${modelId}`;
}

export function readOpenClawConfig(
  configPath = DEFAULT_OPENCLAW_CONFIG_PATH,
): Record<string, unknown> {
  if (!existsSync(configPath)) {
    return {};
  }

  const raw = readFileSync(configPath, "utf8");
  if (raw.trim().length === 0) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON5.parse(raw);
  } catch (error) {
    throw new Error(`OpenClaw config is not valid JSON5: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("OpenClaw config root must be an object");
  }

  return parsed;
}

export function updateDeepskyProviderConfig(
  config: Record<string, unknown>,
  input: UpdateDeepskyProviderConfigInput,
): Record<string, unknown> {
  const modelEntries = dedupeProviderModels(input.models);
  if (modelEntries.length === 0) {
    throw new Error("At least one model is required to configure the Deepsky OpenClaw provider");
  }
  if (typeof input.apiKey !== "string" || input.apiKey.trim().length === 0) {
    throw new Error("A non-empty apiKey is required to configure the Deepsky OpenClaw provider");
  }

  const next = cloneRecord(config);
  const rootModels = ensureRecordField(next, "models", "OpenClaw config field `models`");
  const providers = ensureRecordField(
    rootModels,
    "providers",
    "OpenClaw config field `models.providers`",
  );

  providers[OPENCLAW_PROVIDER_ID] = {
    baseUrl: input.baseUrl?.trim() || DEFAULT_OPENCLAW_BASE_URL,
    apiKey: input.apiKey.trim(),
    api: OPENCLAW_PROVIDER_API,
    models: modelEntries,
  };

  const selectedModelRef = input.selectedModelId
    ? createOpenClawModelRef(input.selectedModelId)
    : undefined;

  const agents = ensureRecordField(next, "agents", "OpenClaw config field `agents`");
  const defaults = ensureRecordField(agents, "defaults", "OpenClaw config field `agents.defaults`");
  const allowlist = defaults.models;

  if (typeof allowlist !== "undefined" && !isRecord(allowlist)) {
    throw new Error("OpenClaw config field `agents.defaults.models` must be an object when present");
  }

  if (isRecord(allowlist)) {
    removeDeepskyAllowlistEntries(allowlist);
    for (const model of modelEntries) {
      allowlist[createOpenClawModelRef(model.id)] ??= {};
    }
  }

  removeDeepskyModelSelections(defaults);

  if (selectedModelRef) {
    const currentModel = defaults.model;
    if (isRecord(currentModel)) {
      currentModel.primary = selectedModelRef;
    } else if (typeof currentModel === "undefined") {
      defaults.model = {
        primary: selectedModelRef,
      };
    } else {
      defaults.model = selectedModelRef;
    }
  }

  return next;
}

export function writeOpenClawConfig(
  configPath: string,
  config: Record<string, unknown>,
): void {
  ensureParentDir(configPath);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function configureDeepskyOpenClaw(
  input: UpdateDeepskyProviderConfigInput & {
    configPath?: string;
  },
): UpdateDeepskyProviderConfigResult {
  const configPath = input.configPath ?? DEFAULT_OPENCLAW_CONFIG_PATH;
  const current = readOpenClawConfig(configPath);
  const next = updateDeepskyProviderConfig(current, input);
  writeOpenClawConfig(configPath, next);

  return {
    configPath,
    modelCount: dedupeProviderModels(input.models).length,
    selectedModelRef: input.selectedModelId
      ? createOpenClawModelRef(input.selectedModelId)
      : undefined,
  };
}

function dedupeProviderModels(models: OpenClawProviderModel[]): OpenClawProviderModel[] {
  const seen = new Set<string>();
  const result: OpenClawProviderModel[] = [];

  for (const model of models) {
    if (
      typeof model.id !== "string" ||
      model.id.trim().length === 0 ||
      typeof model.name !== "string" ||
      model.name.trim().length === 0
    ) {
      continue;
    }

    const id = model.id.trim();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push({
      id,
      name: model.name.trim(),
    });
  }

  return result;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function ensureRecordField(
  parent: Record<string, unknown>,
  key: string,
  label: string,
): Record<string, unknown> {
  const current = parent[key];
  if (typeof current === "undefined") {
    const created: Record<string, unknown> = {};
    parent[key] = created;
    return created;
  }

  if (!isRecord(current)) {
    throw new Error(`${label} must be an object`);
  }

  return current;
}

function removeDeepskyAllowlistEntries(allowlist: Record<string, unknown>): void {
  for (const key of Object.keys(allowlist)) {
    if (isDeepskyModelRef(key)) {
      delete allowlist[key];
    }
  }
}

function removeDeepskyModelSelections(defaults: Record<string, unknown>): void {
  const currentModel = defaults.model;
  if (typeof currentModel === "string") {
    if (isDeepskyModelRef(currentModel)) {
      delete defaults.model;
    }
    return;
  }

  if (!isRecord(currentModel)) {
    return;
  }

  if (typeof currentModel.primary === "string" && isDeepskyModelRef(currentModel.primary)) {
    delete currentModel.primary;
  }

  if (Array.isArray(currentModel.fallbacks)) {
    const nextFallbacks = currentModel.fallbacks.filter(
      (value) => typeof value !== "string" || !isDeepskyModelRef(value),
    );
    if (nextFallbacks.length === 0) {
      delete currentModel.fallbacks;
    } else {
      currentModel.fallbacks = nextFallbacks;
    }
  }

  if (Object.keys(currentModel).length === 0) {
    delete defaults.model;
  }
}

function isDeepskyModelRef(value: string): boolean {
  return value.startsWith(`${OPENCLAW_PROVIDER_ID}/`);
}

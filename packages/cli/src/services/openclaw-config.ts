import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import JSON5 from "json5";
import { ensureParentDir, isRecord } from "../storage/json-store";

export const OPENCLAW_PROVIDER_ID = "deepsky";
export const OPENCLAW_PROVIDER_API = "openai-completions";
export const DEFAULT_OPENCLAW_BASE_URL = "https://superise-market.superise.net/v1";
export const DEFAULT_OPENCLAW_CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");
export const DEFAULT_OPENCLAW_MODEL_API = "openai-completions";
export const DEFAULT_OPENCLAW_MODEL_REASONING = false;
export const DEFAULT_OPENCLAW_MODEL_INPUT = ["text"] as const;

export type OpenClawProviderModel = {
  id: string;
  name: string;
};

export type OpenClawConfiguredProviderModel = OpenClawProviderModel & {
  api: string;
  reasoning: boolean;
  input: string[];
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

export type CleanupDeepskyOpenClawConfigResult = {
  config: Record<string, unknown>;
  providerRemoved: boolean;
  removedModelRefs: string[];
  selectionChanged: boolean;
  changed: boolean;
};

export type CleanupDeepskyOpenClawResult = CleanupDeepskyOpenClawConfigResult & {
  configPath: string;
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
  const modelEntries = buildConfiguredProviderModels(input.models);
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
    modelCount: buildConfiguredProviderModels(input.models).length,
    selectedModelRef: input.selectedModelId
      ? createOpenClawModelRef(input.selectedModelId)
      : undefined,
  };
}

export function cleanupDeepskyOpenClawConfig(
  config: Record<string, unknown>,
): CleanupDeepskyOpenClawConfigResult {
  const next = cloneRecord(config);
  let providerRemoved = false;
  let removedModelRefs: string[] = [];
  let selectionChanged = false;

  const rootModels = isRecord(next.models) ? next.models : null;
  if (rootModels && isRecord(rootModels.providers)) {
    if (OPENCLAW_PROVIDER_ID in rootModels.providers) {
      delete rootModels.providers[OPENCLAW_PROVIDER_ID];
      providerRemoved = true;
    }
    cleanupEmptyRecord(rootModels, "providers");
  }
  if (rootModels) {
    cleanupEmptyRecord(next, "models");
  }

  const defaults = readAgentDefaults(next);
  if (defaults) {
    if (isRecord(defaults.models)) {
      removedModelRefs = removeDeepskyAllowlistEntries(defaults.models);
      cleanupEmptyRecord(defaults, "models");
    }
    selectionChanged = removeDeepskyModelSelections(defaults);
  }

  cleanupOpenClawConfigShell(next);

  return {
    config: next,
    providerRemoved,
    removedModelRefs,
    selectionChanged,
    changed:
      providerRemoved ||
      removedModelRefs.length > 0 ||
      selectionChanged,
  };
}

export function cleanupDeepskyOpenClaw(
  input: {
    configPath?: string;
  } = {},
): CleanupDeepskyOpenClawResult {
  const configPath = input.configPath ?? DEFAULT_OPENCLAW_CONFIG_PATH;
  const current = readOpenClawConfig(configPath);
  const result = cleanupDeepskyOpenClawConfig(current);

  if (result.changed) {
    writeOpenClawConfig(configPath, result.config);
  }

  return {
    ...result,
    configPath,
  };
}

function buildConfiguredProviderModels(
  models: OpenClawProviderModel[],
): OpenClawConfiguredProviderModel[] {
  const seen = new Set<string>();
  const result: OpenClawConfiguredProviderModel[] = [];

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
      api: DEFAULT_OPENCLAW_MODEL_API,
      reasoning: DEFAULT_OPENCLAW_MODEL_REASONING,
      input: [...DEFAULT_OPENCLAW_MODEL_INPUT],
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

function removeDeepskyAllowlistEntries(allowlist: Record<string, unknown>): string[] {
  const removed: string[] = [];
  for (const key of Object.keys(allowlist)) {
    if (isDeepskyModelRef(key)) {
      delete allowlist[key];
      removed.push(key);
    }
  }

  return removed;
}

function removeDeepskyModelSelections(defaults: Record<string, unknown>): boolean {
  const currentModel = defaults.model;
  if (typeof currentModel === "string") {
    if (isDeepskyModelRef(currentModel)) {
      delete defaults.model;
      return true;
    }
    return false;
  }

  if (!isRecord(currentModel)) {
    return false;
  }

  let changed = false;
  if (typeof currentModel.primary === "string" && isDeepskyModelRef(currentModel.primary)) {
    delete currentModel.primary;
    changed = true;
  }

  if (Array.isArray(currentModel.fallbacks)) {
    const nextFallbacks = currentModel.fallbacks.filter(
      (value) => typeof value !== "string" || !isDeepskyModelRef(value),
    );
    if (nextFallbacks.length === 0) {
      if (currentModel.fallbacks.length > 0) {
        delete currentModel.fallbacks;
        changed = true;
      }
    } else {
      if (nextFallbacks.length !== currentModel.fallbacks.length) {
        changed = true;
      }
      currentModel.fallbacks = nextFallbacks;
    }
  }

  if (Object.keys(currentModel).length === 0) {
    delete defaults.model;
    changed = true;
  }

  return changed;
}

function isDeepskyModelRef(value: string): boolean {
  return value.startsWith(`${OPENCLAW_PROVIDER_ID}/`);
}

function readAgentDefaults(config: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRecord(config.agents)) {
    return null;
  }

  if (!isRecord(config.agents.defaults)) {
    return null;
  }

  return config.agents.defaults;
}

function cleanupOpenClawConfigShell(config: Record<string, unknown>): void {
  if (isRecord(config.models)) {
    cleanupEmptyRecord(config.models, "providers");
    cleanupEmptyRecord(config, "models");
  }

  if (isRecord(config.agents)) {
    if (isRecord(config.agents.defaults)) {
      cleanupEmptyRecord(config.agents.defaults, "models");
      cleanupEmptyRecord(config.agents, "defaults");
    }
    cleanupEmptyRecord(config, "agents");
  }
}

function cleanupEmptyRecord(parent: Record<string, unknown>, key: string): void {
  const current = parent[key];
  if (isRecord(current) && Object.keys(current).length === 0) {
    delete parent[key];
  }
}

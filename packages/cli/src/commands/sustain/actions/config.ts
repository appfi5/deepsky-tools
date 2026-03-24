import { getSustainContext, printJson } from "../helpers";
import { CONFIG_KEYS } from "../../../utils/constants";
import type { SustainConfigKey } from "../../../core/sustain/config";

export function configShowAction(options: { json?: boolean } = {}): void {
  const context = getSustainContext();
  if (options.json) {
    printJson({
      ...context.configStore.load(),
      configPath: context.paths.configPath,
    });
    return;
  }

  console.log(context.configStore.describe());
}

export function configGetAction(key: string): void {
  assertConfigKey(key);
  const value = getSustainContext().configStore.get(key);
  if (typeof value === "undefined") {
    console.log("(unset)");
  } else {
    console.log(String(value));
  }
}

export function configSetAction(key: string, value: string): void {
  assertConfigKey(key);
  const next = getSustainContext().configStore.set(key, value);
  console.log(`${key}=${String(next[key])}`);
}

export function configUnsetAction(key: string): void {
  assertConfigKey(key);
  const next = getSustainContext().configStore.unset(key);
  const value = next[key];
  console.log(`${key}=${typeof value === "undefined" ? "(unset)" : String(value)}`);
}

export function configResetAction(): void {
  getSustainContext().configStore.reset();
  console.log("Configuration reset.");
}

function assertConfigKey(key: string): asserts key is SustainConfigKey {
  if (!(CONFIG_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unsupported config key: ${key}. Expected one of ${CONFIG_KEYS.join(", ")}`);
  }
}

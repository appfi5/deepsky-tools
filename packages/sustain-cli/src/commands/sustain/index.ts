import { Command } from "commander";
import { CONFIG_KEYS } from "../../utils/constants";
import { parseTopUpAmount } from "../../utils/validator";
import { forecastAction } from "./actions/forecast";
import { healthCheckAction } from "./actions/health-check";
import { listModelsAction } from "./actions/list-models";
import { topUpAction } from "./actions/top-up";
import { retryOrdersAction } from "./actions/retry-orders";
import { setupOpenClawAction } from "./actions/setup-openclaw";
import {
  configGetAction,
  configResetAction,
  configSetAction,
  configShowAction,
  configUnsetAction,
} from "./actions/config";
import { logoutAction } from "./actions/logout";

export function registerSustainCommands(program: Command): void {
  program
    .command("health-check")
    .description("Check current balance and health status")
    .option("--json", "Output as JSON")
    .action(healthCheckAction);

  program
    .command("forecast")
    .description("Forecast balance consumption and ETA")
    .option("--json", "Output as JSON")
    .action(forecastAction);

  program
    .command("list-models")
    .description("List available models with pricing")
    .option("--json", "Output as JSON")
    .action(listModelsAction);

  program
    .command("top-up")
    .description("Top up account balance with CKB")
    .argument(
      "<amount>",
      "Amount of CKB to top up",
      (value: string) => {
        try {
          parseTopUpAmount(value);
          return value;
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : String(error));
        }
      },
    )
    .option("--dry-run", "Simulate without executing")
    .option("--json", "Output as JSON")
    .action(topUpAction);

  program
    .command("retry-orders")
    .description("Retry pending top-up orders (transfer OK, submission failed)")
    .option("--json", "Output as JSON")
    .action(retryOrdersAction);

  const setupCommand = program.command("setup").description("Setup sustain integrations");

  setupCommand
    .command("openclaw")
    .description("Register OpenClaw cron jobs for sustain self-supervision")
    .option("--tick-every <duration>", "Initial keep-alive review cadence", "20m")
    .option("--retry-every <duration>", "Retry-orders cadence", "10m")
    .option("--session <target>", "OpenClaw session target", "isolated")
    .option("--json", "Output as JSON")
    .action(setupOpenClawAction);

  const configCommand = program.command("config").description("Manage sustain configuration");

  configCommand
    .command("show")
    .description("Show current configuration")
    .option("--json", "Output as JSON")
    .action(configShowAction);

  configCommand
    .command("get")
    .description(`Get a config value (${CONFIG_KEYS.join(", ")})`)
    .argument("<key>", "Config key to get")
    .action(configGetAction);

  configCommand
    .command("set")
    .description(`Set a config value (${CONFIG_KEYS.join(", ")})`)
    .argument("<key>", "Config key to set")
    .argument("<value>", "Value to set")
    .action(configSetAction);

  configCommand
    .command("unset")
    .description(`Unset a config value (${CONFIG_KEYS.join(", ")})`)
    .argument("<key>", "Config key to unset")
    .action(configUnsetAction);

  configCommand
    .command("reset")
    .description("Reset config to defaults")
    .action(configResetAction);

  program
    .command("logout")
    .description("Clear local market authentication session")
    .action(logoutAction);
}

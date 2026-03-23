import { Command } from "commander";
import { setupOpenClawAction } from "./actions/openclaw";

export function registerSetupCommands(program: Command): void {
  program
    .command("openclaw")
    .description("Configure OpenClaw provider integration for Deepsky")
    .option("--json", "Output as JSON")
    .action(setupOpenClawAction);
}

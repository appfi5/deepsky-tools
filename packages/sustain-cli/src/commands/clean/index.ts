import { Command } from "commander";
import { cleanOpenClawAction } from "./actions/openclaw";

export function registerCleanCommands(program: Command): void {
  program
    .command("openclaw")
    .description("Clean Deepsky OpenClaw provider settings and sustain cron jobs")
    .option("--provider-only", "Only remove the Deepsky OpenClaw provider settings")
    .option("--jobs-only", "Only remove Deepsky sustain cron jobs")
    .option("--json", "Output as JSON")
    .action(cleanOpenClawAction);
}

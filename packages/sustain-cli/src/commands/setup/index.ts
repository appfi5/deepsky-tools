import { Command } from "commander";
import { setupOpenClawAction } from "./actions/openclaw";

export function registerSetupCommands(program: Command): void {
  program
    .command("openclaw")
    .description("Configure OpenClaw provider integration for Deepsky")
    .option("--api-key <key>", "Use an existing Deepsky API key instead of creating one via wallet login")
    .option("--skip-wallet-install", "Skip SupeRISE Agent Wallet setup checks and automatic install/start")
    .option("--skip-skill-install", "Skip Install skills enhancements")
    .option("--skill-repo <url>", "Additional repository URL used during Install skills")
    .option("--json", "Output as JSON")
    .action(setupOpenClawAction);
}

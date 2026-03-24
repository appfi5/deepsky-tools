#!/usr/bin/env node
import { Command } from "commander";
import { registerCleanCommands } from "./commands/clean";
import { registerSetupCommands } from "./commands/setup";
import { registerSustainCommands } from "./commands/sustain";
import { PACKAGE_VERSION } from "./utils/constants";
import { toErrorMessage } from "./utils/errors";

const program = new Command();

program
  .name("deepsky")
  .description("Deepsky CLI")
  .version(PACKAGE_VERSION)
  .showHelpAfterError();

const sustainCommand = program
  .command("sustain")
  .description("Sustain operations for Deepsky")
  .showHelpAfterError();

const setupCommand = program
  .command("setup")
  .description("Setup integrations for Deepsky")
  .showHelpAfterError();

const cleanCommand = program
  .command("clean")
  .description("Clean Deepsky integrations")
  .showHelpAfterError();

registerSustainCommands(sustainCommand);
registerSetupCommands(setupCommand);
registerCleanCommands(cleanCommand);

program.parseAsync(process.argv).catch((error) => {
  const json = process.argv.includes("--json");
  if (json) {
    console.log(
      JSON.stringify(
        {
          error: toErrorMessage(error),
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`Error: ${toErrorMessage(error)}`);
  }
  process.exitCode = 1;
});

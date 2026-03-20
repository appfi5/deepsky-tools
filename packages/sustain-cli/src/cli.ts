#!/usr/bin/env node
import { Command } from "commander";
import { registerSustainCommands } from "./commands/sustain";
import { PACKAGE_VERSION } from "./utils/constants";
import { toErrorMessage } from "./utils/errors";

const program = new Command();

program
  .name("superise")
  .description("SupeRISE Market CLI")
  .version(PACKAGE_VERSION)
  .showHelpAfterError();

const marketSustainCommand = program
  .command("market-sustain")
  .description("Sustain operations for SupeRISE Market")
  .showHelpAfterError();

registerSustainCommands(marketSustainCommand);

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

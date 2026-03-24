import { getSustainContext, printJson } from "../helpers";

export async function healthCheckAction(options: { json?: boolean } = {}): Promise<void> {
  const result = await getSustainContext().engine.healthCheck();
  if (options.json) {
    printJson(result);
    return;
  }

  console.log(`Status: ${result.status}`);
  console.log(`Balance: ${result.balance}`);
  console.log(`User: ${result.userName}`);
  console.log(`Observed At: ${result.observedAt}`);
  console.log(
    `Thresholds: critical<=${result.thresholds.critical}, low<=${result.thresholds.low}`,
  );
}

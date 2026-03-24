import { formatEtaMinutes } from "../../../utils/formatter";
import { getSustainContext, printJson } from "../helpers";

export async function forecastAction(options: { json?: boolean } = {}): Promise<void> {
  const result = await getSustainContext().engine.forecast();
  if (options.json) {
    printJson(result);
    return;
  }

  console.log(`Burn Rate: ${result.burnRate.toFixed(6)} CKB/min`);
  console.log(`ETA Critical: ${formatEtaMinutes(result.etaCritical)}`);
  console.log(`ETA Zero: ${formatEtaMinutes(result.etaZero)}`);
  console.log(`Confidence: ${result.confidence.toFixed(2)}`);
  console.log(`Observations: ${result.observationCount}`);
}

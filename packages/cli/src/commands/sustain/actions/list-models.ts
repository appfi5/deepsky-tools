import { getSustainContext, printJson } from "../helpers";

export async function listModelsAction(options: { json?: boolean } = {}): Promise<void> {
  const result = await getSustainContext().engine.listModels();
  if (options.json) {
    printJson(result);
    return;
  }

  if (result.length === 0) {
    console.log("No models returned by market.");
    return;
  }

  for (const model of result) {
    console.log(
      `${model.modelRef} avg=${model.avgPrice} min=${model.minPrice} max=${model.maxPrice} quotations=${model.quotationCount}`,
    );
  }
}

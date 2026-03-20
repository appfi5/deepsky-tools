import { getSustainContext, printJson } from "../helpers";

export async function retryOrdersAction(options: { json?: boolean } = {}): Promise<void> {
  const result = await getSustainContext().engine.retryPendingOrders();
  if (options.json) {
    printJson(result);
    return;
  }

  console.log(`Retried: ${result.retried}`);
  console.log(`Succeeded: ${result.succeeded.length}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Escalated: ${result.escalated.length}`);
}

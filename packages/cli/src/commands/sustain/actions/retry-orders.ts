import { getSustainContext, printJson, syncRetryOrdersJobWithPendingState } from "../helpers";

export async function retryOrdersAction(options: { json?: boolean } = {}): Promise<void> {
  const result = await getSustainContext().engine.retryPendingOrders();
  const retryJob = await syncRetryOrdersJobWithPendingState(
    result.escalated.length > 0
      ? "All remaining abnormal orders were escalated for manual review."
      : "No pending top-up orders remain.",
  );
  const output = retryJob ? { ...result, retryJob } : result;

  if (options.json) {
    printJson(output);
    return;
  }

  console.log(`Retried: ${result.retried}`);
  console.log(`Succeeded: ${result.succeeded.length}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Escalated: ${result.escalated.length}`);
  if (retryJob) {
    const writer = retryJob.warning ? console.error : console.log;
    writer(retryJob.message);
  }
}

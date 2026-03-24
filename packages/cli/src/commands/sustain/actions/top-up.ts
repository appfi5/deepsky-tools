import { ensureRetryOrdersJob, getSustainContext, printJson } from "../helpers";

export async function topUpAction(
  amount: string,
  options: { dryRun?: boolean; json?: boolean } = {},
): Promise<void> {
  const result = await getSustainContext().engine.topUp(amount, options.dryRun ?? false);
  const retryJob = result.savedForRetry ? await ensureRetryOrdersJob() : null;
  const output = retryJob ? { ...result, retryJob } : result;

  if (options.json) {
    printJson(output);
    if (!result.success) {
      process.exitCode = 1;
    }
    return;
  }

  if (!result.success) {
    console.error(`Top-up failed: ${result.error}`);
    console.error(`Amount: ${result.amountCkb} CKB`);
    if (result.orderId) {
      console.error(`Order ID: ${result.orderId}`);
    }
    if (result.toAddress) {
      console.error(`To Address: ${result.toAddress}`);
    }
    if (result.txHash) {
      console.error(`Transaction: ${result.txHash}`);
    }
    if (result.savedForRetry) {
      console.error("Transfer succeeded but submit-tx-hash failed. The order was saved for retry.");
    }
    if (retryJob) {
      const writer = retryJob.warning ? console.error : console.log;
      writer(retryJob.message);
    }
    process.exitCode = 1;
    return;
  }

  console.log(result.dryRun ? "Dry run completed." : "Top-up completed.");
  console.log(`Amount: ${result.amountCkb} CKB`);
  if (result.orderId) {
    console.log(`Order ID: ${result.orderId}`);
  }
  if (result.toAddress) {
    console.log(`To Address: ${result.toAddress}`);
  }
  if (result.txHash) {
    console.log(`Transaction: ${result.txHash}`);
  }
  if (result.operationId) {
    console.log(`Operation ID: ${result.operationId}`);
  }
  if (result.exchangeAmount) {
    console.log(`Exchange Amount: ${result.exchangeAmount}`);
  }
  if (typeof result.currentBalance === "number") {
    console.log(`Current Balance: ${result.currentBalance}`);
  }
  if (typeof result.newBalance === "number") {
    console.log(`New Balance: ${result.newBalance}`);
  }
  if (retryJob) {
    const writer = retryJob.warning ? console.error : console.log;
    writer(retryJob.message);
  }
}

import { createId } from "../utils/validator";
import { readJsonFile, writeJsonFile } from "../storage/json-store";
import type { ManualReviewOrder, PendingOrder } from "../core/sustain/types";

export class PendingOrderStore {
  constructor(
    private readonly pendingPath: string,
    private readonly manualReviewPath: string,
  ) {}

  listPending(): PendingOrder[] {
    return readJsonFile<PendingOrder[]>(this.pendingPath, []).filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.orderId === "string" &&
        typeof item?.txHash === "string",
    );
  }

  listManualReview(): ManualReviewOrder[] {
    return readJsonFile<ManualReviewOrder[]>(this.manualReviewPath, []).filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.orderId === "string" &&
        typeof item?.txHash === "string" &&
        typeof item?.escalatedAt === "string",
    );
  }

  savePendingOrder(
    input: Omit<PendingOrder, "id" | "createdAt" | "updatedAt" | "retryCount" | "lastError">,
  ): PendingOrder {
    const now = new Date().toISOString();
    const order: PendingOrder = {
      id: createId("pending_order"),
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      lastError: null,
      ...input,
    };
    const pending = this.listPending();
    pending.push(order);
    writeJsonFile(this.pendingPath, pending);
    return order;
  }

  replacePending(orders: PendingOrder[]): void {
    writeJsonFile(this.pendingPath, orders);
  }

  appendManualReview(order: ManualReviewOrder): void {
    const items = this.listManualReview();
    items.push(order);
    writeJsonFile(this.manualReviewPath, items);
  }
}

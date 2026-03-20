import { MAX_OBSERVATIONS, MAX_PENDING_ORDER_RETRIES, createDefaultPaths } from "../../utils/constants";
import { SustainConfigStore } from "./config";
import type {
  BalanceObservation,
  ForecastResult,
  HealthCheckResult,
  HealthStatus,
  ManualReviewOrder,
  PendingOrder,
  RetryResult,
  SustainPaths,
  TopUpAmount,
  TopUpResult,
} from "./types";
import { calculateBurnRate, parseTopUpAmount } from "../../utils/validator";
import { toErrorMessage } from "../../utils/errors";
import { readJsonFile, writeJsonFile } from "../../storage/json-store";
import type { BalanceStatus, ModelWithPricing } from "../../services/platform-types";
import { WalletMcpClient } from "../../services/wallet-mcp";
import { MarketAuthService } from "../../services/platform-auth";
import { MarketClient } from "../../services/superise-market";
import { PendingOrderStore } from "../../services/pending-orders";

class ObservationStore {
  constructor(private readonly path: string) {}

  append(observation: BalanceObservation): void {
    const current = this.listRecent(MAX_OBSERVATIONS);
    current.push(observation);
    writeJsonFile(this.path, current.slice(-MAX_OBSERVATIONS));
  }

  listRecent(limit: number): BalanceObservation[] {
    const items = readJsonFile<BalanceObservation[]>(this.path, []);
    return items
      .filter((item) => typeof item?.ts === "string" && typeof item?.remaining === "number")
      .slice(-limit);
  }
}

export class SustainEngine {
  private readonly observations: ObservationStore;
  private readonly pendingOrders: PendingOrderStore;

  constructor(
    private readonly input: {
      configStore: SustainConfigStore;
      marketClient: Pick<MarketClient, "fetchBalance" | "fetchModels" | "createOrder" | "submitTxHash">;
      authService: Pick<MarketAuthService, "getAddress" | "logout">;
      walletClient: Pick<WalletMcpClient, "transferCkb">;
      paths: SustainPaths;
    },
  ) {
    this.observations = new ObservationStore(input.paths.observationsPath);
    this.pendingOrders = new PendingOrderStore(
      input.paths.pendingOrdersPath,
      input.paths.manualReviewOrdersPath,
    );
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const balance = await this.input.marketClient.fetchBalance();
    const config = this.input.configStore.load();
    const observedAt = new Date().toISOString();
    this.observations.append({
      ts: observedAt,
      remaining: balance.balance,
    });

    return {
      status: classifyHealthStatus(
        balance.balance,
        config.criticalBalance,
        config.lowBalance,
      ),
      balance: balance.balance,
      userName: balance.userName,
      thresholds: {
        critical: config.criticalBalance,
        low: config.lowBalance,
      },
      observedAt,
    };
  }

  async forecast(): Promise<ForecastResult> {
    const observations = this.observations.listRecent(MAX_OBSERVATIONS);
    if (observations.length < 2) {
      return {
        burnRate: 0,
        etaCritical: -1,
        etaZero: -1,
        confidence: 0,
        observationCount: observations.length,
      };
    }

    const burnRate = calculateBurnRate(observations);
    const currentBalance = observations[observations.length - 1]?.remaining ?? 0;
    const config = this.input.configStore.load();

    return {
      burnRate,
      etaCritical:
        burnRate > 0 ? (currentBalance - config.criticalBalance) / burnRate : -1,
      etaZero: burnRate > 0 ? currentBalance / burnRate : -1,
      confidence: Math.min(1, observations.length / 50),
      observationCount: observations.length,
    };
  }

  async listModels(): Promise<ModelWithPricing[]> {
    return this.input.marketClient.fetchModels();
  }

  async topUp(amountInput: string, dryRun = false): Promise<TopUpResult> {
    const amount = this.validateTopUpAmount(amountInput);
    const fromAddress = await this.input.authService.getAddress();

    if (dryRun) {
      let currentBalance: number | undefined;
      try {
        currentBalance = (await this.input.marketClient.fetchBalance()).balance;
      } catch {
        currentBalance = undefined;
      }

      return {
        success: true,
        dryRun: true,
        amountCkb: amount.normalized,
        fromAddress,
        currentBalance,
      };
    }

    let order: Awaited<ReturnType<MarketClient["createOrder"]>>;
    try {
      order = await this.input.marketClient.createOrder(fromAddress, amount.numeric);
    } catch (error) {
      return {
        success: false,
        amountCkb: amount.normalized,
        fromAddress,
        error: `Failed to create market order: ${toErrorMessage(error)}`,
      };
    }

    let transferResult: Awaited<ReturnType<WalletMcpClient["transferCkb"]>>;
    try {
      transferResult = await this.input.walletClient.transferCkb(
        order.toAddress,
        amount.shannon,
      );
    } catch (error) {
      return {
        success: false,
        amountCkb: amount.normalized,
        fromAddress,
        orderId: order.id,
        toAddress: order.toAddress,
        exchangeAmount: order.exchangeAmount,
        error: `CKB transfer failed: ${toErrorMessage(error)}`,
      };
    }

    try {
      await this.input.marketClient.submitTxHash(order.id, transferResult.txHash);
    } catch (error) {
      this.pendingOrders.savePendingOrder({
        orderId: order.id,
        txHash: transferResult.txHash,
        operationId: transferResult.operationId,
        fromAddress,
        toAddress: order.toAddress,
        amountCkb: amount.normalized,
        platformBaseUrl: this.input.configStore.get("platformBaseUrl"),
      });

      return {
        success: false,
        amountCkb: amount.normalized,
        fromAddress,
        orderId: order.id,
        toAddress: order.toAddress,
        txHash: transferResult.txHash,
        operationId: transferResult.operationId,
        exchangeAmount: order.exchangeAmount,
        savedForRetry: true,
        error: `Failed to submit tx hash to market: ${toErrorMessage(error)}`,
      };
    }

    let newBalance: number | undefined;
    try {
      newBalance = (await this.input.marketClient.fetchBalance()).balance;
    } catch {
      newBalance = undefined;
    }

    return {
      success: true,
      amountCkb: amount.normalized,
      fromAddress,
      orderId: order.id,
      toAddress: order.toAddress,
      txHash: transferResult.txHash,
      operationId: transferResult.operationId,
      exchangeAmount: order.exchangeAmount,
      newBalance,
    };
  }

  async retryPendingOrders(): Promise<RetryResult> {
    const pending = this.pendingOrders.listPending();
    const nextPending: PendingOrder[] = [];
    const succeeded: PendingOrder[] = [];
    const escalated: ManualReviewOrder[] = [];
    let failed = 0;

    for (const order of pending) {
      try {
        await this.input.marketClient.submitTxHash(
          order.orderId,
          order.txHash,
          order.platformBaseUrl,
        );
        succeeded.push(order);
      } catch (error) {
        failed += 1;
        const now = new Date().toISOString();
        const updated: PendingOrder = {
          ...order,
          retryCount: order.retryCount + 1,
          updatedAt: now,
          lastError: toErrorMessage(error),
        };

        if (updated.retryCount >= MAX_PENDING_ORDER_RETRIES) {
          const manualReview: ManualReviewOrder = {
            ...updated,
            escalatedAt: now,
          };
          escalated.push(manualReview);
          this.pendingOrders.appendManualReview(manualReview);
        } else {
          nextPending.push(updated);
        }
      }
    }

    this.pendingOrders.replacePending(nextPending);

    return {
      retried: pending.length,
      succeeded,
      failed,
      escalated,
    };
  }

  listPendingOrders(): PendingOrder[] {
    return this.pendingOrders.listPending();
  }

  listManualReviewOrders(): ManualReviewOrder[] {
    return this.pendingOrders.listManualReview();
  }

  logout(): void {
    this.input.authService.logout();
  }

  private validateTopUpAmount(amountInput: string): TopUpAmount {
    return parseTopUpAmount(amountInput);
  }
}

export function classifyHealthStatus(
  balance: number,
  critical: number,
  low: number,
): HealthStatus {
  if (balance <= critical) {
    return "critical";
  }
  if (balance <= low) {
    return "low";
  }
  return "healthy";
}

export function createDefaultSustainContext(options?: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}) {
  const env = options?.env ?? process.env;
  const baseDir = env.SUPERISE_SUSTAIN_HOME ?? env.SUPERISE_HOME;
  const paths = createDefaultPaths(baseDir);
  const configStore = new SustainConfigStore(paths, env);
  const fetchImpl = options?.fetchImpl ?? fetch;
  const walletClient = new WalletMcpClient(configStore, fetchImpl);
  const authService = new MarketAuthService(configStore, walletClient, paths, fetchImpl);
  const marketClient = new MarketClient(configStore, authService, fetchImpl);
  const engine = new SustainEngine({
    configStore,
    marketClient,
    authService,
    walletClient,
    paths,
  });

  return {
    paths,
    configStore,
    walletClient,
    authService,
    marketClient,
    engine,
  };
}

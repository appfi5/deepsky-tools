import { requestJson } from "./http";
import { SustainConfigStore } from "../core/sustain/config";
import type { BalanceStatus } from "./platform-types";
import type {
  CreateOrderVo,
  ModelWithPricing,
  PlatformAiModel,
  PlatformModelQuotation,
  PlatformPagedData,
  PlatformResponse,
  PlatformUserInfoVo,
} from "./platform-types";
import { normalizeAuthorizationToken } from "../utils/validator";
import { MarketAuthService } from "./platform-auth";

export class MarketClient {
  constructor(
    private readonly configStore: SustainConfigStore,
    private readonly authService: MarketAuthService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchBalance(baseUrl = this.configStore.get("platformBaseUrl")): Promise<BalanceStatus> {
    const data = await this.requestPlatform<PlatformUserInfoVo>(
      baseUrl,
      "/api/v1/user/info",
      {
        method: "GET",
      },
      true,
    );

    return {
      balance: Number.parseFloat(data.balance ?? "0") || 0,
      userName: data.userName || data.ckbAddress,
      email: data.email || "",
      observedAt: new Date().toISOString(),
    };
  }

  async fetchModels(baseUrl = this.configStore.get("platformBaseUrl")): Promise<ModelWithPricing[]> {
    const models = await this.fetchAllModels(baseUrl);
    const priced = await Promise.all(
      models.map(async (model) => {
        const quotations = await this.fetchModelQuotations(baseUrl, model.id);
        const prices = quotations.map((quotation) => quotation.price);
        return {
          platformId: model.id,
          shortName: model.name.toLowerCase(),
          modelRef: `${model.provider}/${model.name.toLowerCase()}`,
          displayName: model.name,
          provider: model.provider,
          version: model.version,
          scene: model.scene,
          capability: model.capability,
          minPrice: prices.length > 0 ? Math.min(...prices) : 0,
          maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
          avgPrice:
            prices.length > 0
              ? Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length)
              : 0,
          quotationCount: quotations.length,
        };
      }),
    );

    return priced.sort((left, right) => {
      if (left.avgPrice !== right.avgPrice) {
        return left.avgPrice - right.avgPrice;
      }
      return left.modelRef.localeCompare(right.modelRef);
    });
  }

  async createOrder(
    fromAddress: string,
    amountCkb: number,
    baseUrl = this.configStore.get("platformBaseUrl"),
  ): Promise<CreateOrderVo> {
    return this.requestPlatform<CreateOrderVo>(
      baseUrl,
      "/api/v1/order/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromAddress,
          currencyType: 2,
          amount: amountCkb,
        }),
      },
      true,
    );
  }

  async submitTxHash(
    orderId: string,
    txHash: string,
    baseUrl = this.configStore.get("platformBaseUrl"),
  ): Promise<void> {
    await this.requestPlatform<boolean>(
      baseUrl,
      "/api/v1/order/submit-tx-hash",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId, txHash }),
      },
      true,
    );
  }

  private async fetchAllModels(baseUrl: string): Promise<PlatformAiModel[]> {
    const models: PlatformAiModel[] = [];
    let pageIndex = 1;
    const pageSize = 50;

    while (true) {
      const page = await this.requestPlatform<PlatformPagedData<PlatformAiModel>>(
        baseUrl,
        `/api/v1/ai-models?pageIndex=${pageIndex}&pageSize=${pageSize}`,
        {
          method: "GET",
        },
        false,
      );

      models.push(...page.items);

      if (models.length >= page.total) {
        break;
      }

      pageIndex += 1;
    }

    return models;
  }

  private async fetchModelQuotations(
    baseUrl: string,
    modelId: string,
  ): Promise<PlatformModelQuotation[]> {
    const quotations: PlatformModelQuotation[] = [];
    let pageIndex = 1;
    const pageSize = 50;

    while (true) {
      const page = await this.requestPlatform<PlatformPagedData<PlatformModelQuotation>>(
        baseUrl,
        "/api/v1/ai-models/quotations",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            modelId,
            pageIndex,
            pageSize,
          }),
        },
        false,
      );

      quotations.push(...page.items);

      if (quotations.length >= page.total) {
        break;
      }

      pageIndex += 1;
    }

    return quotations;
  }

  private async requestPlatform<T>(
    baseUrl: string,
    path: string,
    init: RequestInit,
    requiresAuth: boolean,
  ): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    if (requiresAuth) {
      headers.set(
        "Authorization",
        normalizeAuthorizationToken(await this.authService.ensureToken(baseUrl)),
      );
    }

    const payload = await requestJson<PlatformResponse<T>>(
      this.fetchImpl,
      `${baseUrl}${path}`,
      {
        ...init,
        headers,
      },
      this.configStore.get("requestTimeoutMs"),
    );

    if (!payload.success) {
      throw new Error(payload.message ?? `Market request failed: ${path}`);
    }

    return payload.data;
  }
}

export type PlatformResponse<T> = {
  data: T;
  success: boolean;
  message?: string;
  code?: number;
  errorData?: unknown[] | null;
};

export type PlatformPagedData<T> = {
  items: T[];
  total: number;
  pageIndex: number;
  pageSize: number;
};

export type PlatformTokenVo = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: string;
  scope?: string;
};

export type PlatformUserInfoVo = {
  userId: string;
  userName: string;
  email: string;
  ckbAddress: string;
  avatar: string;
  isEnabled: boolean;
  balance: string;
};

export type PlatformAiModel = {
  id: string;
  name: string;
  provider: string;
  version: string;
  scene: number;
  capability: string;
};

export type PlatformModelQuotation = {
  id: string;
  merchantId: string;
  modelId: string;
  price: number;
};

export type ModelWithPricing = {
  platformId: string;
  shortName: string;
  modelRef: string;
  displayName: string;
  provider: string;
  version: string;
  scene: number;
  capability: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  quotationCount: number;
};

export type BalanceStatus = {
  balance: number;
  userName: string;
  email: string;
  observedAt: string;
};

export type CreateOrderVo = {
  id: string;
  toAddress: string;
  currencyType: number;
  exchangeAmount?: string;
};

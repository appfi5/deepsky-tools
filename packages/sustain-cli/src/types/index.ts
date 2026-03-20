export type ErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiResponse<T> =
  | {
      success: true;
      data: T;
      error: null;
    }
  | {
      success: false;
      data: null;
      error: ErrorPayload;
    };

export type WalletToolCatalogItem = {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
};

export type NervosAddressResult = {
  chain: "nervos";
  address: string;
};

export type NervosIdentityResult = NervosAddressResult & {
  publicKey: string;
};

export type WalletCurrentResult = {
  walletFingerprint: string;
  status: "ACTIVE" | "EMPTY";
  source: "AUTO_GENERATED" | "IMPORTED" | "UNKNOWN";
  publicKey?: string;
};

export type NervosSignMessageResult = {
  chain: "nervos";
  signingAddress: string;
  signature: string;
};

export type NervosTransferCkbResult = {
  chain: "nervos";
  asset: "CKB";
  operationId: string;
  txHash: string;
  status: string;
  toType: string;
  contactName?: string;
  resolvedAddress: string;
};

export type SustainCliConfig = {
  platformBaseUrl: string;
  walletMcpUrl: string;
  marketPublicKey?: string;
  criticalBalance: number;
  lowBalance: number;
  requestTimeoutMs: number;
};

export type SustainPaths = {
  riseDir: string;
  sustainDir: string;
  configPath: string;
  marketSessionPath: string;
  observationsPath: string;
  pendingOrdersPath: string;
  manualReviewOrdersPath: string;
};

export type AuthSession = {
  address: string;
  token: string;
  refreshToken?: string;
  expiresAt?: number;
  platformBaseUrl: string;
};

export type BalanceObservation = {
  ts: string;
  remaining: number;
};

export type PendingOrder = {
  id: string;
  orderId: string;
  txHash: string;
  operationId: string;
  fromAddress: string;
  toAddress: string;
  amountCkb: string;
  platformBaseUrl: string;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  lastError: string | null;
};

export type ManualReviewOrder = PendingOrder & {
  escalatedAt: string;
};

export type HealthStatus = "healthy" | "low" | "critical";

export type HealthCheckResult = {
  status: HealthStatus;
  balance: number;
  userName: string;
  thresholds: {
    critical: number;
    low: number;
  };
  observedAt: string;
};

export type ForecastResult = {
  burnRate: number;
  etaCritical: number;
  etaZero: number;
  confidence: number;
  observationCount: number;
};

export type TopUpAmount = {
  input: string;
  normalized: string;
  numeric: number;
  shannon: string;
};

export type TopUpResult = {
  success: boolean;
  dryRun?: boolean;
  amountCkb: string;
  fromAddress?: string;
  currentBalance?: number;
  newBalance?: number;
  error?: string;
  orderId?: string;
  toAddress?: string;
  txHash?: string;
  operationId?: string;
  exchangeAmount?: string;
  savedForRetry?: boolean;
};

export type RetryResult = {
  retried: number;
  succeeded: PendingOrder[];
  failed: number;
  escalated: ManualReviewOrder[];
};

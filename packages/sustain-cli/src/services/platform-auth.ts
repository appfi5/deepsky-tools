import { requestJson } from "./http";
import { readJsonFile, removeFileIfExists, writeJsonFile } from "../storage/json-store";
import { SustainConfigStore } from "../core/sustain/config";
import type { AuthSession, SustainPaths } from "../core/sustain/types";
import type { PlatformResponse, PlatformTokenVo } from "./platform-types";
import { WalletMcpClient } from "./wallet-mcp";

export class MarketAuthService {
  constructor(
    private readonly configStore: SustainConfigStore,
    private readonly walletClient: WalletMcpClient,
    private readonly paths: SustainPaths,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async ensureToken(baseUrl = this.configStore.get("platformBaseUrl")): Promise<string> {
    const address = await this.getAddress();
    const session = this.loadSession();
    if (this.isSessionValid(session, address, baseUrl)) {
      return session.token;
    }

    const publicKey =
      this.configStore.get("marketPublicKey") ?? (await this.walletClient.getMarketPublicKey());
    const originMessage = await this.generateSignMessage(address, baseUrl);
    const signature = await this.walletClient.signNervosMessage(originMessage);
    const payload = await this.loginForAgent(
      {
        ckbAddress: address,
        originMessage,
        signature: signature.signature,
        publicKey,
      },
      baseUrl,
    );

    const nextSession: AuthSession = {
      address,
      token: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt:
        payload.expiresIn && Number.isFinite(Number(payload.expiresIn))
          ? Date.now() + Number(payload.expiresIn) * 1000
          : undefined,
      platformBaseUrl: baseUrl,
    };

    writeJsonFile(this.paths.marketSessionPath, nextSession);
    return nextSession.token;
  }

  async getAddress(): Promise<string> {
    const result = await this.walletClient.getNervosAddress();
    return result.address;
  }

  logout(): void {
    removeFileIfExists(this.paths.marketSessionPath);
  }

  private loadSession(): AuthSession | null {
    const session = readJsonFile<AuthSession | null>(this.paths.marketSessionPath, null);
    if (!session || typeof session.address !== "string" || typeof session.token !== "string") {
      return null;
    }
    return session;
  }

  private isSessionValid(
    session: AuthSession | null,
    address: string,
    baseUrl: string,
  ): session is AuthSession {
    if (!session) {
      return false;
    }

    if (session.address !== address || session.platformBaseUrl !== baseUrl) {
      return false;
    }

    if (session.expiresAt && Date.now() > session.expiresAt) {
      return false;
    }

    return session.token.trim().length > 0;
  }

  private async generateSignMessage(address: string, baseUrl: string): Promise<string> {
    const payload = await requestJson<PlatformResponse<string>>(
      this.fetchImpl,
      `${baseUrl}/api/v1/user/gen-sign-message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ckbAddress: address }),
      },
      this.configStore.get("requestTimeoutMs"),
    );

    if (!payload.success || typeof payload.data !== "string" || payload.data.trim().length === 0) {
      throw new Error(`Failed to generate sign message: ${payload.message ?? "missing message"}`);
    }

    return payload.data;
  }

  private async loginForAgent(
    input: {
      ckbAddress: string;
      originMessage: string;
      signature: string;
      publicKey: string;
    },
    baseUrl: string,
  ): Promise<PlatformTokenVo> {
    const body: Record<string, unknown> = {
      ckbAddress: input.ckbAddress,
      originMessage: input.originMessage,
      signature: input.signature,
      publicKey: input.publicKey,
    };

    const payload = await requestJson<PlatformResponse<PlatformTokenVo>>(
      this.fetchImpl,
      `${baseUrl}/api/v1/user/login-for-agent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      this.configStore.get("requestTimeoutMs"),
    );

    if (!payload.success || !payload.data?.accessToken) {
      const message = payload.message ?? "missing access token";
      if (message.includes("Signature verification failed")) {
        throw new Error(
          "Market login failed: wallet MCP `nervos.sign_message` output is not accepted by market signature verification. The current wallet MCP exposes CKB-style message signing, but it does not expose a market-compatible signing capability for `login-for-agent`.",
        );
      }

      throw new Error(`Market login failed: ${message}`);
    }

    return payload.data;
  }
}

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PACKAGE_NAME, PACKAGE_VERSION } from "../utils/constants";
import { isRecord } from "../storage/json-store";
import { SustainConfigStore } from "../core/sustain/config";
import type {
  ApiResponse,
  NervosAddressResult,
  NervosIdentityResult,
  NervosSignMessageResult,
  NervosTransferCkbResult,
  WalletCurrentResult,
  WalletToolCatalogItem,
} from "../types";
import { toErrorMessage } from "../utils/errors";

export class WalletMcpClient {
  constructor(
    private readonly configStore: SustainConfigStore,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async listTools(): Promise<WalletToolCatalogItem[]> {
    return this.withClient(async (client) => {
      const result = await client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        arguments: [],
      }));
    });
  }

  async getNervosAddress(): Promise<NervosAddressResult> {
    const identity = await this.callTool<NervosIdentityResult>("nervos.identity", {});
    return {
      chain: identity.chain,
      address: identity.address,
    };
  }

  async getCurrentWallet(): Promise<WalletCurrentResult> {
    return this.callTool("wallet.current", {});
  }

  async getMarketPublicKey(): Promise<string> {
    const identity = await this.callTool<NervosIdentityResult>("nervos.identity", {});
    if (typeof identity.publicKey !== "string" || identity.publicKey.trim().length === 0) {
      throw new Error(
        "Wallet MCP does not expose `nervos.identity.publicKey` required by market login-for-agent. Please request wallet-side support or configure `marketPublicKey` explicitly.",
      );
    }

    return identity.publicKey.trim();
  }

  async signNervosMessage(message: string): Promise<NervosSignMessageResult> {
    return this.callTool("nervos.sign_message", {
      message,
      encoding: "utf8",
    });
  }

  async transferCkb(toAddress: string, amountShannon: string): Promise<NervosTransferCkbResult> {
    return this.callTool("nervos.transfer.ckb", {
      to: toAddress,
      toType: "address",
      amount: amountShannon,
    });
  }

  async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    return this.withClient(async (client) => {
      const tools = await client.listTools();
      if (!tools.tools.some((tool) => tool.name === name)) {
        throw new Error(`Wallet MCP tool is not registered: ${name}`);
      }

      const result = await client.callTool({
        name,
        arguments: args,
      });

      const envelope = this.parseApiEnvelope<T>(
        result.structuredContent ?? this.extractContentText(result.content),
      );

      if (!envelope.success) {
        const code = envelope.error?.code ?? "UNKNOWN";
        const message = envelope.error?.message ?? "Wallet tool call failed";
        throw new Error(`${name} failed [${code}]: ${message}`);
      }

      return envelope.data;
    });
  }

  private async withClient<T>(task: (client: Client) => Promise<T>): Promise<T> {
    const config = this.configStore.load();
    const transport = new StreamableHTTPClientTransport(new URL(config.walletMcpUrl), {
      fetch: this.fetchImpl,
      requestInit: {
        headers: {
          Accept: "application/json, text/event-stream",
        },
      },
    });
    const client = new Client({
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
    });

    await client.connect(transport);
    try {
      return await task(client);
    } finally {
      await client.close();
    }
  }

  private extractContentText(content: unknown): unknown {
    if (!Array.isArray(content) || content.length === 0) {
      return null;
    }

    const first = content[0];
    if (!isRecord(first)) {
      return null;
    }

    return first.text ?? null;
  }

  private parseApiEnvelope<T>(value: unknown): ApiResponse<T> {
    const normalized = typeof value === "string" ? this.parseJsonText(value) : value;
    if (!isRecord(normalized) || typeof normalized.success !== "boolean") {
      throw new Error("Wallet tool response is missing the expected API envelope");
    }
    return normalized as ApiResponse<T>;
  }

  private parseJsonText(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`Wallet tool content is not valid JSON: ${toErrorMessage(error)}`);
    }
  }
}

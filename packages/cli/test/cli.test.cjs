const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Command } = require("commander");

const {
  SustainConfigStore,
  WalletMcpClient,
  MarketAuthService,
  SustainEngine,
  calculateBurnRate,
  buildSustainOpenClawJobs,
  cleanupDeepskyOpenClawConfig,
  configureDeepskyOpenClaw,
  createOpenClawModelRef,
  createOpenClawCli,
  createDefaultPaths,
  DEFAULT_CONFIG,
  DEFAULT_OPENCLAW_BASE_URL,
  ensureSuperiseAgentWallet,
  inspectSuperiseAgentWallet,
  installSkillFromRepository,
  installSkillsFromRepositories,
  readOpenClawConfig,
  registerSetupCommands,
  updateDeepskyProviderConfig,
} = require("../dist/lib.cjs");

function createTempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepsky-cli-"));
  return createDefaultPaths(root);
}

test("WalletMcpClient performs MCP handshake and returns nervos identity data", async () => {
  const calls = [];
  const configStore = new SustainConfigStore(createTempPaths(), {
    DEEPSKY_WALLET_MCP_URL: "http://127.0.0.1:18799/mcp",
  });
  const client = new WalletMcpClient(configStore, async (_url, init) => {
    if (init.method === "GET") {
      calls.push("GET");
      return new Response("", { status: 405 });
    }

    const payload = JSON.parse(init.body);
    calls.push(payload.method);

    if (payload.method === "initialize") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "test-wallet",
              version: "1.0.0",
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (payload.method === "notifications/initialized") {
      return new Response("", { status: 200 });
    }

    if (payload.method === "tools/list") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            tools: [
              {
                name: "nervos.identity",
                description: "",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (payload.method === "tools/call") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  data: {
                    chain: "nervos",
                    address: "ckt1qyqtest",
                    publicKey:
                      "0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
                  },
                  error: null,
                }),
              },
            ],
            structuredContent: {
              success: true,
              data: {
                chain: "nervos",
                address: "ckt1qyqtest",
                publicKey:
                  "0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
              },
              error: null,
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    throw new Error(`Unexpected method ${payload.method}`);
  });

  const result = await client.getNervosAddress();

  assert.equal(result.address, "ckt1qyqtest");
  assert.deepEqual(calls, [
    "initialize",
    "notifications/initialized",
    "tools/list",
    "tools/call",
  ]);
});

test("WalletMcpClient reads market publicKey from nervos.identity", async () => {
  const configStore = new SustainConfigStore(createTempPaths(), {
    DEEPSKY_WALLET_MCP_URL: "http://127.0.0.1:18799/mcp",
  });
  const client = new WalletMcpClient(configStore, async (_url, init) => {
    if (init.method === "GET") {
      return new Response("", { status: 405 });
    }

    const payload = JSON.parse(init.body);

    if (payload.method === "initialize") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "test-wallet",
              version: "1.0.0",
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (payload.method === "notifications/initialized") {
      return new Response("", { status: 200 });
    }

    if (payload.method === "tools/list") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            tools: [
              {
                name: "nervos.identity",
                description: "",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (payload.method === "tools/call") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  data: {
                    chain: "nervos",
                    address: "ckt1qyqtest",
                    publicKey:
                      "0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
                  },
                  error: null,
                }),
              },
            ],
            structuredContent: {
              success: true,
              data: {
                chain: "nervos",
                address: "ckt1qyqtest",
                publicKey:
                  "0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
              },
              error: null,
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    throw new Error(`Unexpected method ${payload.method}`);
  });

  const publicKey = await client.getMarketPublicKey();

  assert.equal(
    publicKey,
    "0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
  );
});

test("WalletMcpClient reports wallet MCP connection failures with configured URL", async () => {
  const configStore = new SustainConfigStore(createTempPaths(), {
    DEEPSKY_WALLET_MCP_URL: "http://127.0.0.1:1/mcp",
  });
  const client = new WalletMcpClient(configStore);

  await assert.rejects(async () => {
    try {
      await client.getNervosAddress();
    } catch (error) {
      assert.match(String(error), /Unable to connect to wallet MCP at http:\/\/127\.0\.0\.1:1\/mcp\./);
      assert.match(String(error), /DEEPSKY_WALLET_MCP_URL/);
      throw error;
    }
  });
});

test("ensureSuperiseAgentWallet skips automatic bootstrap for non-local wallet MCP URLs", async () => {
  const calls = [];
  const result = await ensureSuperiseAgentWallet(
    {
      walletMcpUrl: "https://wallet.example.com/mcp",
    },
    {
      executor: async (command, args) => {
        calls.push([command, ...args]);
        return {
          stdout: "",
          stderr: "",
        };
      },
    },
  );

  assert.equal(result.action, "skipped");
  assert.equal(result.managed, false);
  assert.deepEqual(calls, []);
});

test("inspectSuperiseAgentWallet reports installed and running local wallet", async () => {
  const calls = [];
  const result = await inspectSuperiseAgentWallet(
    {
      walletMcpUrl: DEFAULT_CONFIG.walletMcpUrl,
      requestTimeoutMs: 50,
    },
    {
      fetchImpl: async (url) => {
        assert.equal(String(url), "http://127.0.0.1:18799/health");
        return new Response("ok", { status: 200 });
      },
      executor: async (command, args) => {
        calls.push([command, ...args]);
        return {
          stdout: "",
          stderr: "",
        };
      },
    },
  );

  assert.equal(result.status, "running");
  assert.equal(result.managed, true);
  assert.deepEqual(calls, []);
});

test("inspectSuperiseAgentWallet reports stopped wallet containers", async () => {
  const calls = [];
  const result = await inspectSuperiseAgentWallet(
    {
      walletMcpUrl: DEFAULT_CONFIG.walletMcpUrl,
      requestTimeoutMs: 50,
    },
    {
      fetchImpl: async (url) => {
        assert.equal(String(url), "http://127.0.0.1:18799/health");
        return new Response("down", { status: 503 });
      },
      executor: async (command, args) => {
        calls.push([command, ...args]);

        if (command !== "docker") {
          throw new Error(`Unexpected command ${command}`);
        }

        if (args[0] === "ps" && args[1] === "-a") {
          return {
            stdout: "superise-agent-wallet exited\n",
            stderr: "",
          };
        }

        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
    },
  );

  assert.equal(result.status, "stopped");
  assert.equal(result.containerState, "exited");
  assert.deepEqual(calls, [
    [
      "docker",
      "ps",
      "-a",
      "--filter",
      "name=^/superise-agent-wallet$",
      "--format",
      "{{.Names}}\t{{.State}}",
    ],
  ]);
});

test("ensureSuperiseAgentWallet installs and starts docker wallet when default local MCP is unavailable", async () => {
  const calls = [];
  let healthChecks = 0;
  const result = await ensureSuperiseAgentWallet(
    {
      walletMcpUrl: DEFAULT_CONFIG.walletMcpUrl,
      requestTimeoutMs: 50,
      pollIntervalMs: 0,
      maxWaitMs: 50,
    },
    {
      fetchImpl: async (url) => {
        healthChecks += 1;
        assert.equal(String(url), "http://127.0.0.1:18799/health");
        if (healthChecks >= 2) {
          return new Response("ok", { status: 200 });
        }
        return new Response("booting", { status: 503 });
      },
      executor: async (command, args) => {
        calls.push([command, ...args]);

        if (command !== "docker") {
          throw new Error(`Unexpected command ${command}`);
        }

        if (args[0] === "ps" && args[1] === "-a") {
          return {
            stdout: "",
            stderr: "",
          };
        }

        if (args[0] === "volume" && args[1] === "ls") {
          return {
            stdout: "",
            stderr: "",
          };
        }

        if (args[0] === "volume" && args[1] === "create") {
          return {
            stdout: "superise-agent-wallet-data\n",
            stderr: "",
          };
        }

        if (args[0] === "pull") {
          return {
            stdout: "pulled\n",
            stderr: "",
          };
        }

        if (args[0] === "run") {
          return {
            stdout: "container-id\n",
            stderr: "",
          };
        }

        if (args[0] === "logs") {
          return {
            stdout:
              "[Nest] 1  -  bootstrap\nQuickstart initial Owner password (shown once): owner-pass-123\n",
            stderr: "",
          };
        }

        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
    },
  );

  assert.equal(result.action, "installed");
  assert.equal(result.managed, true);
  assert.equal(result.initialOwnerPassword, "owner-pass-123");
  assert.ok(healthChecks >= 2);
  assert.deepEqual(calls, [
    [
      "docker",
      "ps",
      "-a",
      "--filter",
      "name=^/superise-agent-wallet$",
      "--format",
      "{{.Names}}\t{{.State}}",
    ],
    [
      "docker",
      "volume",
      "ls",
      "--format",
      "{{.Name}}",
      "--filter",
      "name=^superise-agent-wallet-data$",
    ],
    ["docker", "volume", "create", "superise-agent-wallet-data"],
    ["docker", "pull", "superise/agent-wallet:latest"],
    [
      "docker",
      "run",
      "-d",
      "--name",
      "superise-agent-wallet",
      "--restart",
      "unless-stopped",
      "-p",
      "127.0.0.1:18799:18799",
      "-v",
      "superise-agent-wallet-data:/app/runtime-data",
      "superise/agent-wallet:latest",
    ],
    ["docker", "logs", "superise-agent-wallet"],
  ]);
});

test("ensureSuperiseAgentWallet starts an installed wallet container when it is stopped", async () => {
  const calls = [];
  let healthChecks = 0;
  const result = await ensureSuperiseAgentWallet(
    {
      walletMcpUrl: DEFAULT_CONFIG.walletMcpUrl,
      requestTimeoutMs: 50,
      pollIntervalMs: 0,
      maxWaitMs: 50,
    },
    {
      fetchImpl: async (url) => {
        healthChecks += 1;
        assert.equal(String(url), "http://127.0.0.1:18799/health");
        if (healthChecks >= 2) {
          return new Response("ok", { status: 200 });
        }
        return new Response("booting", { status: 503 });
      },
      executor: async (command, args) => {
        calls.push([command, ...args]);

        if (command !== "docker") {
          throw new Error(`Unexpected command ${command}`);
        }

        if (args[0] === "ps" && args[1] === "-a") {
          return {
            stdout: "superise-agent-wallet exited\n",
            stderr: "",
          };
        }

        if (args[0] === "start") {
          return {
            stdout: "superise-agent-wallet\n",
            stderr: "",
          };
        }

        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
    },
  );

  assert.equal(result.action, "started-existing");
  assert.equal(result.managed, true);
  assert.equal(result.initialOwnerPassword, null);
  assert.ok(healthChecks >= 2);
  assert.deepEqual(calls, [
    [
      "docker",
      "ps",
      "-a",
      "--filter",
      "name=^/superise-agent-wallet$",
      "--format",
      "{{.Names}}\t{{.State}}",
    ],
    ["docker", "start", "superise-agent-wallet"],
  ]);
});

test("ensureSuperiseAgentWallet falls back to the owner notice file when startup logs do not contain the password", async () => {
  const calls = [];
  let healthChecks = 0;
  const result = await ensureSuperiseAgentWallet(
    {
      walletMcpUrl: DEFAULT_CONFIG.walletMcpUrl,
      requestTimeoutMs: 50,
      pollIntervalMs: 0,
      maxWaitMs: 50,
    },
    {
      fetchImpl: async () => {
        healthChecks += 1;
        if (healthChecks >= 2) {
          return new Response("ok", { status: 200 });
        }
        return new Response("booting", { status: 503 });
      },
      executor: async (command, args) => {
        calls.push([command, ...args]);

        if (command !== "docker") {
          throw new Error(`Unexpected command ${command}`);
        }

        if (args[0] === "ps" && args[1] === "-a") {
          return {
            stdout: "",
            stderr: "",
          };
        }

        if (args[0] === "volume" && args[1] === "ls") {
          return {
            stdout: "superise-agent-wallet-data\n",
            stderr: "",
          };
        }

        if (args[0] === "pull" || args[0] === "run") {
          return {
            stdout: "ok\n",
            stderr: "",
          };
        }

        if (args[0] === "logs") {
          return {
            stdout: "no initial password in log\n",
            stderr: "",
          };
        }

        if (args[0] === "exec") {
          return {
            stdout: "SupeRISE Owner Credential\n\nLogin password:\nowner-pass-from-notice\n",
            stderr: "",
          };
        }

        throw new Error(`Unexpected args: ${args.join(" ")}`);
      },
    },
  );

  assert.equal(result.action, "installed");
  assert.equal(result.initialOwnerPassword, "owner-pass-from-notice");
  assert.deepEqual(calls.slice(-2), [
    ["docker", "logs", "superise-agent-wallet"],
    ["docker", "exec", "superise-agent-wallet", "cat", "/app/runtime-data/owner-credential.txt"],
  ]);
});

test("MarketAuthService reports missing wallet publicKey capability when config does not provide one", async () => {
  const paths = createTempPaths();
  const configStore = new SustainConfigStore(paths, {
    DEEPSKY_MARKET_BASE_URL: "https://market.example.com",
  });
  const walletClient = {
    async getNervosAddress() {
      return { chain: "nervos", address: "ckt1qyqwallet" };
    },
    async getMarketPublicKey() {
      throw new Error(
        "Wallet MCP does not expose `nervos.identity.publicKey` required by market login-for-agent. Please request wallet-side support or configure `marketPublicKey` explicitly.",
      );
    },
    async signNervosMessage(message) {
      throw new Error(`should not sign message: ${message}`);
    },
  };
  const auth = new MarketAuthService(configStore, walletClient, paths, async () => {
    throw new Error("fetch should not be called");
  });

  await assert.rejects(
    auth.ensureToken(),
    /Wallet MCP does not expose `nervos\.identity\.publicKey` required by market login-for-agent/,
  );
});

test("MarketAuthService uses wallet MCP publicKey for login-for-agent when config is unset", async () => {
  const paths = createTempPaths();
  const configStore = new SustainConfigStore(paths, {
    DEEPSKY_MARKET_BASE_URL: "https://market.example.com",
  });
  const walletClient = {
    async getNervosAddress() {
      return { chain: "nervos", address: "ckt1qyqwallet" };
    },
    async getMarketPublicKey() {
      return "0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";
    },
    async signNervosMessage(message) {
      assert.equal(message, "sign me");
      return {
        chain: "nervos",
        signingAddress: "ckt1qyqwallet",
        signature: "0xsigned",
      };
    },
  };
  const requests = [];
  const auth = new MarketAuthService(configStore, walletClient, paths, async (url, init) => {
    requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith("/gen-sign-message")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: "sign me",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          accessToken: "Bearer token-1",
          expiresIn: "60",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  const token = await auth.ensureToken();

  assert.equal(token, "Bearer token-1");
  assert.equal(
    requests[1].body.publicKey,
    "0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
  );
});

test("MarketAuthService forwards configured marketPublicKey to login-for-agent", async () => {
  const paths = createTempPaths();
  const configStore = new SustainConfigStore(paths, {
    DEEPSKY_MARKET_BASE_URL: "https://market.example.com",
    DEEPSKY_MARKET_PUBLIC_KEY:
      "0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
  });
  const walletClient = {
    async getNervosAddress() {
      return { chain: "nervos", address: "ckt1qyqwallet" };
    },
    async getMarketPublicKey() {
      throw new Error("wallet MCP publicKey should not be called when config is set");
    },
    async signNervosMessage(message) {
      assert.equal(message, "sign me");
      return {
        chain: "nervos",
        signingAddress: "ckt1qyqwallet",
        signature: "0xsigned",
      };
    },
  };
  const requests = [];
  const auth = new MarketAuthService(configStore, walletClient, paths, async (url, init) => {
    requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith("/gen-sign-message")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: "sign me",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          accessToken: "Bearer token-1",
          expiresIn: "60",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  const token = await auth.ensureToken();

  assert.equal(token, "Bearer token-1");
  assert.equal(
    requests[1].body.publicKey,
    "0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
  );
});

test("MarketAuthService reports wallet MCP market-signing gap on signature verification failure", async () => {
  const paths = createTempPaths();
  const configStore = new SustainConfigStore(paths, {
    DEEPSKY_MARKET_BASE_URL: "https://market.example.com",
    DEEPSKY_MARKET_PUBLIC_KEY:
      "0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
  });
  const walletClient = {
    async getNervosAddress() {
      return { chain: "nervos", address: "ckt1qyqwallet" };
    },
    async getMarketPublicKey() {
      throw new Error("wallet MCP publicKey should not be called when config is set");
    },
    async signNervosMessage(message) {
      assert.equal(message, "sign me");
      return {
        chain: "nervos",
        signingAddress: "ckt1qyqwallet",
        signature: "0xsigned",
      };
    },
  };
  const auth = new MarketAuthService(configStore, walletClient, paths, async (url) => {
    if (String(url).endsWith("/gen-sign-message")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: "sign me",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: "Signature verification failed",
        data: null,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  await assert.rejects(
    auth.ensureToken(),
    /wallet MCP `nervos\.sign_message` output is not accepted by market signature verification/,
  );
});

test("SustainService saves pending order when tx hash submission fails", async () => {
  const paths = createTempPaths();
  const configStore = new SustainConfigStore(paths, {});
  const service = new SustainEngine({
    configStore,
    marketClient: {
      async fetchBalance() {
        return {
          balance: 100,
          userName: "tester",
          email: "test@example.com",
          observedAt: new Date().toISOString(),
        };
      },
      async fetchModels() {
        return [];
      },
      async createOrder() {
        return {
          id: "order_1",
          toAddress: "ckt1qyqdest",
          exchangeAmount: "42",
        };
      },
      async submitTxHash() {
        throw new Error("submit failed");
      },
    },
    authService: {
      async getAddress() {
        return "ckt1qyqsource";
      },
      logout() {},
    },
    walletClient: {
      async transferCkb() {
        return {
          operationId: "op_1",
          txHash: "0xabc",
          resolvedAddress: "ckt1qyqdest",
        };
      },
    },
    paths,
  });

  const result = await service.topUp("1000");
  const pending = JSON.parse(fs.readFileSync(paths.pendingOrdersPath, "utf8"));

  assert.equal(result.success, false);
  assert.equal(result.savedForRetry, true);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].orderId, "order_1");
  assert.equal(pending[0].txHash, "0xabc");
});

test("SustainService no longer enforces local minimum top-up bounds", async () => {
  const paths = createTempPaths();
  const configStore = new SustainConfigStore(paths, {});
  const service = new SustainEngine({
    configStore,
    marketClient: {
      async fetchBalance() {
        return {
          balance: 100,
          userName: "tester",
          email: "test@example.com",
          observedAt: new Date().toISOString(),
        };
      },
      async fetchModels() {
        return [];
      },
      async createOrder() {
        throw new Error("createOrder should not be called in dry-run mode");
      },
      async submitTxHash() {
        throw new Error("submitTxHash should not be called in dry-run mode");
      },
    },
    authService: {
      async getAddress() {
        return "ckt1qyqsource";
      },
      logout() {},
    },
    walletClient: {
      async transferCkb() {
        throw new Error("transferCkb should not be called in dry-run mode");
      },
    },
    paths,
  });

  const result = await service.topUp("1", true);

  assert.equal(result.success, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.amountCkb, "1");
});

test("SustainConfigStore ignores removed top-up bounds from persisted config", () => {
  const paths = createTempPaths();
  fs.mkdirSync(path.dirname(paths.configPath), { recursive: true });
  fs.writeFileSync(
    paths.configPath,
    JSON.stringify({
      minTopUpCkb: 1000,
      maxTopUpCkb: 20000,
      requestTimeoutMs: 31000,
    }),
  );

  const configStore = new SustainConfigStore(paths, {});
  const loaded = configStore.load();

  assert.equal(loaded.requestTimeoutMs, 31000);
  assert.ok(!("minTopUpCkb" in loaded));
  assert.ok(!("maxTopUpCkb" in loaded));

  configStore.set("criticalBalance", "5");

  const persisted = JSON.parse(fs.readFileSync(paths.configPath, "utf8"));
  assert.deepEqual(persisted, {
    requestTimeoutMs: 31000,
    criticalBalance: 5,
  });
});

test("buildSustainOpenClawJobs returns sustain tick and retry jobs", () => {
  const jobs = buildSustainOpenClawJobs({
    tickEvery: "7m",
    retryEvery: "11m",
    session: "isolated",
  });

  assert.equal(jobs.length, 2);
  assert.deepEqual(
    jobs.map((job) => ({
      name: job.name,
      every: job.every,
      session: job.session,
      announce: job.announce,
    })),
    [
      {
        name: "deepsky-sustain-tick",
        every: "7m",
        session: "isolated",
        announce: true,
      },
      {
        name: "deepsky-sustain-retry-orders",
        every: "11m",
        session: "isolated",
        announce: true,
      },
    ],
  );
  assert.match(jobs[0].message, /deepsky sustain health-check --json/);
  assert.match(
    jobs[0].message,
    /deepsky sustain setup openclaw --tick-every 2h --retry-every 11m --session isolated/,
  );
  assert.match(
    jobs[0].message,
    /deepsky sustain setup openclaw --tick-every 1h --retry-every 11m --session isolated/,
  );
  assert.match(
    jobs[0].message,
    /deepsky sustain setup openclaw --tick-every 20m --retry-every 11m --session isolated/,
  );
  assert.match(jobs[0].message, /deepsky sustain top-up <amount> --json/);
  assert.match(
    jobs[0].message,
    /If `newBalance` is unavailable, re-run `deepsky sustain health-check --json` first/,
  );
  assert.match(
    jobs[0].message,
    /If status is still critical, estimate the next CKB amount from the observed credit-per-CKB ratio/,
  );
  assert.match(jobs[0].message, /exchangeAmount/, "tick job should mention exchangeAmount-based estimation");
  assert.match(jobs[0].message, /credit-per-CKB ratio/, "tick job should mention estimation from observed recharge ratio");
  assert.doesNotMatch(jobs[0].message, /deepsky sustain retry-orders --json/);
  assert.match(jobs[1].message, /deepsky sustain retry-orders --json/);
});

test("buildSustainOpenClawJobs disables announce for main session jobs", () => {
  const jobs = buildSustainOpenClawJobs({
    session: "main",
  });

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].announce, false);
  assert.equal(jobs[1].announce, false);
});

test("buildSustainOpenClawJobs can omit retry job", () => {
  const jobs = buildSustainOpenClawJobs({
    includeRetryJob: false,
    tickEvery: "20m",
    retryEvery: "11m",
    session: "isolated",
  });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].name, "deepsky-sustain-tick");
});

test("OpenClaw setup replaces legacy sustain jobs and registers isolated message jobs", async () => {
  const calls = [];
  const jobs = [
    { id: "job_1", name: "market-sustain-tick" },
    { id: "job_2", name: "unrelated-job" },
    { id: "job_3", name: "market-sustain-retry-orders" },
  ];
  let nextId = 4;
  const openclaw = createOpenClawCli(async (args) => {
    calls.push(args);

    if (args[0] === "cron" && args[1] === "list") {
      return {
        stdout: JSON.stringify({
          jobs,
        }),
        stderr: "",
      };
    }

    if (args[0] === "cron" && args[1] === "rm") {
      const index = jobs.findIndex((job) => job.id === args[2]);
      if (index >= 0) {
        jobs.splice(index, 1);
      }
      return {
        stdout: JSON.stringify({ removed: true }),
        stderr: "",
      };
    }

    if (args[0] === "cron" && args[1] === "add") {
      jobs.push({ id: `job_${nextId++}`, name: args[4] });
      return {
        stdout: JSON.stringify({ ok: true, name: args[4] }),
        stderr: "",
      };
    }

    throw new Error(`Unexpected args: ${args.join(" ")}`);
  });

  const result = await openclaw.registerSustainCronJobs({
    tickEvery: "20m",
    retryEvery: "10m",
    session: "isolated",
  });

  assert.equal(result.removed.length, 2);
  assert.deepEqual(
    result.removed.map((job) => job.id),
    ["job_1", "job_3"],
  );
  assert.equal(result.created.length, 2);
  assert.deepEqual(
    result.jobs.map((job) => job.name),
    ["deepsky-sustain-tick", "deepsky-sustain-retry-orders"],
  );
  assert.deepEqual(
    jobs.map((job) => job.name),
    ["unrelated-job", "deepsky-sustain-tick", "deepsky-sustain-retry-orders"],
  );
  assert.deepEqual(
    calls.map((args) => args.slice(0, 3)),
    [
      ["cron", "list", "--json"],
      ["cron", "rm", "job_1"],
      ["cron", "rm", "job_3"],
      ["cron", "add", "--json"],
      ["cron", "add", "--json"],
      ["cron", "list", "--json"],
    ],
  );
  assert.match(calls[3].join(" "), /--message/);
  assert.match(calls[3].join(" "), /--announce/);
});

test("OpenClaw setup removes retry jobs when retry scheduling is disabled", async () => {
  const calls = [];
  const jobs = [
    { id: "job_1", name: "deepsky-sustain-tick" },
    { id: "job_2", name: "deepsky-sustain-retry-orders" },
  ];
  let nextId = 3;
  const openclaw = createOpenClawCli(async (args) => {
    calls.push(args);

    if (args[0] === "cron" && args[1] === "list") {
      return {
        stdout: JSON.stringify({ jobs }),
        stderr: "",
      };
    }

    if (args[0] === "cron" && args[1] === "rm") {
      const index = jobs.findIndex((job) => job.id === args[2]);
      if (index >= 0) {
        jobs.splice(index, 1);
      }
      return {
        stdout: JSON.stringify({ removed: true }),
        stderr: "",
      };
    }

    if (args[0] === "cron" && args[1] === "add") {
      jobs.push({ id: `job_${nextId++}`, name: args[4] });
      return {
        stdout: JSON.stringify({ ok: true, name: args[4] }),
        stderr: "",
      };
    }

    throw new Error(`Unexpected args: ${args.join(" ")}`);
  });

  const result = await openclaw.registerSustainCronJobs({
    tickEvery: "20m",
    retryEvery: "10m",
    session: "isolated",
    includeRetryJob: false,
  });

  assert.deepEqual(
    result.jobs.map((job) => job.name),
    ["deepsky-sustain-tick"],
  );
  assert.deepEqual(
    result.removed.map((job) => job.name),
    ["deepsky-sustain-tick", "deepsky-sustain-retry-orders"],
  );
  assert.deepEqual(
    result.created.map((job) => job.name),
    ["deepsky-sustain-tick"],
  );
  assert.deepEqual(
    jobs.map((job) => job.name),
    ["deepsky-sustain-tick"],
  );
});

test("OpenClaw setup uses system events for main session jobs", async () => {
  const calls = [];
  const jobs = [];
  const openclaw = createOpenClawCli(async (args) => {
    calls.push(args);

    if (args[0] === "cron" && args[1] === "list") {
      return {
        stdout: JSON.stringify({ jobs }),
        stderr: "",
      };
    }

    if (args[0] === "cron" && args[1] === "add") {
      jobs.push({ id: `job_${jobs.length + 1}`, name: args[4] });
      return {
        stdout: JSON.stringify({ ok: true }),
        stderr: "",
      };
    }

    throw new Error(`Unexpected args: ${args.join(" ")}`);
  });

  await openclaw.registerSustainCronJobs({
    session: "main",
  });

  assert.match(calls[1].join(" "), /--system-event/);
  assert.doesNotMatch(calls[1].join(" "), /--message/);
  assert.doesNotMatch(calls[1].join(" "), /--announce/);
});

test("OpenClaw ensureSustainRetryCronJob creates retry job using tick session defaults", async () => {
  const calls = [];
  const jobs = [
    {
      id: "job_1",
      name: "deepsky-sustain-tick",
      session: "main",
      every: "1h",
    },
  ];
  let nextId = 2;
  const openclaw = createOpenClawCli(async (args) => {
    calls.push(args);

    if (args[0] === "cron" && args[1] === "list") {
      return {
        stdout: JSON.stringify({ jobs }),
        stderr: "",
      };
    }

    if (args[0] === "cron" && args[1] === "add") {
      jobs.push({
        id: `job_${nextId++}`,
        name: args[4],
        every: args[6],
        session: args[8],
      });
      return {
        stdout: JSON.stringify({ ok: true, name: args[4] }),
        stderr: "",
      };
    }

    throw new Error(`Unexpected args: ${args.join(" ")}`);
  });

  const result = await openclaw.ensureSustainRetryCronJob();

  assert.equal(result.action, "created");
  assert.equal(result.job.every, "10m");
  assert.equal(result.job.session, "main");
  assert.match(calls[1].join(" "), /--system-event/);
  assert.doesNotMatch(calls[1].join(" "), /--message/);
});

test("OpenClaw removeSustainRetryCronJobs removes retry jobs only", async () => {
  const jobs = [
    { id: "job_1", name: "deepsky-sustain-tick" },
    { id: "job_2", name: "deepsky-sustain-retry-orders" },
    { id: "job_3", name: "market-sustain-retry-orders" },
  ];
  const removedIds = [];
  const openclaw = createOpenClawCli(async (args) => {
    if (args[0] === "cron" && args[1] === "list") {
      return {
        stdout: JSON.stringify({ jobs }),
        stderr: "",
      };
    }

    if (args[0] === "cron" && args[1] === "rm") {
      removedIds.push(args[2]);
      const index = jobs.findIndex((job) => job.id === args[2]);
      if (index >= 0) {
        jobs.splice(index, 1);
      }
      return {
        stdout: JSON.stringify({ removed: true }),
        stderr: "",
      };
    }

    throw new Error(`Unexpected args: ${args.join(" ")}`);
  });

  const result = await openclaw.removeSustainRetryCronJobs();

  assert.equal(result.action, "removed");
  assert.deepEqual(removedIds, ["job_2", "job_3"]);
  assert.deepEqual(
    jobs.map((job) => job.name),
    ["deepsky-sustain-tick"],
  );
});

test("OpenClaw removeSustainCronJobs removes tick and retry jobs only", async () => {
  const jobs = [
    { id: "job_1", name: "deepsky-sustain-tick" },
    { id: "job_2", name: "deepsky-sustain-retry-orders" },
    { id: "job_3", name: "market-sustain-tick" },
    { id: "job_4", name: "market-sustain-retry-orders" },
    { id: "job_5", name: "unrelated-job" },
  ];
  const removedIds = [];
  const openclaw = createOpenClawCli(async (args) => {
    if (args[0] === "cron" && args[1] === "list") {
      return {
        stdout: JSON.stringify({ jobs }),
        stderr: "",
      };
    }

    if (args[0] === "cron" && args[1] === "rm") {
      removedIds.push(args[2]);
      const index = jobs.findIndex((job) => job.id === args[2]);
      if (index >= 0) {
        jobs.splice(index, 1);
      }
      return {
        stdout: JSON.stringify({ removed: true }),
        stderr: "",
      };
    }

    throw new Error(`Unexpected args: ${args.join(" ")}`);
  });

  const result = await openclaw.removeSustainCronJobs();

  assert.equal(result.action, "removed");
  assert.deepEqual(removedIds, ["job_1", "job_2", "job_3", "job_4"]);
  assert.deepEqual(
    jobs.map((job) => job.name),
    ["unrelated-job"],
  );
});

test("OpenClaw setup reports when created jobs are not persisted", async () => {
  const openclaw = createOpenClawCli(async (args) => {
    if (args[0] === "cron" && args[1] === "list") {
      return {
        stdout: JSON.stringify({ jobs: [] }),
        stderr: "",
      };
    }

    if (args[0] === "cron" && args[1] === "add") {
      return {
        stdout: JSON.stringify({ ok: true }),
        stderr: "",
      };
    }

    if (args[0] === "cron" && args[1] === "status") {
      return {
        stdout: JSON.stringify({
          enabled: true,
          jobs: 0,
          storePath: "/tmp/openclaw/jobs.json",
        }),
        stderr: "",
      };
    }

    throw new Error(`Unexpected args: ${args.join(" ")}`);
  });

  await assert.rejects(
    () => openclaw.registerSustainCronJobs({ session: "isolated" }),
    /were not persisted/,
  );
});

test("calculateBurnRate ignores balance increases and averages spend intervals", () => {
  const burnRate = calculateBurnRate([
    { ts: "2026-03-20T00:00:00.000Z", remaining: 100 },
    { ts: "2026-03-20T01:00:00.000Z", remaining: 70 },
    { ts: "2026-03-20T02:00:00.000Z", remaining: 90 },
    { ts: "2026-03-20T03:00:00.000Z", remaining: 60 },
  ]);

  assert.equal(burnRate, 0.5);
});

test("createDefaultPaths defaults to the .deepsky home directory", () => {
  const paths = createDefaultPaths();

  assert.equal(path.basename(paths.homeDir), ".deepsky");
  assert.equal(path.basename(path.dirname(paths.configPath)), "sustain");
});

test("installSkillFromRepository installs all repository skills by default", async () => {
  const calls = [];
  const result = await installSkillFromRepository(
    {
      repositoryUrl: "https://github.com/appfi5/deepsky-tools.git",
    },
    async (command, args) => {
      calls.push([command, ...args]);
      return {
        stdout: "installed",
        stderr: "",
      };
    },
  );

  assert.deepEqual(calls, [
    [
      "npx",
      "--yes",
      "skills",
      "add",
      "https://github.com/appfi5/deepsky-tools.git",
      "--global",
      "--copy",
      "--yes",
    ],
  ]);
  assert.equal(
    result.command,
    "npx --yes skills add https://github.com/appfi5/deepsky-tools.git --global --copy --yes",
  );
  assert.equal(result.skillName, "all repository skills");
  assert.equal(result.global, true);
  assert.equal(result.copy, true);
});

test("installSkillsFromRepositories installs both default skill repositories", async () => {
  const calls = [];
  const result = await installSkillsFromRepositories(
    {},
    async (command, args) => {
      calls.push([command, ...args]);
      return {
        stdout: "installed",
        stderr: "",
      };
    },
  );

  assert.deepEqual(calls, [
    [
      "npx",
      "--yes",
      "skills",
      "add",
      "https://github.com/appfi5/deepsky-tools.git",
      "--global",
      "--copy",
      "--yes",
    ],
    [
      "npx",
      "--yes",
      "skills",
      "add",
      "https://github.com/appfi5/superise-for-agent",
      "--global",
      "--copy",
      "--yes",
    ],
  ]);
  assert.equal(result.label, "Install skills");
  assert.equal(result.skillName, "all skills");
  assert.deepEqual(result.repositoryUrls, [
    "https://github.com/appfi5/deepsky-tools.git",
    "https://github.com/appfi5/superise-for-agent",
  ]);
  assert.deepEqual(result.commands, [
    "npx --yes skills add https://github.com/appfi5/deepsky-tools.git --global --copy --yes",
    "npx --yes skills add https://github.com/appfi5/superise-for-agent --global --copy --yes",
  ]);
});

test("registerSetupCommands exposes a defaults flag for one-shot setup", () => {
  const program = new Command();
  registerSetupCommands(program);

  const command = program.commands.find((item) => item.name() === "openclaw");
  assert.ok(command);

  const defaultsOption = command.options.find((option) => option.long === "--defaults");
  assert.ok(defaultsOption);
  assert.match(defaultsOption.description, /default values/i);
  assert.match(defaultsOption.description, /primary model/i);
});

test("registerSetupCommands describes wallet setup as a prerequisite", () => {
  const program = new Command();
  registerSetupCommands(program);

  const command = program.commands.find((item) => item.name() === "openclaw");
  assert.ok(command);

  const walletOption = command.options.find((option) => option.long === "--skip-wallet-install");
  assert.ok(walletOption);
  assert.match(walletOption.description, /prerequisite/i);
});

test("installSkillFromRepository can still target a single named skill", async () => {
  const calls = [];
  const result = await installSkillFromRepository(
    {
      repositoryUrl: "https://github.com/appfi5/deepsky-tools.git",
      skillName: "deepsky-sustain",
    },
    async (command, args) => {
      calls.push([command, ...args]);
      return {
        stdout: "installed",
        stderr: "",
      };
    },
  );

  assert.deepEqual(calls, [
    [
      "npx",
      "--yes",
      "skills",
      "add",
      "https://github.com/appfi5/deepsky-tools.git",
      "--skill",
      "deepsky-sustain",
      "--global",
      "--copy",
      "--yes",
    ],
  ]);
  assert.equal(
    result.command,
    "npx --yes skills add https://github.com/appfi5/deepsky-tools.git --skill deepsky-sustain --global --copy --yes",
  );
  assert.equal(result.skillName, "deepsky-sustain");
});

test("updateDeepskyProviderConfig installs provider and preserves unrelated config", () => {
  const next = updateDeepskyProviderConfig(
    {
      telemetry: {
        enabled: true,
      },
      models: {
        providers: {
          other: {
            api: "openai-completions",
            models: [{ id: "other-model", name: "Other Model" }],
          },
        },
      },
      agents: {
        defaults: {},
      },
    },
    {
      apiKey: "sk-test",
      models: [
        { id: "qwen3.5-27b", name: "qwen3.5-27b" },
        { id: "qwen3.5-27b", name: "duplicate should be removed" },
      ],
    },
  );

  assert.equal(next.telemetry.enabled, true);
  assert.equal(next.models.providers.other.api, "openai-completions");
  assert.deepEqual(next.models.providers.deepsky, {
    baseUrl: DEFAULT_OPENCLAW_BASE_URL,
    apiKey: "sk-test",
    api: "openai-completions",
    models: [
      {
        id: "qwen3.5-27b",
        name: "qwen3.5-27b",
        api: "openai-completions",
        reasoning: false,
        input: ["text"],
      },
    ],
  });
});

test("updateDeepskyProviderConfig merges selected model into allowlist and primary selection", () => {
  const next = updateDeepskyProviderConfig(
    {
      agents: {
        defaults: {
          models: {
            "deepsky/old-model": {},
            "openai/gpt-4.1": {},
          },
          model: {
            primary: "deepsky/old-model",
            fallbacks: ["deepsky/older-model", "openai/gpt-4o-mini"],
          },
        },
      },
    },
    {
      apiKey: "sk-test",
      models: [{ id: "qwen3.5-27b", name: "Qwen 3.5 27B" }],
      selectedModelId: "qwen3.5-27b",
    },
  );

  assert.deepEqual(next.agents.defaults.models, {
    "openai/gpt-4.1": {},
    "deepsky/qwen3.5-27b": {},
  });
  assert.equal(next.agents.defaults.model.primary, "deepsky/qwen3.5-27b");
  assert.deepEqual(next.agents.defaults.model.fallbacks, ["openai/gpt-4o-mini"]);
});

test("updateDeepskyProviderConfig clears previous deepsky model selections when not switching", () => {
  const next = updateDeepskyProviderConfig(
    {
      agents: {
        defaults: {
          models: {
            "deepsky/old-model": {},
            "deepsky/older-model": {},
            "openai/gpt-4.1": {},
          },
          model: {
            primary: "deepsky/old-model",
            fallbacks: ["deepsky/older-model", "openai/gpt-4o-mini"],
          },
        },
      },
    },
    {
      apiKey: "sk-test",
      models: [{ id: "qwen3.5-27b", name: "Qwen 3.5 27B" }],
    },
  );

  assert.deepEqual(next.agents.defaults.models, {
    "openai/gpt-4.1": {},
    "deepsky/qwen3.5-27b": {},
  });
  assert.deepEqual(next.agents.defaults.model, {
    fallbacks: ["openai/gpt-4o-mini"],
  });
});

test("cleanupDeepskyOpenClawConfig removes provider and deepsky model references", () => {
  const result = cleanupDeepskyOpenClawConfig({
    telemetry: {
      enabled: true,
    },
    models: {
      providers: {
        deepsky: {
          api: "openai-completions",
        },
        existing: {
          api: "openai-completions",
        },
      },
    },
    agents: {
      defaults: {
        models: {
          "deepsky/qwen3.5-27b": {},
          "openai/gpt-4.1": {},
        },
        model: {
          primary: "deepsky/qwen3.5-27b",
          fallbacks: ["deepsky/older-model", "openai/gpt-4o-mini"],
        },
      },
    },
  });

  assert.equal(result.providerRemoved, true);
  assert.deepEqual(result.removedModelRefs, ["deepsky/qwen3.5-27b"]);
  assert.equal(result.selectionChanged, true);
  assert.equal(result.changed, true);
  assert.equal(result.config.telemetry.enabled, true);
  assert.equal(result.config.models.providers.existing.api, "openai-completions");
  assert.ok(!("deepsky" in result.config.models.providers));
  assert.deepEqual(result.config.agents.defaults.models, {
    "openai/gpt-4.1": {},
  });
  assert.deepEqual(result.config.agents.defaults.model, {
    fallbacks: ["openai/gpt-4o-mini"],
  });
});

test("configureDeepskyOpenClaw writes JSON5-compatible config file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-config-"));
  const configPath = path.join(root, "openclaw.json");

  fs.writeFileSync(
    configPath,
    `{
      // existing comment
      models: {
        providers: {
          existing: {
            api: "openai-completions",
            models: [{ id: "existing-model", name: "Existing Model" }],
          },
        },
      },
      agents: {
        defaults: {
          models: {
            "existing/model": {},
          },
        },
      },
    }\n`,
    "utf8",
  );

  const result = configureDeepskyOpenClaw({
    configPath,
    apiKey: "sk-test",
    models: [{ id: "qwen3.5-27b", name: "Qwen 3.5 27B" }],
    selectedModelId: "qwen3.5-27b",
  });
  const persisted = readOpenClawConfig(configPath);

  assert.equal(result.configPath, configPath);
  assert.equal(result.modelCount, 1);
  assert.equal(result.selectedModelRef, createOpenClawModelRef("qwen3.5-27b"));
  assert.equal(persisted.models.providers.deepsky.apiKey, "sk-test");
  assert.equal(persisted.models.providers.existing.api, "openai-completions");
  assert.deepEqual(persisted.models.providers.deepsky.models, [
    {
      id: "qwen3.5-27b",
      name: "Qwen 3.5 27B",
      api: "openai-completions",
      reasoning: false,
      input: ["text"],
    },
  ]);
  assert.equal(
    persisted.agents.defaults.model.primary,
    createOpenClawModelRef("qwen3.5-27b"),
  );
});

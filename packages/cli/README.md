# @superise/deepsky-cli

Standalone sustain CLI for Deepsky.

This package exists so the sustain capability can be moved out of the wallet monorepo while standardizing invocation under `deepsky sustain`. It keeps the sustain part only: balance observation, burn forecast, model listing, top-up orchestration, pending-order retry, and local config/session management.

There is also a top-level `deepsky setup openclaw` flow for configuring OpenClaw to use Deepsky model providers.

## Boundary

The boundary is the same as the old sustain skill:

- The CLI provides primitive operations only.
- The caller decides when to observe, when to top up, and when to retry.

In other words, this package does not "self-plan". It exposes the operations an agent or operator needs to run an observe -> decide -> act loop.

Compared with the upstream wallet monorepo sustain implementation, this extracted package intentionally keeps only the primitive sustain surface, plus a one-click `sustain setup openclaw` flow for recurring sustain checks. It still does not restore `set-model` or `mcp-server`.

## Commands

```bash
deepsky sustain health-check
deepsky sustain forecast
deepsky sustain list-models
deepsky sustain top-up <amount>
deepsky sustain retry-orders
deepsky setup openclaw
deepsky sustain setup openclaw
deepsky clean openclaw
deepsky sustain config show|get|set|unset|reset
deepsky sustain logout
```

Recommended sustain loop:

1. Observe current state with `deepsky sustain health-check --json` and `deepsky sustain forecast --json`.
2. Read guardrails with `deepsky sustain config show` or `deepsky sustain config get <key>`.
3. If needed, inspect pricing with `deepsky sustain list-models --json`.
4. If balance is too low, choose a recharge amount and run `deepsky sustain top-up <amount>`.
5. If a top-up partially failed after transfer submission, run `deepsky sustain retry-orders --json`.
6. If you want recurring self-supervision, run `deepsky sustain setup openclaw`.

`deepsky sustain setup openclaw` registers a keepalive review loop that starts at `20m` and then retunes itself to `2h` when healthy, `1h` when low, and `20m` when critical. Pending-order retry is now on-demand: the retry job is created only after a top-up lands in pending-retry state, and it is removed again after pending orders are cleared or escalated to manual review. The default OpenClaw target is `isolated` so the jobs can announce results back to chat. Use `--tick-every` to change the initial health-check cadence, and `--retry-every` or `--session` to customize the retry job when it is needed.

`deepsky setup openclaw` is separate from sustain setup. It now treats the wallet as a prerequisite before it configures the Deepsky provider side of OpenClaw, unless you pass `--skip-wallet-install`. With the default local SupeRISE Agent Wallet endpoint `http://127.0.0.1:18799/mcp`, setup automatically installs the Docker-backed wallet when it is missing, automatically starts the existing container when it is stopped, and reports that it is already installed when it is already running. When setup performs a fresh install, it also reports the one-time initial Owner password so you can rotate it immediately after the first login. If you pass `--api-key <key>` or set `DEEPSKY_OPENCLAW_API_KEY`, setup uses that key directly after the wallet prerequisite succeeds; otherwise it falls back to wallet login to create one. For non-default wallet MCP URLs, setup checks that the configured wallet health endpoint is reachable and fails early when it is not. After provider setup it can optionally switch the OpenClaw primary model, and then runs `Install skills`, which silently installs all skills from both `https://github.com/appfi5/deepsky-tools.git` and `https://github.com/appfi5/superise-for-agent` in global copy mode. Use `--defaults` to run setup non-interactively with default values, keep the current primary model unchanged, and get a reminder that you still need to switch the OpenClaw primary model to Deepsky manually; use `--skip-wallet-install` to skip the wallet prerequisite step, `--skip-skill-install` to disable `Install skills`, or `--skill-repo <url>` to add one more repository URL to that install step.

`deepsky clean openclaw` removes the Deepsky OpenClaw provider settings and all Deepsky sustain cron jobs. Use `--provider-only` or `--jobs-only` if you only want part of that cleanup.

If OpenClaw is not available or you explicitly prefer app-managed scheduling, you can still use app-level automations to run the same observe -> decide -> act loop on a schedule.

## Runtime Assumptions

This package talks to two systems:

- Wallet MCP, for address lookup, signing, transfer, and wallet metadata
- Deepsky platform services, for balance, model catalog, top-up order creation, and tx-hash submission

Current auth assumption:

- `marketPublicKey` can be configured explicitly, or
- wallet MCP exposes Nervos public identity through `nervos.identity`, including `address` and `publicKey`

The sustain package does not derive the wallet public key locally.

Top-up amount policy is now enforced by the wallet side. The sustain CLI only validates that `<amount>` is a positive CKB amount and forwards the transfer request.

Current local state:

- `~/.deepsky/sustain/config.json`
- `~/.deepsky/market-session.json`
- `~/.deepsky/sustain/observations.json`
- `~/.deepsky/sustain/pending-orders.json`
- `~/.deepsky/sustain/manual-review-orders.json`

Default storage can also be overridden with `DEEPSKY_SUSTAIN_HOME` or `DEEPSKY_HOME`.

## Config

Main config keys:

- `platformBaseUrl`
- `walletMcpUrl`
- `marketPublicKey`
- `criticalBalance`
- `lowBalance`
- `requestTimeoutMs`

Use `deepsky sustain config show` to inspect the effective configuration.

# @deepsky/sustain-cli

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

`deepsky sustain setup openclaw` registers two OpenClaw cron jobs by default: a keepalive review loop every `5m`, and a pending-order retry loop every `10m`. The default OpenClaw target is `isolated` so the jobs can announce results back to chat. Use `--tick-every`, `--retry-every`, or `--session` to customize the schedule target.

`deepsky setup openclaw` is separate from sustain setup. It reuses the existing wallet login flow to create a Deepsky model API key, imports available models into `models.providers.deepsky`, and can optionally switch the OpenClaw primary model.

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

- `~/.superise/sustain/config.json`
- `~/.superise/market-session.json`
- `~/.superise/sustain/observations.json`
- `~/.superise/sustain/pending-orders.json`
- `~/.superise/sustain/manual-review-orders.json`

Default storage can also be overridden with `SUPERISE_SUSTAIN_HOME` or `SUPERISE_HOME`.

These storage and environment variable names are intentionally kept for compatibility during the rename refactor.

## Config

Main config keys:

- `platformBaseUrl`
- `walletMcpUrl`
- `marketPublicKey`
- `criticalBalance`
- `lowBalance`
- `requestTimeoutMs`

Use `deepsky sustain config show` to inspect the effective configuration.

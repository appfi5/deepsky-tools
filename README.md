# SupeRISE Market Tools

SupeRISE Market Tools is a small repository for market sustain operations. It packages the `superise market-sustain` CLI together with an installable agent skill so an agent can observe market balance, forecast runway, top up a market account, retry incomplete recharge orders, and set up recurring OpenClaw sustain checks.

## What It Provides

- A standalone `superise market-sustain` CLI for SupeRISE Market sustain work
- An installable `market-sustain-cli` skill that teaches an agent how to run the sustain loop
- One-click OpenClaw setup for recurring sustain reviews and retry jobs

## Quick Start

If your agent client supports skills, start there first. The skill can teach the agent how to use the sustain CLI and how to bootstrap the CLI when it is missing.

### 1. Install The Agent Skill

This repository currently provides one installable skill:

- `market-sustain-cli`: operate `superise market-sustain`, inspect market state, choose top-up actions, and set up recurring sustain checks

Install it directly from this repository:

```bash
npx skills add https://github.com/appfi5/superise-market-tools --list
npx skills add https://github.com/appfi5/superise-market-tools --skill market-sustain-cli
```

If your client uses a global skill directory, add `-g`. Restart the client after installation so the new skill is loaded.

After the skill is installed, a prompt like this should be enough:

> Help me monitor and sustain my SupeRISE Market account.

### 2. Install The CLI

The CLI is intended to be distributed as an npm package:

```bash
npm install -g @superise/market-sustain-cli
superise market-sustain --help
```

The skill should treat that install as a preflight dependency. If `superise market-sustain` is not available, the agent should install `@superise/market-sustain-cli` globally and verify the command before continuing.

### 3. Common Commands

```bash
superise market-sustain health-check --json
superise market-sustain forecast --json
superise market-sustain top-up <amount>
superise market-sustain retry-orders --json
superise market-sustain setup openclaw
```

## Runtime Assumptions

- Wallet access comes from MCP methods exposed by the local wallet service
- Market login depends on wallet identity and signing support
- Top-up amount limits are enforced by the wallet side, not by local CLI rules

The default local state directory is `~/.superise`.

## Development

For local development:

```bash
cd packages/sustain-cli
bun install
bun run build
bun run test
```

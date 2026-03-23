# Deepsky Tools

Deepsky Tools is a small repository for sustain operations. It packages the `deepsky sustain` CLI together with an installable agent skill so an agent can observe market balance, forecast runway, top up an account, retry incomplete recharge orders, and set up recurring OpenClaw sustain checks.

## What It Provides

- A standalone `deepsky sustain` CLI for Deepsky sustain work
- An installable `deepsky-sustain` skill that teaches an agent how to run the sustain loop
- Interactive OpenClaw provider setup for Deepsky models
- One-click OpenClaw sustain setup for recurring reviews and retry jobs

## Quick Start

If your agent client supports skills, start there first. The skill can teach the agent how to use the sustain CLI and how to bootstrap the CLI when it is missing.

### 1. Install The Agent Skill

This repository currently provides one installable skill:

- `deepsky-sustain`: operate `deepsky sustain`, inspect market state, choose top-up actions, and set up recurring sustain checks

Install it directly from this repository:

```bash
npx skills add https://github.com/appfi5/superise-market-tools --list
npx skills add https://github.com/appfi5/superise-market-tools --skill deepsky-sustain
```

If your client uses a global skill directory, add `-g`. Restart the client after installation so the new skill is loaded.

After the skill is installed, a prompt like this should be enough:

> Help me monitor and sustain my Deepsky account.

### 2. Install The CLI

The CLI is intended to be distributed as an npm package:

```bash
npm install -g @deepsky/sustain-cli
deepsky sustain --help
```

The skill should treat that install as a preflight dependency. If `deepsky sustain` is not available, the agent should install `@deepsky/sustain-cli` globally and verify the command before continuing.

### 3. Common Commands

```bash
deepsky sustain health-check --json
deepsky sustain forecast --json
deepsky sustain top-up <amount>
deepsky sustain retry-orders --json
deepsky setup openclaw
deepsky sustain setup openclaw
```

`deepsky setup openclaw` configures OpenClaw to use Deepsky as a custom provider. It reuses the existing wallet-based login flow, queries available models, creates a model API key, writes `models.providers.deepsky` into `~/.openclaw/openclaw.json`, and can optionally switch the active OpenClaw primary model.

`deepsky sustain setup openclaw` is separate. It only registers the recurring sustain OpenClaw jobs.

## Runtime Assumptions

- Wallet access comes from MCP methods exposed by the local wallet service
- Market login depends on wallet identity and signing support
- Top-up amount limits are enforced by the wallet side, not by local CLI rules

The current compatibility local state directory is still `~/.superise`, and the existing `SUPERISE_*` environment variables remain supported during this rename phase.

## Development

For local development:

```bash
cd packages/sustain-cli
bun install
bun run build
bun run test
```

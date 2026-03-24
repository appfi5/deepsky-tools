# Deepsky Tools

Deepsky Tools is a small repository for sustain operations. It packages the `deepsky sustain` CLI together with an installable agent skill so an agent can observe market balance, forecast runway, top up an account, retry incomplete recharge orders, and set up recurring OpenClaw sustain checks.

## What It Provides

- A standalone `deepsky sustain` CLI for Deepsky sustain work
- An installable `deepsky-sustain` skill that teaches an agent how to run the sustain loop
- Interactive OpenClaw provider setup for Deepsky models
- One-click OpenClaw sustain setup for recurring reviews, plus on-demand retry jobs for abnormal top-up orders

## Quick Start

If your agent client supports skills, start there first. The skill can teach the agent how to use the sustain CLI and how to bootstrap the CLI when it is missing.

### 1. Install The Agent Skill

This repository currently provides one installable skill:

- `deepsky-sustain`: operate `deepsky sustain`, inspect market state, choose top-up actions, and set up recurring sustain checks

Install it directly from this repository:

```bash
npx --yes skills add https://github.com/appfi5/deepsky-tools.git --list
npx --yes skills add https://github.com/appfi5/deepsky-tools.git --global --copy --yes
```

The recommended install uses global copy mode without interactive prompts. Restart the client after installation so the new skill is loaded.

After the skill is installed, a prompt like this should be enough:

> Help me monitor and sustain my Deepsky account.

### 2. Install The CLI

The CLI is intended to be distributed as an npm package:

```bash
npm install -g @deepsky/cli
deepsky sustain --help
```

The skill should treat that install as a preflight dependency. If `deepsky sustain` is not available, the agent should install `@deepsky/cli` globally and verify the command before continuing.

### 3. Configure OpenClaw Through The CLI

The top-level CLI setup is the main bootstrap path when you want OpenClaw to actually use Deepsky models.

Recommended one-shot setup:

```bash
deepsky setup openclaw --defaults
```

That flow:

- prepares the wallet prerequisite first
- creates or reuses the Deepsky provider credentials
- writes the Deepsky provider into `~/.openclaw/openclaw.json`
- installs repository skills from both `https://github.com/appfi5/deepsky-tools.git` and `https://github.com/appfi5/superise-for-agent`
- leaves the current OpenClaw primary model unchanged and reminds you to switch it to Deepsky manually

If you prefer to drive the provider setup yourself, run:

```bash
deepsky setup openclaw
```

### 4. Set Up Recurring Sustain Checks

Once the OpenClaw provider is ready, install the recurring sustain jobs:

```bash
deepsky sustain setup openclaw
```

This step is separate from provider setup. It registers the recurring sustain health-check job, with an adaptive cadence that stretches to `2h` when healthy, tightens to `1h` when low, and runs every `20m` when critical. Retry jobs for abnormal top-up orders are created on demand and automatically cleaned up after pending orders are resolved or escalated for manual review.

### 5. Common Commands

```bash
deepsky sustain health-check --json
deepsky sustain forecast --json
deepsky sustain top-up <amount>
deepsky sustain retry-orders --json
deepsky setup openclaw
deepsky sustain setup openclaw
deepsky clean openclaw
```

`deepsky setup openclaw` configures OpenClaw to use Deepsky as a custom provider first. Before it touches the provider config, it now treats the wallet as a prerequisite unless you pass `--skip-wallet-install`: with the default local wallet MCP endpoint `http://127.0.0.1:18799/mcp`, setup automatically installs the SupeRISE Agent Wallet when it is missing, automatically starts the existing Docker container when it is stopped, and reports that it is already installed when it is already running. When setup performs a fresh install, it also surfaces the one-time initial Owner password so you can rotate it immediately after the first login. If you already have a Deepsky API key, pass `--api-key <key>` or set `DEEPSKY_OPENCLAW_API_KEY`; otherwise setup creates one through wallet login after the wallet prerequisite succeeds. For non-default wallet MCP URLs, setup checks that the configured wallet health endpoint is reachable and fails early when it is not. After provider setup it writes `models.providers.deepsky` into `~/.openclaw/openclaw.json`, can optionally switch the active OpenClaw primary model, and runs `Install skills`, which silently installs all skills from both `https://github.com/appfi5/deepsky-tools.git` and `https://github.com/appfi5/superise-for-agent` in global copy mode. Use `--defaults` to run setup non-interactively with default values, keep the current primary model unchanged, and print a reminder that you still need to switch the OpenClaw primary model to Deepsky manually; use `--skip-wallet-install` to skip the wallet prerequisite step, `--skip-skill-install` to disable `Install skills`, or `--skill-repo <url>` to add one more repository to that install step.

`deepsky clean openclaw` removes the Deepsky custom provider from `~/.openclaw/openclaw.json` and clears Deepsky sustain cron jobs. Use `--provider-only` or `--jobs-only` when you want a narrower cleanup.

## Runtime Assumptions

- Wallet access comes from MCP methods exposed by the local wallet service
- Market login depends on wallet identity and signing support
- Top-up amount limits are enforced by the wallet side, not by local CLI rules

The default local state directory is `~/.deepsky`. You can override storage with `DEEPSKY_SUSTAIN_HOME` or `DEEPSKY_HOME` when needed.

## Development

For local development:

```bash
cd packages/sustain-cli
bun install
bun run build
bun run test
```

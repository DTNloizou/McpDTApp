# Production Deployment Guide

## Prerequisites

- Node.js 24
- `dt-app` CLI (`npx dt-app@latest`)
- Access to the target Dynatrace tenant with **Install apps** permission

## 1. Update Environment URL

Edit `app.config.json` and set `environmentUrl` to the production tenant:

```json
{
  "environmentUrl": "https://<PRODUCTION-TENANT>.apps.dynatrace.com/"
}
```

## 2. Set Up Credentials

The app resolves API keys at runtime via the **Dynatrace Credential Vault**. Before first use, create the following credentials in **Settings > Access Tokens > Credential Vault**:

| Credential | Type | Purpose |
|------------|------|---------|
| Anthropic API key | API Token | Claude LLM calls (if using Anthropic provider) |
| GitHub PAT | API Token | GitHub Models LLM calls (if using GitHub provider) |

Users enter the Vault ID (`CREDENTIALS_VAULT-XXXXXXXX`) in the app's Settings panel. Raw keys are also supported but vault IDs are recommended for production.

## 3. Review Scopes

The scopes in `app.config.json` follow least-privilege. If the production tenant does not need all capabilities (e.g. Davis CoPilot, notebook creation), remove unnecessary scopes before deploying.

## 4. Build & Deploy

```bash
# Type-check
npx tsc -p ui/tsconfig.json --noEmit
npx tsc -p api/tsconfig.json --noEmit

# Audit dependencies
npm audit --omit=dev

# Deploy to production tenant
npx dt-app deploy
```

The `deploy` command builds and uploads the app in one step.

## 5. Post-Deploy Verification

1. Open the app in the Dynatrace launcher
2. Open **Settings** (gear icon) and configure the MCP server URL and credential vault IDs
3. Send a test query to confirm end-to-end connectivity
4. Verify DQL queries execute against Grail (try "list entities" or similar)
5. If using Davis CoPilot integration, confirm the `davis-copilot:conversations:execute` scope is approved

## 6. Version Bumping

Update the version in **both** files before each release:

- `app.config.json` → `app.version`
- `package.json` → `version`

## CI/CD

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR to `main`:

- `npm audit --omit=dev` — dependency vulnerability check
- `tsc --noEmit` — type check UI and API
- `dt-app build` — full production build

To add automated deployment on tags, extend the workflow with a deploy job gated on `github.ref_type == 'tag'`.

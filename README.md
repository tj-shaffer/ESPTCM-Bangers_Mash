# TestForge

Jira-native test case management for Everstory — replaces Excel-based test tracking with a structured, versioned, AI-assisted platform embedded in Jira Cloud.

This repository is a monorepo with two packages:

- [forge-app/](forge-app/) — Atlassian **Forge Custom UI** app (React 18 + Atlassian Design System), rendered inside Jira Cloud.
- [api/](api/) — Node 20 + TypeScript + Express + Prisma backend, deployed to Azure App Service against Azure PostgreSQL.

The Forge frontend calls a resolver in the Forge runtime; the resolver calls the Azure API via `@forge/api` `fetch()` (egress-allowlisted). The internal secret and `accountId` are attached in the resolver, never in the browser.

## Documents

- [CLAUDE.md](CLAUDE.md) — **start here.** Authoritative invariants and dev workflow; supersedes the originals where they disagree.
- [DECISIONS.md](DECISIONS.md) — ADRs for the load-bearing choices (Custom UI, v1 auth, model selection, native fetch, displayId).
- [everstory_testcase_prd.md](everstory_testcase_prd.md) — full PRD (v1.2).
- [testforge_claude_code_brief.md](testforge_claude_code_brief.md) — phased Claude Code build prompts (v1.1).
- [api/AZURE_SETUP.md](api/AZURE_SETUP.md) — Azure CLI provisioning steps.

## Local development

A local Postgres + the API can be brought up with zero cloud credentials. The Forge tunnel/deploy needs an Atlassian dev site on a Custom-UI-capable plan.

```bash
# Postgres (Docker)
docker run --name testforge-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=testforge -p 5432:5432 -d postgres:16

# API
cd api
cp .env.example .env.local       # fill DATABASE_URL + TESTFORGE_INTERNAL_SECRET
npm install
npm run db:migrate
npm run dev                       # http://localhost:3001/health

# Forge app (after `npm i -g @forge/cli` and `forge login`)
cd ../forge-app
npm install
forge lint
# forge tunnel   # needs a Custom-UI-capable Jira dev site
```

## Deployment

Two GitHub Actions workflows in [.github/workflows/](.github/workflows/):

- `api-deploy.yml` — builds `api/` and deploys to Azure App Service (`azure/webapps-deploy@v3`). Requires repo secrets `AZURE_WEBAPP_PUBLISH_PROFILE` and `AZURE_WEBAPP_NAME`.
- `forge-deploy.yml` — runs `forge deploy` on push to `main` for changes under `forge-app/`. Requires `FORGE_EMAIL` and `FORGE_API_TOKEN` secrets.

See [api/AZURE_SETUP.md](api/AZURE_SETUP.md) for Azure resource provisioning.

## Status

**Foundation (Phase 0–1)** — scaffold, schema, API skeleton, Forge Custom UI shell. Buildable offline. Feature phases (repository, plans, execution, AI, vendor tracker, dashboard) follow per the corrected build sequence in [CLAUDE.md](CLAUDE.md).

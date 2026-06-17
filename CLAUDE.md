# CLAUDE.md — TestForge

Authoritative working context for this repo. When this file and the PRD/brief disagree, **this file wins** (it carries the corrections applied during implementation kickoff). Source specs: [everstory_testcase_prd.md](everstory_testcase_prd.md) (the what/why) and [testforge_claude_code_brief.md](testforge_claude_code_brief.md) (phased build prompts). Rationale for the load-bearing choices lives in [DECISIONS.md](DECISIONS.md).

> **⚠️ ARCHITECTURE HAS CHANGED — see [STATUS.md](STATUS.md).** This file predates the Neon/Vercel pivot (DECISIONS.md ADR-009). The app is **no longer a Forge app and no longer on Azure**: it is a standalone Vite SPA + Express/Prisma API on **Neon Postgres / Vercel**. The Forge/Azure descriptions below are kept for history and flagged inline as **[OBSOLETE]**. The domain facts, the env-driven model rule, native-`fetch`, `/search/jql`, UUID/`displayId` PKs, strict TS, and server-side role enforcement all still hold. Auth is now app-managed email+password (ADR-008), not the shared secret described below. Where STATUS.md disagrees with this file, STATUS.md wins.

## What this is

**TestForge** — a Jira-native test case management app for **Everstory** (funeral/cemetery operator), replacing Excel-based test tracking. Monorepo, two packages:

- **`forge-app/`** — **[OBSOLETE wrapper]** Atlassian Forge Custom UI app, embedded in Jira Cloud. *Today this directory holds the standalone Vite + React 18 SPA at `forge-app/static/frontend/`; it is not a Forge app (STATUS.md).*
- **`api/`** — Node 20 + TypeScript (strict) + Express + Prisma backend. **[OBSOLETE: hosted on Azure App Service / Azure PostgreSQL]** — today it runs as a Vercel serverless function against **Neon Postgres**; Azure Blob for files is a future swap.

External services: Anthropic Claude API (AI features), Jira REST v3, Microsoft Teams incoming webhooks.

## Invariants — do not violate

- **[OBSOLETE — no longer a Forge app] Custom UI, NOT UI Kit.** Historically: never `render: native`; Custom UI modules reference a static `resource` + a `resolver`. *No longer applies — the SPA is a plain Vite app (STATUS.md).*
- **[OBSOLETE] Call path.** Historically: frontend → resolver via `@forge/bridge` → Azure API via `@forge/api` `fetch()`. *Today: frontend → Express `POST /api/invoke` directly over HTTP with a Bearer session JWT ([client.ts](forge-app/static/frontend/src/api/client.ts)); the secret/`accountId` handling described here no longer exists.*
- **Anthropic model is env-driven:** `ANTHROPIC_MODEL`, default **`claude-sonnet-4-6`**. Never hardcode a model id. Cheap, high-frequency calls (duplicate detection, step clarity) may use a Haiku-class model. Enable **prompt caching** (`cache_control`) on static system preambles and reusable corpora. Record the resolved model in `AIAnalysis.modelVersion`.
- **HTTP:** use Node 20's built-in global `fetch`. No `node-fetch`. No `@atlassian/jira-rest-api-client` (doesn't exist) — the Jira client is hand-rolled against `/rest/api/3/*`.
- **Jira issue search:** use `/rest/api/3/search/jql` (the legacy `/rest/api/3/issue/search` is deprecated).
- **Primary keys are UUIDs.** Never integer PKs. **Exception:** `TestCase`, `TestPlan`, `VendorChange` carry a separate monotonic `displayId` (autoincrement) rendered as `TC-XXXX` / `TP-XXXX` / `VC-XXXX` — permanent, never reused.
- **[OBSOLETE — no Forge] Never use Forge Storage for primary data.** Moot: the datastore is Postgres (Neon today, Azure later). The underlying point stands — primary data lives in Postgres, never an undersized KV store.
- **TypeScript strict mode** throughout. Roles enforced **server-side** on every API call (the UI only reflects permissions).

## Jira / domain facts

- Defect issue type is **`Problem`** (NOT `Bug`). TestForge-generated Problems are created in project key **`DS`** by default (configurable by Super Admin).
- Vendor codes: **PBX** (Plotbox), **LWS** (Lawson), **CPA** (Coupa), **HG** (Homegrown).
- Teams channels: **IT Applications Team**, **Reporting**.
- Roles: `SUPER_ADMIN`, `TEST_MANAGER`, `TEST_AUTHOR`, `FIELD_OPERATOR`, `OBSERVER`. Unknown `accountId` defaults to `OBSERVER` (read-only).
- Market/region scoping is **deferred to Phase 2**: `markets[]`/`marketScope[]` fields are stored but not enforced in v1.

## Auth (v1 → Sprint 2)

- **[OBSOLETE — superseded by ADR-008] v1 trust boundary:** resolver forwards `x-atlassian-account-id` + a shared secret `x-testforge-internal-secret`. *No longer used. Current auth is app-managed email + password → 7-day session JWT ([api/src/lib/auth.ts](api/src/lib/auth.ts)); `TESTFORGE_INTERNAL_SECRET` now signs that JWT. Azure/Entra SSO is the future target ([docs/AZURE-AD-MIGRATION.md](docs/AZURE-AD-MIGRATION.md)).*
- **Sprint 2:** replace with verifying the Forge remote-invocation JWT (issuer = Forge, audience = this app) and read `accountId` from verified claims. (`jwks-rsa` + `jsonwebtoken` are already deps for this.)

## Local development (no cloud credentials needed)

The whole foundation builds and runs offline against a local Postgres; external integrations are mocked until credentials are provisioned.

```bash
# Postgres for local dev
docker run --name testforge-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=testforge -p 5432:5432 -d postgres:16

# API
cd api
cp .env.example .env.local        # fill DATABASE_URL + TESTFORGE_INTERNAL_SECRET at minimum
npm install
npm run db:migrate                 # prisma migrate dev
npm run db:generate                # prisma generate
npm run dev                        # ts-node-dev; GET http://localhost:3001/health

# Forge app (needs `forge login` + a Custom-UI-capable Jira dev site for tunnel/deploy)
cd ../forge-app
npm install
forge lint                         # validates manifest offline
# forge tunnel / forge deploy require an Atlassian account + dev site (PRD A-1)
```

Required env vars are validated on API boot — a missing one exits with a clear list (see `api/.env.example` and `api/AZURE_SETUP.md`).

## Build sequence (mock-first)

Foundation (done/in progress): Phase 0 scaffold + Prisma schema + CI; Phase 1 API skeleton (auth, authorize, rate limit, `/health`, env validation) + Forge Custom UI shell (`getContext` resolver, `@forge/bridge` client, `AuthContext`).

Then, each feature wired behind injectable service interfaces so it's testable offline: Repository (folders → cases) → Plans/Cycles/Execution (standard + field-operator) → Jira service + issue panel + coverage → Claude service + AI routes → Vendor Change Tracker (demo centerpiece) → Teams notifications → Dashboard → seed data. Only live Jira (Problem creation, issue panel, `/search/jql`) and Anthropic calls require real credentials.

## External-provisioning critical path (track in parallel)

Jira dev site on a Custom-UI-capable plan + service-account token + confirm `DS`/`Problem` exist; `ANTHROPIC_API_KEY`; Azure resources (see `api/AZURE_SETUP.md`); Teams webhook URLs.

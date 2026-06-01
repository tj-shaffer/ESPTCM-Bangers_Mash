# CLAUDE.md — TestForge

Authoritative working context for this repo. When this file and the PRD/brief disagree, **this file wins** (it carries the corrections applied during implementation kickoff). Source specs: [everstory_testcase_prd.md](everstory_testcase_prd.md) (the what/why) and [testforge_claude_code_brief.md](testforge_claude_code_brief.md) (phased build prompts). Rationale for the load-bearing choices lives in [DECISIONS.md](DECISIONS.md).

## What this is

**TestForge** — a Jira-native test case management app for **Everstory** (funeral/cemetery operator), replacing Excel-based test tracking. Monorepo, two packages:

- **`forge-app/`** — Atlassian **Forge Custom UI** app (React 18 + Atlassian Design System), embedded in Jira Cloud.
- **`api/`** — Node 20 + TypeScript (strict) + Express + Prisma backend, hosted on Azure App Service; Azure PostgreSQL primary datastore, Azure Blob for files.

External services: Anthropic Claude API (AI features), Jira REST v3, Microsoft Teams incoming webhooks.

## Invariants — do not violate

- **Custom UI, NOT UI Kit.** Never use `render: native` in `manifest.yml`. Custom UI modules reference a static `resource` (built frontend) + a `resolver` function. Custom UI is required because we use recharts, a drag-and-drop folder tree, TanStack Query, and Zustand — none of which work under UI Kit.
- **Call path:** frontend → resolver via `@forge/bridge` `invoke()`; resolver → Azure API via `@forge/api` `fetch()` (egress-allowlisted under `external.fetch.backend`). The internal secret and `accountId` are attached **in the resolver**, never in the browser.
- **Anthropic model is env-driven:** `ANTHROPIC_MODEL`, default **`claude-sonnet-4-6`**. Never hardcode a model id. Cheap, high-frequency calls (duplicate detection, step clarity) may use a Haiku-class model. Enable **prompt caching** (`cache_control`) on static system preambles and reusable corpora. Record the resolved model in `AIAnalysis.modelVersion`.
- **HTTP:** use Node 20's built-in global `fetch`. No `node-fetch`. No `@atlassian/jira-rest-api-client` (doesn't exist) — the Jira client is hand-rolled against `/rest/api/3/*`.
- **Jira issue search:** use `/rest/api/3/search/jql` (the legacy `/rest/api/3/issue/search` is deprecated).
- **Primary keys are UUIDs.** Never integer PKs. **Exception:** `TestCase`, `TestPlan`, `VendorChange` carry a separate monotonic `displayId` (autoincrement) rendered as `TC-XXXX` / `TP-XXXX` / `VC-XXXX` — permanent, never reused.
- **Never use Forge Storage for primary data** — always Azure PostgreSQL (Forge Storage limits are too small for versioned test history).
- **TypeScript strict mode** throughout. Roles enforced **server-side** on every API call (the UI only reflects permissions).

## Jira / domain facts

- Defect issue type is **`Problem`** (NOT `Bug`). TestForge-generated Problems are created in project key **`DS`** by default (configurable by Super Admin).
- Vendor codes: **PBX** (Plotbox), **LWS** (Lawson), **CPA** (Coupa), **HG** (Homegrown).
- Teams channels: **IT Applications Team**, **Reporting**.
- Roles: `SUPER_ADMIN`, `TEST_MANAGER`, `TEST_AUTHOR`, `FIELD_OPERATOR`, `OBSERVER`. Unknown `accountId` defaults to `OBSERVER` (read-only).
- Market/region scoping is **deferred to Phase 2**: `markets[]`/`marketScope[]` fields are stored but not enforced in v1.

## Auth (v1 → Sprint 2)

- **v1 trust boundary (current):** resolver forwards `x-atlassian-account-id` + a shared secret `x-testforge-internal-secret` (env `TESTFORGE_INTERNAL_SECRET`) over TLS; the backend trusts `accountId` only when the secret matches. Keep the secret long/random and out of the browser.
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

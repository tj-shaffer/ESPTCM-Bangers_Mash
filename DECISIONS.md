# Architecture Decision Records — TestForge

Short ADRs for the load-bearing technical choices. Each records the decision and the reasoning so the choice isn't silently reversed later. These corrections were applied at implementation kickoff after a technical review of [testforge_claude_code_brief.md](testforge_claude_code_brief.md) and [everstory_testcase_prd.md](everstory_testcase_prd.md). The day-to-day rules they imply live in [CLAUDE.md](CLAUDE.md).

---

## ADR-001 — Forge **Custom UI**, not UI Kit

**Status:** Accepted (2026-05-27)

**Context.** The PRD and the brief's prose say "Custom UI (React 18 + ADS)", but the brief's `manifest.yml` declared `render: native` on every module — which is **UI Kit**, a different and mutually exclusive rendering model. The UI prompts also require `recharts`, a drag-and-drop folder tree, TanStack Query, and Zustand.

**Decision.** Use **Custom UI**. Remove `render: native` everywhere; modules reference a built static `resource` + a `resolver` function, with `external.fetch.backend` egress allowlisting.

**Why.** UI Kit renders only a fixed catalog of Forge-provided components and cannot bundle arbitrary npm packages — charts, the DnD tree, TanStack Query, and Zustand are all impossible under it. The product's dashboards and repository UI mandate Custom UI.

**Consequences.** The Jira site must be on a Custom-UI-capable plan (PRD A-1 — verify with the Atlassian admin). The folder tree uses `@atlaskit/pragmatic-drag-and-drop` (the older `@atlaskit/tree` is deprecated).

---

## ADR-002 — v1 auth = shared internal secret; Sprint-2 = Forge remote-invocation JWT

**Status:** Accepted (2026-05-27), v1 interim

**Context.** PRD §11.1 claimed "Forge-issued JWT validated against Atlassian's JWKS endpoint," while the brief also said "trust the accountId header if the internal secret validates." These are different trust models, and the tenant JWKS endpoint (`https://<tenant>.atlassian.net/.well-known/jwks.json`) is **not** the verification source for Forge→backend calls.

**Decision.** **v1:** the resolver forwards `accountId` (`x-atlassian-account-id`) plus a shared secret (`x-testforge-internal-secret`, env `TESTFORGE_INTERNAL_SECRET`) over TLS; the backend trusts `accountId` only when the secret matches. The secret is attached in the resolver and never reaches the browser. **Sprint 2:** verify the Forge remote-invocation JWT (issuer = Forge, audience = this app) against Forge's published keys and read `accountId` from verified claims.

**Why.** The shared-secret approach is a legitimate, low-effort v1 posture for a controlled Forge→Azure path and unblocks all offline development. It is honestly weaker than JWT verification (a leaked static secret allows accountId spoofing), so it is explicitly time-boxed to the pilot and hardened before go-live.

**Consequences.** Keep the secret in Azure Key Vault / App Service config; lock CORS and network egress so only Forge can reach the API. `jwks-rsa` + `jsonwebtoken` remain dependencies for the Sprint-2 upgrade.

---

## ADR-003 — Anthropic model pinned via env (`claude-sonnet-4-6`), feature-tiered, with prompt caching

**Status:** Accepted (2026-05-27)

**Context.** The docs hardcoded `claude-sonnet-4-20250514` (a May-2025 Sonnet 4 snapshot, ~1 year stale by 2026-05 and likely retired) in multiple places.

**Decision.** Read the model from `ANTHROPIC_MODEL` (default **`claude-sonnet-4-6`**) via a single config module — never hardcode. Route cheap, high-frequency calls (duplicate detection, step clarity) to a Haiku-class model. Enable prompt caching (`cache_control`) on static system preambles and the reusable test-case corpus. Persist the resolved model id in `AIAnalysis.modelVersion`.

**Why.** Env-pinning avoids re-coding when models advance and keeps the audit trail accurate (PRD §6.7.3). Feature-tiering + caching directly serve the PRD §7.6 cost-management goals (budget cap, low-cost ops use caching).

**Consequences.** `ANTHROPIC_MODEL` is a documented env var (`.env.example`, App Service config). Cost dashboards (PRD §7.6) read per-call token usage from `AIAnalysis`.

---

## ADR-004 — Native `fetch`; hand-rolled Jira client; `/search/jql`

**Status:** Accepted (2026-05-27)

**Context.** The brief referenced `@atlassian/jira-rest-api-client` (no such maintained package) and `node-fetch` (redundant on Node 20, and its ESM-only v3 breaks the CJS/ts-node-dev dev setup). The Jira `searchIssues` used the deprecated `/rest/api/3/issue/search`.

**Decision.** Use Node 20's built-in global `fetch`. Implement `jiraService.ts` by hand against `/rest/api/3/*` with Basic auth (service-account email + API token). Use `/rest/api/3/search/jql` for issue search.

**Why.** Fewer dependencies, no ESM/CJS friction, and we avoid building on a phantom package or a sunset endpoint.

**Consequences.** No Jira SDK dependency. The hand-rolled client is the single integration point to mock in offline tests.

---

## ADR-005 — Separate `displayId` sequence for human IDs

**Status:** Accepted (2026-05-27)

**Context.** All PKs are UUIDs (good for future multi-tenant), but the PRD requires "TC-XXXX … unique, permanent, never reused," and the UI/Jira summaries depend on a stable human id. The schema had no sequence column.

**Decision.** Add a monotonic `displayId` (`Int @default(autoincrement())`, unique) to `TestCase`, `TestPlan`, and `VendorChange`; format as `TC-${n}` / `TP-${n}` / `VC-${n}` in the app layer.

**Why.** UUIDs are unsuitable as human-facing, monotonic, never-reused identifiers; a dedicated sequence satisfies the requirement without abandoning UUID PKs.

**Consequences.** Two identifiers per entity (UUID for relations/APIs, `displayId` for humans). Keep the UUID as the canonical key in all foreign keys and API paths.

---

## ADR-006 — Demo build is Forge-native (Forge SQL), Azure deferred

**Status:** Accepted (2026-06-16), demo/pilot scope

**Context.** The wider dev team has not yet committed time to stand up the Azure backend (App Service, Azure Postgres, Blob, networking, a new-data-processor security review). The immediate goal is a fast, low-cost win that demonstrates value and earns that commitment.

**Decision.** For the **demo/pilot**, run TestForge entirely inside Atlassian: backend logic lives in Forge **resolver functions** and the datastore is **Forge SQL** (MySQL-compatible). No Atlassian API key is needed — a Forge app gets native installed-app auth. The Azure API + Azure Postgres + Blob design (and ADR-002's resolver→Azure secret hop) is the **production target**, deferred until the demo is funded. Until the Forge dev site is provisioned, an in-memory **seeded `InMemoryStore`** backs local `forge tunnel` demos; `ForgeSqlStore` is the drop-in persistence adapter.

**Why.** Forge-native means zero infra to provision, an inherently private/internal access point (only licensed users in the installed Jira site — no public endpoint to firewall), and test data that stays in the customer's existing Atlassian tenant (a stronger privacy story for Everstory's PII context — no new vendor/data processor). This is the lowest-effort path to something installable and demoable in a real Jira site.

**Consequences.** This deliberately contradicts two CLAUDE.md invariants ("backend on Azure", "never Forge Storage for primary data") **for the demo only** — they remain correct for production. The `frontend → resolver → data-service` seam is preserved (the resolver depends only on the `TestCaseStore` interface), so swapping `InMemoryStore` → `ForgeSqlStore` → a future `AzureApiStore` touches one construction site, not the app. Forge SQL has no Postgres extensions (e.g. no `pgvector`) and resolver invocations have a ~25s timeout, so CSV/Excel parsing is done client-side and AI similarity features will need a non-pgvector approach. The Prisma schema (`api/prisma/schema.prisma`) is retained as the production reference but is not the demo's runtime store.

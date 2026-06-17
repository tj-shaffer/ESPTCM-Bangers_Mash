# TestForge — Current Status (as-built)

**Last updated:** 2026-06-16

> **Read this first.** TestForge pivoted twice during the pilot. Several older
> documents ([README.md](README.md), [CLAUDE.md](CLAUDE.md),
> [everstory_testcase_prd.md](everstory_testcase_prd.md),
> [testforge_claude_code_brief.md](testforge_claude_code_brief.md), and
> [DECISIONS.md](DECISIONS.md) ADR-001/006/007) describe earlier architectures
> that **are no longer how the app runs.** This file is the authoritative
> description of what is actually deployed today. Where any other doc disagrees
> with this one, **this one wins.**

## The pivots (so the older docs make sense)

1. **Original design** — Forge **Custom UI** frontend inside Jira + a separate
   **Azure** App Service / Azure Postgres / Azure Blob backend. (PRD, brief, CLAUDE.md, ADR-001/002)
2. **ADR-006 (2026-06-16)** — for the demo, collapse into a **Forge-native** app
   with **Forge SQL** as the store. (Superseded — never the shipping pilot.)
3. **Current (Neon/Vercel pilot)** — a **standalone web app**: a Vite React SPA
   talking over HTTP to an Express/Prisma API, on **Neon Postgres**, deployed on
   **Vercel**. Recorded in [DECISIONS.md](DECISIONS.md) **ADR-009**.

Azure + Microsoft Entra ID (Active Directory) SSO remain the **eventual
production target**, deferred until funded. That future is documented in
[docs/AZURE-AD-MIGRATION.md](docs/AZURE-AD-MIGRATION.md).

## What runs today

| Concern | Reality |
|---|---|
| Frontend | Vite + React 18 SPA at `forge-app/static/frontend/` (the `forge-app/` nesting is historical — it is **not** a Forge app today). Served by `@vercel/static-build`. |
| Frontend → backend | `VITE_API_MODE=web`: HTTP `POST /api/invoke` with a Bearer session JWT ([client.ts](forge-app/static/frontend/src/api/client.ts)). No Forge bridge in production. |
| Backend | Express app run as a `@vercel/node` serverless function ([api/src/index.ts](api/src/index.ts), [vercel.json](vercel.json)). |
| Database | **Neon Postgres** via Prisma. The schema at [api/prisma/schema.prisma](api/prisma/schema.prisma) is the **live** store (not just a "production reference"). |
| Auth | App-managed **email + password** → 7-day session JWT (ADR-008). Admin-provisioned accounts; no public sign-up. |
| Authorization | Role map enforced server-side at `/api/invoke` ([permissions.ts](api/src/repository/permissions.ts)). Roles: SUPER_ADMIN, TEST_MANAGER, TEST_AUTHOR, FIELD_OPERATOR, OBSERVER. |
| File storage | base64 inline in Postgres (`Attachment.dataBase64`). Azure Blob is a future swap. |
| Integrations | Jira defect creation (service-account token) is live-capable; Anthropic AI + Teams webhooks are **scaffolded but not wired**. |

## Invariants that still hold (from CLAUDE.md)

These survived the pivots and remain true: UUID primary keys + monotonic
`displayId` (TC-/TP-/VC-/PKG-); Anthropic model is env-driven (never hardcoded);
Node 20 built-in `fetch` (no `node-fetch`); hand-rolled Jira client against
`/rest/api/3/*` using `/search/jql`; defect issue type is **`Problem`**;
TypeScript strict mode; roles enforced server-side.

## Invariants that are now obsolete

"Custom UI, not UI Kit" and "never `render: native`" (no longer a Forge app);
"call path frontend → resolver → Azure API via `@forge/api`" (now frontend →
Express directly); "hosted on Azure App Service / Azure PostgreSQL" (now
Vercel/Neon); "never use Forge Storage for primary data" (moot — no Forge).

## Known gaps (see the backlog)

No automated tests; a vestigial Forge layer pending removal; `UserRole.atlassianAccountId`
is misnamed (holds an app UUID, not an Atlassian id). Full list with priorities:
[docs/REVIEW-AND-REMEDIATION-BACKLOG.md](docs/REVIEW-AND-REMEDIATION-BACKLOG.md).

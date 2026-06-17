# TestForge

Jira-adjacent test case management for Everstory — replaces Excel-based test tracking with a structured, versioned platform.

> **⚠️ Read [STATUS.md](STATUS.md) first.** The project pivoted twice; several docs below describe earlier (Forge / Azure) architectures that are no longer how the app runs. STATUS.md is the authoritative current-state description.

## What it is today (pilot)

A **standalone web app** deployed on **Vercel**:

- **Frontend** — a Vite + React 18 SPA (Atlassian Design System spinner aside, custom-styled). Source at [forge-app/static/frontend/](forge-app/static/frontend/). *(The `forge-app/` nesting is historical — it is not a Forge app today; see STATUS.md.)*
- **Backend** — Node 20 + TypeScript + Express + Prisma, run as a Vercel serverless function ([api/](api/)).
- **Database** — **Neon Postgres** (Azure Postgres is the future production target).

The SPA calls the API over HTTP (`POST /api/invoke`) with a Bearer **session JWT**; auth is app-managed email + password (admin-provisioned accounts). See [DECISIONS.md](DECISIONS.md) ADR-008/009.

## Documents

- [STATUS.md](STATUS.md) — **start here.** Authoritative as-built state.
- [DECISIONS.md](DECISIONS.md) — ADRs for the load-bearing choices (incl. ADR-009, the Neon/Vercel pivot).
- [docs/AZURE-AD-MIGRATION.md](docs/AZURE-AD-MIGRATION.md) — forward-looking Azure + Entra/AD migration guide.
- [docs/REVIEW-AND-REMEDIATION-BACKLOG.md](docs/REVIEW-AND-REMEDIATION-BACKLOG.md) — prioritized backlog.
- [CLAUDE.md](CLAUDE.md) — working invariants (some now historical — STATUS.md flags which).
- [everstory_testcase_prd.md](everstory_testcase_prd.md) / [testforge_claude_code_brief.md](testforge_claude_code_brief.md) — original PRD (v1.2) and build brief (v1.1); **point-in-time, pre-pivot**.

## Local development

The API runs against any Postgres (local Docker or a Neon branch) with no other cloud credentials; only `DATABASE_URL` is required to boot.

```bash
# Option A: local Postgres (Docker)
docker run --name testforge-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=testforge -p 5432:5432 -d postgres:16

# API
cd api
cp .env.example .env.local        # fill DATABASE_URL + TESTFORGE_INTERNAL_SECRET
npm install
npm run db:migrate
npm run dev                        # http://localhost:3001/health

# Frontend (standalone Vite SPA)
cd ../forge-app/static/frontend
npm install
npm run dev                        # http://localhost:3000  (mock data, no backend)
```

The frontend has three runtime modes (see [client.ts](forge-app/static/frontend/src/api/client.ts)): `web` (HTTP to the API — the pilot), `standalone` (in-browser mock data, the `npm run dev` default), and a legacy Forge-bridge mode (vestigial, pending removal).

## Deployment

The live pilot deploys on **Vercel** (frontend static build + serverless API) per [vercel.json](vercel.json); the database is **Neon** ([.neon](.neon)).

The `.github/workflows/` contain an **Azure** App Service deploy (`api-deploy.yml`) and a **Forge** deploy (`forge-deploy.yml`). Both are **dormant** — they target the original/future architecture, not the current Vercel pilot. See [docs/AZURE-AD-MIGRATION.md](docs/AZURE-AD-MIGRATION.md) and [api/AZURE_SETUP.md](api/AZURE_SETUP.md) for the eventual Azure path.

## Status

Pilot. Core flows (author → run → QC → approve → report) are implemented end to end. Known gaps and the prioritized cleanup are tracked in [docs/REVIEW-AND-REMEDIATION-BACKLOG.md](docs/REVIEW-AND-REMEDIATION-BACKLOG.md).

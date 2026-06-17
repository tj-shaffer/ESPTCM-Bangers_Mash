# TestForge — Code & UX Review + Remediation Backlog

**Date:** 2026-06-16
**Reviewer:** Engineering review pass (code read of `api/` + `forge-app/static/frontend/`, plus a live mock-mode walkthrough of the UI)
**Scope:** Refactors, removals, UX repairs, docs, tests. Azure/Active-Directory migration is covered separately in [AZURE-AD-MIGRATION.md](AZURE-AD-MIGRATION.md).

> Items are checkboxes so they can be triaged and pulled into sprints. Each carries enough file context to action cold.
>
> **Update (2026-06-16):** the items marked **✅ DONE** below were completed in the follow-up work session — all three P0s plus the Forge-layer removal, stale-CI, and unused-dep cleanups. See the "Completed" note on each.

---

## 1. Executive summary

TestForge ("Bangers & Mash") is in good shape for a pilot: the backend is lean and well-organized, the data model is thoughtful (UUID PKs + human `displayId` sequences), authorization is fail-closed and centralized, and the React frontend is cohesive with a clean "soft brand" design system. The core flows — author → run → QC → approve → report — are all implemented end to end.

The problems are not in the working code; they are in **drift and dead weight** accumulated across two architecture pivots, plus the usual pilot-stage gaps:

1. **The docs describe an app that no longer exists.** The product pivoted **Forge Custom UI + Azure Postgres → Forge-native + Forge SQL → standalone Vite + Express/Prisma/Neon on Vercel.** The code followed; the docs did not. A new engineer reading `README.md`, `CLAUDE.md`, the PRD, or `DECISIONS.md` ADR-006 would build a wrong mental model on day one.
2. **A whole Forge layer is vestigial.** `forge-app/src/` (resolver, in-memory store, a *second* copy of the domain types, seed, webhook handler), `manifest.yml`, the `@forge/bridge` path, and the mock store are not on the live request path.
3. **Zero automated tests.** No runner, no specs. Auth, RBAC, and the run-stage machine are exactly the kind of logic that must not regress, and right now nothing guards them.
4. **One actively-misleading name.** `UserRole.atlassianAccountId` now holds an app-generated `randomUUID()` ([identity.ts:64](../api/src/lib/identity.ts), [:127](../api/src/lib/identity.ts)) — there is no Atlassian account behind it anymore. This is the single biggest footgun for the future Entra/AD migration, because that field is exactly where the Entra `oid` will eventually live.

None of these block the pilot. All of them get more expensive the longer they wait, and #1/#4 actively mislead the next person (human or AI) to touch the repo.

---

## 2. Architecture: as-built vs. as-documented

| Layer | Docs say (CLAUDE.md / README / PRD / ADR-006) | Actually running today |
|---|---|---|
| Frontend host | Forge Custom UI inside Jira | Standalone Vite SPA, served by Vercel static-build |
| Frontend mode | `@forge/bridge` → resolver | `VITE_API_MODE=web` → HTTP `POST /api/invoke` ([client.ts:16,132](../forge-app/static/frontend/src/api/client.ts)) |
| Backend | Forge resolver functions (ADR-006) / Azure App Service (PRD) | Express app as a `@vercel/node` serverless function ([vercel.json](../vercel.json)) |
| Datastore | Forge SQL (ADR-006) / Azure Postgres (PRD) | **Neon Postgres** via Prisma ([.neon](../.neon), [config.ts](../api/src/lib/config.ts)) |
| Auth | Shared-secret `x-testforge-internal-secret` (CLAUDE.md) / Atlassian OAuth (ADR-007) | App-managed email + password → session JWT ([auth.ts](../api/src/lib/auth.ts), ADR-008) |

The Prisma schema is **not** a "production reference" as a couple of code comments still claim — it is the live runtime store. Azure + Active Directory remain the *eventual* target; that future is documented in [AZURE-AD-MIGRATION.md](AZURE-AD-MIGRATION.md).

---

## 3. Live UX walkthrough (mock-mode demo)

Ran the standalone demo (`npm run dev` in `forge-app/static/frontend`, `STANDALONE` mock mode). Findings:

- ✅ **Repository authoring is clean and complete.** 3-pane layout (folder tree → case list → editor). The editor has title, type, priority, status, vendor checkboxes, objective, preconditions, and an inline step builder with per-step "Require a screenshot to mark this step." Empty states are friendly ("Select a test case — Pick one from the list, or create / import to get started").
- ✅ **Import wizard is solid.** A clear 3-step flow (Upload → Map columns → Import) with drag-drop, `.csv/.tsv/.xlsx/.xls` support, and — nicely — a **"Download the standard template"** affordance on the upload step.
- ✅ **No console errors or warnings** during the walkthrough.
- 🔴 **The demo can only show Repository.** [App.tsx:53](../forge-app/static/frontend/src/App.tsx) filters the nav to `n.key === 'repository' || !STANDALONE` — so in mock/standalone mode every other tab (Test Runs, Review Queue, Packages, Dashboard, User Roles) is hidden. The "demo" mode therefore cannot demonstrate the execution, QC, dashboard, or admin flows at all. For a sales/stakeholder demo this is a significant hole; the mock store has data for runs/dashboard but the UI won't surface it.
- 🟠 **Responsive layout overflows instead of stacking.** Below the ~980px breakpoint the 3-pane Repository produces a horizontal scrollbar rather than collapsing cleanly. Fine on a wide monitor; rough on a laptop split-screen or tablet.

> Runs / QC / Dashboard / Admin were reviewed from source (they require the `web` backend to drive live). Their UX items below are code-grounded and should be re-validated against a running `web` deployment.

---

## 4. Remediation backlog

### P0 — correctness & clarity (do first)

- [x] **✅ DONE — Reconcile docs with the as-built stack.** Added authoritative [STATUS.md](../STATUS.md); rewrote root [README.md](../README.md); annotated [CLAUDE.md](../CLAUDE.md) invariants with `[OBSOLETE]` markers; fixed root + `api/` [package.json](../package.json) descriptions; added [DECISIONS.md](../DECISIONS.md) **ADR-009** (Neon/Vercel supersedes Forge-native); stamped the PRD + brief as point-in-time.
- [x] **✅ DONE — Renamed the misleading identity field.** `atlassianAccountId` → `subjectId` across [schema.prisma](../api/prisma/schema.prisma), [identity.ts](../api/src/lib/identity.ts), [dispatch.ts](../api/src/repository/dispatch.ts), and the frontend admin code. Applied to the live Neon DB with a data-preserving `ALTER ... RENAME COLUMN` (+ unique-index rename); 4 user rows preserved. Documented as the Entra-`oid` seam.
- [x] **✅ DONE — Introduced a test runner + first tests.** Added Vitest with 24 passing tests; wired `npm test` into CI (`api-ci` workflow). Covers the highest-consequence logic:
  - auth: `authenticate` → `issueToken` → `verifyToken` → `resolveRole` (incl. unknown-account → `OBSERVER` default).
  - RBAC: `canInvoke(key, role)` for every tier in [permissions.ts](../api/src/repository/permissions.ts) (assert OBSERVER is read-only, FIELD_OPERATOR can't author, only SUPER_ADMIN hits `admin.*`).
  - run-stage machine: [dispatch.ts](../api/src/repository/dispatch.ts) `run.setStage` (tester limited to `COMPLETED_BY_TESTER`) and `run.signOff` (only `READY_FOR_APPROVAL` → sign-off), and the last-super-admin demotion guard (`admin.setRole`).
  - Wire the test script into CI alongside the existing typecheck.

### P1 — remove dead weight

- [x] **✅ DONE — Removed the vestigial Forge layer.** Deleted `forge-app/src/` (resolver, store, duplicate `domain/`, `seed.ts`, `webhookHandler.ts`), `manifest.yml`, `forge-deploy.yml`, orphaned `forge-app/tsconfig.json`; stripped the `@forge/bridge` path from [client.ts](../forge-app/static/frontend/src/api/client.ts) and removed the `@forge/*` deps. Frontend builds + runs clean. **Mock mode kept and later expanded** (see the §3 item below) — the mock now implements the full backend, so standalone exposes every view.
- [ ] **Un-nest the frontend.** The live SPA lives at `forge-app/static/frontend/` despite not being a Forge app. After removing the Forge layer, move it to a top-level `web/` (or `frontend/`) and update [vercel.json](../vercel.json) build/route paths and root `package.json` `demo` script. Cosmetic but removes a standing "why is the web app inside forge-app?" question.
- [x] **✅ DONE — Resolved the Azure CI workflow.** Repurposed `.github/workflows/api-deploy.yml` into `api-ci` (typecheck → test → build on every push/PR); the Azure deploy is now a separate `workflow_dispatch`-only job so it no longer reads as the active pipeline.
- [x] **✅ DONE — Dropped the unused Zustand dependency** from the frontend `package.json`.

### P1 — refactor (safety & maintainability)

- [x] **✅ DONE — Replaced hand-cast payloads in `dispatch.ts` with zod schema validation.** Added per-key schemas ([schemas.ts](../api/src/repository/schemas.ts)) validated via `parse(key, payload)`; dispatch arms now consume typed, validated input with no `as` casts. Matches prior behavior exactly (same required fields + user-facing messages, unknown keys stripped, enums mirror the frontend). `DispatchError` extracted to [errors.ts](../api/src/repository/errors.ts) to break the schema↔dispatch cycle. Verified: typecheck clean, 35 tests, and a live smoke against Neon (real reads pass; an invalid `createCase` → `400 "Title is required"`).
- [x] **✅ DONE — Audit log captures before/after.** Replaced the never-mounted post-response middleware with [audit.ts](../api/src/lib/audit.ts): a baseline change-log row per successful mutation (actor, action=key, entity, ip) in the invoke route, plus before/after rows for the two security-critical state changes — `admin.setRole` (role before/after) and `run.signOff` (stage → decision). `recordAudit` never throws (audit can't break a request).
- [x] **✅ DONE — Centralized role tiers.** Added `isManager(role)` to [permissions.ts](../api/src/repository/permissions.ts) (backed by the `MANAGE` tier) and used it in the `dispatch.ts` run-stage gate, so the stage logic and the permission map can't drift.

### P1 — UX repairs

- [x] **✅ DONE — Fixed the demo nav gap (§3).** Expanded the standalone mock ([mockInvoke.ts](../forge-app/static/frontend/src/mock/mockInvoke.ts)) into a full in-browser backend — runs/executions/packages/dashboard/admin, seeded with sample runs (one failing, one ready-for-approval), a package, and users — and removed the `App.tsx` nav filter. Every view now works in the demo; verified live (Test Runs + QC + approval, Dashboard charts, Packages, Users & Roles), no console errors.
- [ ] **Fix responsive overflow.** The Repository 3-pane should stack (or make the detail pane scroll independently) below ~980px instead of forcing a page-level horizontal scrollbar. (`theme.css` media query + the `.esp-main`/`.esp-detail` min-widths)
- [~] **Add deep linking / URL routing.** **✅ Tab-level DONE** — the active view is now synced to the URL hash (`#dashboard`, `#runs`, …) in [App.tsx](../forge-app/static/frontend/src/App.tsx), so tabs are linkable/bookmarkable and a refresh keeps your tab (no longer always lands on Repository). **Still open:** per-entity deep links (link straight to a specific test case / run).
- [x] **✅ DONE — Repository navigation affordances.** "Move test case to another folder" — the editor header has a "📁 Folder" picker (flattened tree) that reparents via `updateCase` and refreshes both folder lists. Plus **folder-path breadcrumbs** in the editor header (root → leaf) and the list-pane toolbar.
- [x] **✅ DONE — Bulk operations on cases.** The case list ([TestCaseList.tsx](../forge-app/static/frontend/src/features/repository/TestCaseList.tsx)) has per-row checkboxes + a "select all", and a bulk action bar to **set status** (Draft/Active/Deprecated/Archived) or **delete** the selection. Author-gated; refreshes the lists + tree counts.
- [ ] **Don't encode status with color alone.** Priority/status/execution badges rely on color (`esp-prio-*`, `esp-exec-*`). Add an icon or text marker for colorblind users, and an ARIA label. Broader: the custom controls (tree rows, step buttons, modals) have minimal ARIA — a focused accessibility pass is warranted.
- [x] **✅ DONE (already implemented) — Explain disabled controls.** The screenshot-gated step buttons in [ExecutionRunner.tsx](../forge-app/static/frontend/src/features/runs/ExecutionRunner.tsx) are disabled *and* show a visible "📎 Attach a screenshot above to mark this step." hint plus a button tooltip — not just a greyed button.
- [ ] **Polish attachment download.** Attachments are base64 data-URLs; downloads lack a filename and there's no preview page. Serve with a proper `download` filename and content-type. (This pairs with the Blob-storage migration in the Azure doc.)
- [x] **✅ DONE (promoted) — Packages is a supported feature.** Decision: keep it first-class. It's in the nav, surfaced in the run-creation flow (package picker in `NewRunModal`), filterable on the dashboard, and now fully demoable via the expanded mock. No "experimental" framing remains in the UI. *(Member-run-list virtualization for very large packages remains a future nice-to-have.)*

### P2 — hardening & deferred

- [ ] **Surface the 12 MB upload limit.** `express.json({ limit: '12mb' })` ([api/src/index.ts](../api/src/index.ts)) rejects larger screenshots with an opaque error. Validate client-side and show a clear message; document the limit.
- [ ] **Enforce (or remove) the AI budget.** `AI_MONTHLY_BUDGET_USD` is read into config but never checked. Either gate AI calls on cumulative `AIAnalysis` token cost or drop the var so it doesn't imply a control that doesn't exist.
- [ ] **Document the rate-limiter key trade-off.** [rateLimiter.ts](../api/src/middleware/rateLimiter.ts) keys on `accountId ?? ip`; note the shared-budget edge case for multi-session users.
- [ ] **Self-service password reset.** No mail service, so resets are admin-issued temp passwords. Tracked as FE-1 in [ENHANCEMENTS.md](../ENHANCEMENTS.md) (Resend). Keep deferred; just don't lose it.
- [ ] **Label AI features as not-yet-wired.** The `AIAnalysis` model and Anthropic config exist but no dispatch key calls Claude. Note "scaffolded, deferred" in STATUS.md so it isn't mistaken for a live capability (duplicate detection, step-clarity, etc. from the PRD).

---

## 5. What is genuinely good (keep / don't churn)

- **Fail-closed authorization** centralized in one map ([permissions.ts](../api/src/repository/permissions.ts)); unknown accounts default to `OBSERVER`; last-super-admin demotion is guarded.
- **The identity seam** ([identity.ts](../api/src/lib/identity.ts), [auth.ts](../api/src/lib/auth.ts)) is genuinely provider-agnostic — the AD swap is a new caller of `issueToken`, not a rewrite (see the Azure doc).
- **Data model**: UUID PKs + monotonic `displayId` (TC-/TP-/VC-/PKG-) is the right call; cascading deletes and indexes are in place.
- **Config validation fails fast** on boot with a clear missing-var list ([config.ts](../api/src/lib/config.ts)).
- **Design system** is cohesive and the empty/loading states are considered. The single-`invoke`-key dispatch contract keeps the three (now one) backends interchangeable.
- **DECISIONS.md** is a real asset — every load-bearing choice is dated and justified. Keep writing ADRs (the next ones: Neon/Vercel supersession, the field rename, the AD cutover).

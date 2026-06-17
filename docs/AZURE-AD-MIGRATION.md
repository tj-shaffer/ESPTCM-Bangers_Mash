# Azure + Active Directory Migration — Anticipation Guide

**Status:** Forward-looking documentation. **No code in this document is implemented**, and nothing here should be built until the migration is funded and Everstory IT provisions the Azure subscription + Entra app registration. This is the playbook so that when that day comes, the path is known and the seams are already in the right places.

**Date:** 2026-06-16
**Companion docs:** [REVIEW-AND-REMEDIATION-BACKLOG.md](REVIEW-AND-REMEDIATION-BACKLOG.md) (current-state issues), [DECISIONS.md](../DECISIONS.md) (ADRs), [api/AZURE_SETUP.md](../api/AZURE_SETUP.md) (raw provisioning CLI — predates the Neon pilot; refresh per §6).

---

## 1. Where we are vs. where we're going

| | **Today (pilot)** | **Target (production)** |
|---|---|---|
| Frontend host | Vercel static-build (Vite SPA) | Azure Static Web Apps **or** App Service (serve built SPA) |
| API host | Vercel serverless (`@vercel/node`) | Azure App Service (Linux, Node 20/22), container or zip deploy |
| Database | Neon Postgres (serverless) | Azure Database for PostgreSQL — Flexible Server |
| File storage | base64 in Postgres (`Attachment.dataBase64`) | Azure Blob Storage (`attachments` container) |
| Secrets | Vercel/host env vars | Azure Key Vault references on App Service |
| **Identity** | App-managed email + password → session JWT | **Microsoft Entra ID (Azure AD) OIDC SSO** → session JWT |
| Authorization | Role map in DB (`UserRole.role`) | **Unchanged** — same role map, identity sourced from Entra |

The two big workstreams are **infrastructure** (host/DB/blob/secrets — mostly mechanical, covered by [AZURE_SETUP.md](../api/AZURE_SETUP.md)) and **identity** (email/password → Entra OIDC — the part that needs design). The good news, detailed below, is that the codebase was built with the identity swap in mind.

---

## 2. The identity seam — why the AD swap is small

Authentication and authorization are already separated. **Authorization never learns where identity came from**; it only consumes a resolved `accountId` + `Role`. Three files form the seam:

| File | Function | Role today | Role after AD |
|---|---|---|---|
| [api/src/lib/auth.ts](../api/src/lib/auth.ts) | `issueToken(accountId, displayName)` / `verifyToken(token)` | Mints/verifies our **own** 7-day session JWT | **Unchanged.** Entra is just a new caller of `issueToken` after it validates the Entra token. |
| [api/src/lib/identity.ts](../api/src/lib/identity.ts) | `resolveRole(accountId)`, `authenticate(email,password)`, user CRUD | Verifies passwords, resolves role | `authenticate` is **replaced** by an Entra callback; `resolveRole` and user CRUD **stay**. |
| [api/src/middleware/requireAuth.ts](../api/src/middleware/requireAuth.ts) | `requireAuth` | Reads `Authorization: Bearer <our jwt>`, sets `req.accountId` | **Unchanged.** Still reads our own session JWT. |

**Key design point:** we keep minting our **own** session JWT even after adopting Entra. Entra is used once, at login, to *prove who you are*; from then on the app uses its short-lived session token exactly as today. This means [requireAuth.ts](../api/src/middleware/requireAuth.ts), [dispatch.ts](../api/src/repository/dispatch.ts), [permissions.ts](../api/src/repository/permissions.ts), the `Role` enum, and the entire frontend `invoke` contract **do not change**.

### What changes

1. **A new login route replaces `POST /api/login`.** Instead of accepting `{email, password}`, the app runs the OIDC Authorization Code flow (with PKCE):
   - `GET /api/auth/login` → redirect the browser to Entra's `authorize` endpoint (`scope=openid profile email`, plus an app `roles` claim if you choose to source roles from Entra groups/app-roles).
   - `GET /api/auth/callback` → exchange the `code` for tokens, **validate the Entra ID token** (signature against the tenant JWKS, `iss`, `aud`, `exp`, `nonce`), extract the stable user id (`oid`) and `email`/`name`, upsert the `UserRole` row, then call the existing `issueToken(oid, name)` and hand the session JWT back to the SPA.
   - Libraries `jwks-rsa` + `jsonwebtoken` are **already dependencies** (added for the long-deferred Forge-JWT plan; they fit OIDC validation directly).
2. **`authenticate()` (password path) is removed**, along with `password.ts`, the `passwordHash`/`mustChangePassword` columns, the admin "reset password" / "change password" dispatch keys, and the bootstrap-admin password seeding. (Keep a **break-glass** local admin behind an env flag for the cutover window — see §7.)
3. **`ensureBootstrapAdmin()`** changes from "seed a password" to "ensure a named Entra user (by email/`oid`) has `SUPER_ADMIN`," or is replaced by the break-glass path.

### What explicitly does NOT change

- [permissions.ts](../api/src/repository/permissions.ts) — the `PERMISSIONS` map and `canInvoke` are identity-provider-agnostic.
- The `Role` enum and all role-gating in [dispatch.ts](../api/src/repository/dispatch.ts).
- `resolveRole(accountId)` — still a DB lookup keyed by the stable subject id.
- The frontend `AuthContext` / `getContext` contract — the SPA still calls `getContext` and reads `{accountId, displayName, role}`.

---

## 3. Schema & data deltas

Grounded in [api/prisma/schema.prisma](../api/prisma/schema.prisma):

- **`UserRole.atlassianAccountId` → carries the Entra `oid`.** This column is *already* the subject key resolved everywhere (`resolveRole`, `getContext`, every `admin.*`). Today it holds an app `randomUUID()` ([identity.ts:64](../api/src/lib/identity.ts), [:127](../api/src/lib/identity.ts)). **Rename it now** (P0 in the backlog) to `subjectId`/`userId` so it isn't doubly-wrong (it's neither an Atlassian id today nor an Entra id yet). At cutover, backfill each row's `subjectId` with the user's Entra `oid` (matched by `email`).
- **Drop** `passwordHash`, `mustChangePassword` once the password path is gone.
- **Optionally add** `entraTenantId` (for multi-tenant safety) and keep `email`, `displayName` (now sourced from Entra claims on each login).
- **Roles**: decide the source of truth — either (a) continue managing `role` in the DB via the admin panel (simplest; Entra only authenticates), or (b) map Entra **app roles / security groups** → `Role` at login (centralizes governance in Entra, removes the in-app admin panel). Recommendation: **(a) for the first cut** — smaller change, keeps the working admin UI — then consider (b) once SSO is stable.

### Attachment storage (Postgres base64 → Blob)

- Today `Attachment.dataBase64` stores the file inline. The store interface (`TestCaseStore`, `addAttachment`/`getAttachment` in [dispatch.ts](../api/src/repository/dispatch.ts)) is the seam.
- Target: upload bytes to the Blob `attachments` container, store the blob reference (container + key + content-type + size) on `Attachment`, serve via short-lived SAS URLs.
- Backfill: migrate existing base64 rows to Blob; keep a read fallback (if `dataBase64` present, serve it) until backfill completes, then drop the column. Pairs with the "proper download filename" UX item in the backlog.

---

## 4. Environment & secrets deltas

New/changed env vars (validated in [api/src/lib/config.ts](../api/src/lib/config.ts), which already fails fast on missing required vars):

| Var | Purpose |
|---|---|
| `ENTRA_TENANT_ID` | Entra tenant (directory) id — builds the OIDC issuer/authority URL |
| `ENTRA_CLIENT_ID` | App registration (application) id |
| `ENTRA_CLIENT_SECRET` | App registration secret (→ Key Vault) — or use a federated credential / managed identity |
| `ENTRA_REDIRECT_URI` | `https://<prod-host>/api/auth/callback` |
| `OIDC_DISCOVERY_URL` *(derivable)* | `https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration` |
| `TESTFORGE_INTERNAL_SECRET` | **Keep** — still signs our session JWT ([auth.ts](../api/src/lib/auth.ts)). Move to Key Vault. |
| `DATABASE_URL` / `DIRECT_URL` | Repoint from Neon to Azure Postgres (pooled vs. direct for migrations) |
| `AZURE_STORAGE_*` | Blob account/connection for attachments |
| Removed | `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (replaced by break-glass, §7) |

**Secrets:** every secret above (Entra client secret, internal secret, DB password, storage key, Jira service-account token) should be an App Service **Key Vault reference** (`@Microsoft.KeyVault(SecretUri=...)`), not a plaintext app setting. The config loader reads them as ordinary env vars, so no code change is needed — only the deployment wiring.

---

## 5. Entra app registration checklist (for IT)

1. Register a single-tenant app in Entra ID; note **tenant id** + **application (client) id**.
2. Add a **Web** redirect URI: `https://<prod-host>/api/auth/callback`.
3. Create a **client secret** (or configure a federated credential / managed identity to avoid a stored secret).
4. API permissions: delegated `openid`, `profile`, `email`, `User.Read` (Microsoft Graph) — grant admin consent.
5. *(Only if sourcing roles from Entra — option (b) in §3)* define **App Roles** (`SUPER_ADMIN`, `TEST_MANAGER`, `TEST_AUTHOR`, `FIELD_OPERATOR`, `OBSERVER`) and assign users/groups; ensure the `roles` claim is emitted in the ID token.
6. Decide token lifetime / conditional access policies with IT security.

---

## 6. Infrastructure migration (Neon/Vercel → Azure)

[api/AZURE_SETUP.md](../api/AZURE_SETUP.md) has the CLI for resource group, Postgres Flexible Server, App Service (B2), Blob, firewall, and GitHub secrets — but it predates the Neon pilot and assumes a Forge/Azure split. **Refresh it** to: (a) drop Forge references, (b) add the SPA host (Static Web Apps or App Service), (c) add the Entra app-registration step, (d) add Key Vault + references.

- **Database:** `pg_dump` from Neon → `pg_restore`/`prisma migrate deploy` into Azure Postgres. Keep `DATABASE_URL` (pooled) + `DIRECT_URL` (direct, for migrations) as today.
- **CI/CD:** the repo already has `.github/workflows/api-deploy.yml` targeting Azure App Service (currently dormant — see backlog). Revive it (typecheck → test → build → prune dev deps → deploy) and add the SPA build/deploy.
- **Health probe:** `/health` ([api/src/routes/health.ts](../api/src/routes/health.ts)) is anonymous and DB-checked — use it as the App Service health check.

---

## 7. Cutover runbook (outline)

1. **Pre:** provision Azure (DB, App Service, Blob, Key Vault, Entra app); refresh `AZURE_SETUP.md`; build + test the Entra login path in a staging slot; load-test.
2. **Break-glass:** ship a single env-gated local admin login (`BREAK_GLASS_*`) so you can administer the app if Entra/SSO is misconfigured at go-live. Remove after the window closes.
3. **Data:** freeze writes on the pilot; `pg_dump` Neon → Azure Postgres; run the `subjectId` rename migration; backfill `subjectId` from Entra `oid` (match on `email`); migrate attachments base64 → Blob.
4. **Deploy:** API + SPA to Azure with Key Vault-referenced secrets; smoke-test `/health`, an Entra login, `getContext`, and one end-to-end run.
5. **Switch:** repoint DNS / Static Web App to Azure; monitor logs, `/health`, and auth success rate.
6. **Rollback:** keep the Neon/Vercel pilot live and DNS-revertible until Azure is proven for a defined soak period; the session-JWT design means a revert only needs the old host back.
7. **Post:** drop password columns + break-glass; rotate any secret exposed during cutover; archive audit logs to a cool-tier Blob (already anticipated in the data model).

---

## 8. Risks & open decisions

- **Role source of truth** — DB-managed (keep admin panel) vs. Entra app-roles/groups. Recommend DB-managed for the first cut.
- **`subjectId` backfill correctness** — relies on `email` matching between the pilot accounts and Entra. Verify the mapping before freezing writes; handle users with no Entra account.
- **Field operators & SSO** — confirm every field operator has an Entra identity and a device/flow that can complete interactive OIDC; if some don't, the password path can't simply disappear for them without a plan.
- **Session vs. Entra token lifetime** — our session JWT is 7 days ([auth.ts](../api/src/lib/auth.ts)); reconcile with Entra conditional-access/token policies and decide on silent refresh.
- **Multi-tenant hygiene** — validate `tid`/`iss` on the Entra token even for a single-tenant app.

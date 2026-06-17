# TestForge — Future Enhancements

Forward-looking ideas captured for later, not yet scheduled. (Distinct from the
inline "ENHANCEMENTS #N" markers in the code, which reference already-implemented
behaviors.) Each entry should carry enough context to pick up cold.

---

## FE-1 — Automated account-invite & password-reset emails

**Status:** Deferred (captured 2026-06-17). Pilot ships without it.

**Context.** Authentication is app-managed email + password, admin-provisioned
(see [DECISIONS.md](DECISIONS.md) ADR-008). Today the flow is fully manual: a
Super Admin sets a temporary password when creating a user and hands off the
credentials out-of-band (Teams / message / in person); the user is forced to
change it on first login. There is **no mail service wired** (no Resend/SMTP),
which is why the pilot needed zero email infrastructure. This works for a small
internal group but doesn't scale and puts temp passwords in chat history.

**Idea.** Add automated transactional email so account provisioning and
password resets are self-service:
- **Invite on create:** when an admin adds a user, email them a link to set
  their own password (a signed, single-use, time-limited token) instead of the
  admin choosing a temp password and relaying it.
- **Self-service reset:** a "Forgot password?" link on the login screen that
  emails a reset token — removing the admin from the reset loop entirely.

**Sketch (when picked up).**
- **Provider:** Resend is the natural fit (simple API, generous free tier). The
  team already uses **Microsoft Teams incoming webhooks** (see CLAUDE.md) — if
  notification-only delivery is acceptable, a Teams card with the invite link is
  a lower-setup alternative, but it can't reach external/not-yet-onboarded
  addresses, so email is the more general answer.
- **Tokens:** reuse the existing JWT signing approach (`issueToken`/`verifyToken`
  in `api/src/lib/auth.ts`) for short-lived, purpose-scoped invite/reset tokens
  (e.g. `{ sub: accountId, kind: 'invite' | 'reset' }`, ~30–60 min TTL,
  single-use). New routes: `POST /api/auth/invite-accept`, `POST /api/auth/reset`.
- **Schema:** the `UserRole.mustChangePassword` flag already models "needs to set
  a password"; an invited user can be created with a null/locked `passwordHash`
  until they complete the invite. Optionally track token issuance to enforce
  single-use.
- **Backend:** new `api/src/lib/mailer.ts` behind an interface (so it's mockable
  offline like the other integrations); `RESEND_API_KEY` + `MAIL_FROM` as
  optional env (app still boots without them, falling back to today's manual
  temp-password flow).
- **Frontend:** a "set your password" landing page for the invite/reset token;
  a "Forgot password?" link on `LoginGate`.

**Why deferred.** No mail service is provisioned, and the manual handoff is
adequate for the pilot's user count. Revisit once the user base grows or before
a wider rollout.

---

## FE-2 — Drag-and-drop grouping & reusable presets

**Status:** Paused (captured 2026-06-17). Was the second half of the original
"Week 5" plan ([docs/ENHANCEMENTS-2026-06-16.md](docs/ENHANCEMENTS-2026-06-16.md)
#4); the approval sign-off half (#11) shipped, this was deferred.

**Context.** Today composition is checkbox-based and functional:
- A run is built in `NewRunModal` (`features/runs/RunsView.tsx`) by ticking test
  cases from a flat list.
- A package is built in `NewPackageModal` (`features/runs/PackagesView.tsx`) by
  ticking existing runs.

In the June 16 stakeholder call, Vileyka/Mohammad wanted to **group test cases
within a run so they "drop in" easily for the full end-to-end**, and TJ proposed
**presets** ("I know these three cases are always part of this run — save it") and
**drag-and-drop** (how LeapWork demoed it). None of that is blocking — the
checkbox flow covers the need — so it was parked as a UX upgrade.

**Idea.**
- **Drag-and-drop composition:** drag test cases from the repository/list into a
  run builder, and drag runs into a package, instead of (or alongside) the
  checkboxes. Reorder within a run/package by dragging.
- **Reusable presets:** save a named bundle of test cases (and/or runs) and apply
  it when creating a run/package, so recurring sets (e.g. "Discount Management
  smoke") don't get hand-picked every time.

**Sketch (when picked up).**
- **Presets (backend):** a `Preset` model — `id`, `name`, `kind` (`RUN` |
  `PACKAGE`), `itemIds String[]` (case ids or run ids), `ownerAccountId`,
  `projectKey`. Dispatch keys `preset.list` / `preset.create` / `preset.delete`,
  gated `AUTHOR` in both `permissions.ts` maps (server + frontend mirror). Store
  methods alongside the run/package ones in `prismaStore.ts`.
- **Presets (frontend):** in `NewRunModal` / `NewPackageModal`, a "Load preset"
  dropdown that pre-checks the bundled items, and a "Save selection as preset"
  action. New hooks in `api/runs.ts`.
- **Drag-and-drop:** prefer `@dnd-kit/core` (keyboard-accessible, no legacy HTML5
  drag quirks) over a heavier board library. Scope it to the two builders first;
  reordering is cosmetic until run/package item order is persisted (would need an
  `order` column on the join).
- **Verification:** presets verify cleanly headless (store/dispatch integration +
  the file round-trip pattern used elsewhere); DnD interactions need a browser
  with a manager/author-role login, so plan a `preview`-driven pass for that part.

**Why paused.** Checkbox composition already works; this is ergonomics. Presets
are the higher-value half (real reuse) and are fully verifiable offline — worth
doing first when this is picked back up, with drag-and-drop as the follow-on
polish.

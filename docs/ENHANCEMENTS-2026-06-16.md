# TestForge — Enhancement Plan from Stakeholder Feedback

**Source:** "Testing Applications" meeting recording, June 16, 2026
**Attendees:** Mohammad Khan (BSS/QA lead — controls Jira & QC), Vileyka Lizardo (process & organization), David Brodecki, TJ Shaffer (builder)
**Status:** Backlog derived from transcript. Mohammad asked for a **weekly cadence** — "a few things to focus on each week until we're at a stable level, then enhance." Get the core rolling soon.

This plan maps each piece of feedback to the current data model (`forge-app/static/frontend/src/domain/types.ts`, `api/src/middleware/authorize.ts`) and proposes the change.

> **Identity assumption (current state).** The pilot has **no per-user identity**: login is a single
> shared password (`TESTFORGE_PASSWORD`) that mints one JWT hardcoded to subject `'pilot-user'`
> (`api/src/lib/auth.ts`), and every run/case/execution is attributed to that same `'pilot-user'`.
> The `Role` enum + `authorize()` middleware exist but are **inert** (nothing assigns roles, the
> `/api/invoke` dispatch path runs no per-action checks). **Real identity and roles are deferred to
> the future Azure AD / Active Directory (SSO) state** — see "Deferred — Future-State Identity &
> Roles" below. Until then, the identity-dependent workflow features (run assignment #5, QC gate #10,
> approval sign-off #11) are built as **workflow state + names, not enforced permissions** — fully
> usable on the single-user pilot, and hardened into real role enforcement when SSO lands.

---

## Guiding themes from the conversation

1. **Three-level hierarchy: Test Case → Run → Package.** A *package* groups several runs for a full end-to-end review. This is the biggest structural addition.
2. **Humans control Jira, not the app.** No auto-creating bug tickets. Testers fail steps; managers confirm and link.
3. **A controlled approval pipeline:** Tester completes → Manager QC-reviews → Approver (leadership) signs off — all in-app, with email + due dates, replacing the current email-and-spreadsheet process.
4. **Evidence is mandatory:** screenshots/attachments on runs, with per-step "screenshot required" enforcement.
5. **Organize so 1,000 test cases stay usable:** folders by application → functionality, drag-and-drop grouping, presets.

---

## Enhancements (by priority)

### P0 — Core structure & workflow (target first 2–3 weeks)

#### 1. CSV/Excel import template
- **Said:** Mohammad — "we need a template for the import… a standard template with columns" so Excel files import cleanly. Current import couldn't read his multi-tab document. Vileyka/Mohammad preferred a fixed template over per-upload field mapping.
- **Current:** Import exists (`ImportedCaseRow`, `ImportResult`) with configurable mapping; no canonical template; multi-tab Excel unsupported.
- **Do:**
  - Ship a downloadable **standard template** (`.xlsx`/`.csv`) with fixed columns: Title, Objective, Preconditions, Test Type, Priority, Vendor(s), Step Order, Action, Test Data, Expected Result.
  - Keep configurable mapping as a fallback, but default to template.
  - Support **multi-tab workbooks** (each tab = a folder/functionality, or a documented "one tab" rule).

#### 2. Repository organization: folders by application → functionality
- **Said:** Vileyka — group by **application, then functionality** (PlotBox → GPL/formatting, AVA, cancellations; Lawson; etc.). Mohammad — collapse to folders first; open a folder to see its test cases, so the selection screen isn't a flat list of 1,000.
- **Current:** `TestFolder`/`FolderNode` tree already exists (parent/child, `vendorCode`, `testCaseCount`).
- **Do:**
  - Default the repository view to **collapsed folders**; expand to reveal cases.
  - Encourage two-level convention: Application folder → Functionality subfolder.
  - Add **search/filter** across the tree so large case lists stay navigable.

#### 3. Packages — the third grouping level
- **Said:** TJ/Vileyka/Mohammad converged: "a third category — test case, a run, and a **package**, which is several runs put together." Used for the full end-to-end. Vileyka: link dependent functionalities (e.g., commissions-net-of-trust depends on discount thresholds + commission thresholds) so an end-to-end run pulls them all together.
- **Current:** No package concept. Runs are flat (`CreateRunInput`, `TestRunSummary`).
- **Do:**
  - New `Package` entity (UUID + `displayId` `PKG-XXXX` per the displayId convention) that contains ordered **runs**.
  - **Label/type packages** (Vileyka): name + type dropdown reusing `TestType` (Regression, UAT, Manual/Functional) so a package definition can drive what's included.
  - Roll up package status from its runs on the dashboard.

#### 4. Drag-and-drop grouping + presets
- **Said:** TJ — repository screen does double duty: select cases → "create a package/run," and **save as a preset** (a known set always included in a run). Vileyka — group test cases within a run so they "drop in" easily for the end-to-end; this is how LeapWork demoed it. TJ — "maybe drag-and-drop."
- **Do:**
  - Drag-and-drop to compose **runs from cases** and **packages from runs**.
  - **Presets / saved selections**: reusable named bundles of cases/runs.

#### 5. Assign a run to a user *(identity-light)*
- **Said:** Mohammad — "for each test run we need to assign it to a user… that will be Dave's test run that he can complete."
- **Current:** No assignee on runs.
- **Do:** Add an `assigneeName` to a run — free text or a **seeded team-member list** (Mohammad, Vileyka, Dave, …) — set at run creation, plus a **"filter runs by assignee"** view.
- **Works now / hardens at SSO:** Records *who the run is for* with no login enforcement (single `'pilot-user'`). At SSO: convert `assigneeName` to a real user reference and enforce a true "My runs" view per logged-in identity.

#### 6. Attachments & screenshots on execution
- **Said:** Mohammad — "a big one": testers must be able to add **screenshots/attachments** on a test run. Plus a **per-step toggle set by the case builder: "screenshot required"** — the step can't be completed (pass/fail/anything) without one.
- **Current:** No attachment model on `ExecutionStepResultView`/`ExecutionDetail`.
- **Do:**
  - Attachment support at step and/or execution level (Azure Blob per CLAUDE.md; or the pilot's storage).
  - `screenshotRequired: boolean` on `TestStep`; execution blocks step completion until an attachment exists.

---

### P1 — Defect linking & statuses

#### 7. Manual Jira linking — NOT auto-creation
- **Said:** Mohammad (strong, Dave agreed): **do not auto-create bug tickets** on fail — testers mark fails that are often user error; auto-creation floods Jira with noise. Managers confirm a real bug, then create the ticket themselves and link it. Vileyka — at minimum let us **enter the Jira ticket number** for tracking/follow-up (Coupa testing surfaced many fails to track). Link to the **test case** (likely) rather than run. Ticket creation is a **system-admin control, not an end-user control**.
- **Current:** `DefectView` already has `jiraIssueKey`/`jiraUrl`; `CreateDefectInput` exists.
- **Do:**
  - **Manual "link Jira issue" field** on a failed case/step — enter an existing key, store key + URL. No automatic creation.
  - "Manager confirms, then creates/links" is a **process convention** in the pilot (everyone is `'pilot-user'`); the *enforced* restriction of defect/Jira actions to manager/admin roles arrives with SSO (see deferred section).
  - (Later, when Jira integration lands) an **optional** manager-only "create Jira issue" button — never automatic, never tester-accessible.
  - Jira context from the meeting: Jira is used for **bug tracking**; bugs tie to a **task or epic** (e.g., epic = "Discount Management Thresholds"). Decision on task-vs-epic linkage deferred, but keep the defect link flexible.

#### 8. New result dispositions: Blocked vs. Nice-to-have/Enhancement
- **Said:** Today they use **Pass / Fail / NA** ("sufficient… gotten us by for years"). Vileyka — "Blocked" conflates two things: *blocked now, do next iteration* vs. *needed now*. Wants a separate **"Nice to have / Enhancement request"** disposition. A blocked-for-future could feed a future-sprint task (manager-controlled, like defects).
- **Current:** `ExecutionStatus` has `PASS/FAIL/BLOCKED/SKIPPED/...` but no enhancement/nice-to-have.
- **Do:**
  - Add an **`ENHANCEMENT` / "Nice to have"** disposition distinct from `BLOCKED`.
  - Keep Pass/Fail/NA primary; treat the rest as additional options so the familiar workflow is intact.

> **#9 Role hierarchy (Approver, Read-only, etc.) is deferred** to the Future-State Identity & Roles
> section below — it has no effect without per-user identity, which arrives with Azure AD / SSO.

---

### P2 — Approval pipeline, dashboard & notifications

#### 10. QC review gate before approval *(identity-light)*
- **Said:** Mohammad — testers sometimes complete runs with **no screenshots, no detail**. Manager must do a **quality-control review** of the whole script (notes, pass/fail sanity) **before it goes to Alex**. Vileyka agreed — "QC of the test results." TJ — a **queue/tab** of completed runs awaiting validator review.
- **Do:**
  - Run **lifecycle state machine**: `COMPLETED_BY_TESTER → IN_QC_REVIEW → READY_FOR_APPROVAL → APPROVED`.
  - A **review-queue** tab listing tester-completed runs/packages awaiting QC.
  - Only after QC pass can it advance to an approver.
- **Works now / hardens at SSO:** The states and queue are fully functional now; **anyone can advance** a run (no identity to gate on). At SSO: restrict the "advance / QC-pass" action to manager/admin roles.

#### 11. In-app approval / sign-off *(identity-light)*
- **Said:** Vileyka — today approval is **email + a rebuilt summary script**, fully offline (e.g., send Commission-Net-of-Trust results to Alex, wait via email). Wants approval **in the app**, per **run or package** — "let us choose what we need approval on." Approver wants **both a summary and drill-down detail** (Alex reviews the summary, then opens each case to confirm thorough testing).
- **Do:**
  - **Approver view** scoped to a package/run: summary (pass/fail counts, coverage) **+ per-case detail** with steps, notes, attachments.
  - **Sign-off action** records approver **name** + decision + timestamp as run state — replacing email approval.
  - Approval can target a **package** (end-to-end may need several packages bundled for one review — Vileyka).
- **Works now / hardens at SSO:** Sign-off is **honor-system** now (the recorded approver name is entered/selected, not authenticated). At SSO: restrict the sign-off action to the **Approver** role and bind it to the verified identity.

#### 12. Email notifications + due dates
- **Said:** TJ proposed — when a run/package is QC-approved and sent, **auto-email the approver**; assign approvers per run type; **due date** on the approval (Vileyka: "but the due date?"). Email recipients via a dropdown of people. (TJ: email plumbing is "another animal" but doable.)
- **Do:**
  - Notification on **completion/sent-for-approval** to the assigned approver.
  - **Due dates** on approval requests; recipient picker.
  - Per-run-type **default approver** mapping.
  - (CLAUDE.md notes Teams webhooks exist — consider Teams notification as an alternative/companion to email.)

#### 13. Dashboard: filter by package/run + export
- **Said:** Vileyka — dashboard should **filter by package or test run** and **export** results, in a **summarized fashion** for the approver (plus detail, per #11).
- **Current:** `DashboardData` exists but is "immature" (TJ); no package filter or export.
- **Do:**
  - Filters by **package / run / type**.
  - **Export** (PDF/Excel) — summary + detail — usable as the approval artifact.

---

### Deferred — Future-State Identity & Roles (post Azure AD / SSO)

This is the foundation that makes #9 (and real enforcement of #5, #7, #10, #11) meaningful. It is
intentionally **out of the near-term backlog** — it ties into the company's future **Azure AD /
Active Directory** environment, not the pilot.

- **#9 Role hierarchy (deferred here).** Mohammad's roles: **Test Case Creator / System Admin**,
  **Tester**, **Approver** (leadership, e.g., Alex), plus **Read-only** ("public link… for other
  stakeholders"). The server-side enum already exists (`SUPER_ADMIN`, `TEST_MANAGER`, `TEST_AUTHOR`,
  `FIELD_OPERATOR`, `OBSERVER`); `OBSERVER` already covers read-only. An **Approver** concept is the
  one addition.
- **Real per-user identity from Azure AD / Active Directory SSO** — replaces the shared
  `'pilot-user'` subject; populate the real `accountId` from verified SSO claims
  (`api/src/lib/auth.ts`, `api/src/routes/invoke.ts`).
- **Wire `authorize()` into the `/api/invoke` dispatch path** for per-action enforcement (it exists
  but is currently unused on that path).
- **Super Admin admin screen to assign roles** *(chosen assignment mechanism)* — a small in-app page
  where a Super Admin sets each user's role; no DB access required, visible to stakeholders.
- **Flip the identity-light features to enforced:** #5 "My runs" per real user; #7 defect/Jira
  actions manager-only; #10 QC-advance manager-only; #11 sign-off Approver-only and bound to the
  verified identity.

---

## Suggested weekly sequencing (per Mohammad's cadence)

| Week | Focus |
|------|-------|
| 1 | CSV template (#1) + repository folder collapse/search (#2) — unblocks loading real cases |
| 2 | Packages model + labeling (#3) + run assignment, identity-light (#5) |
| 3 | Attachments + screenshot-required (#6) + new dispositions (#8) |
| 4 | Manual Jira link (#7) + QC review queue / lifecycle states (#10) |
| 5 | In-app approval / sign-off, identity-light (#11) + drag-and-drop grouping & presets (#4) |
| 6 | Notifications, due dates, approver mapping (#12) + dashboard filters & export (#13) |
| Later | **Azure AD / SSO identity + roles + Super Admin admin screen** (deferred section) — flips the identity-light features to enforced |

> David Brodecki's framing: *"Even if we get 80% there, we can tweak along the way — it beats what we have today."* Ship the controlled pipeline early; refine drag-and-drop, presets, and dashboard polish after.

## Open decisions to confirm with stakeholders
- **Identity & roles are deferred to the Azure AD / SSO state** (decided) — near-term workflow
  features run identity-light. Remaining open items:
- Defect link target: **test case vs. test run** (Mohammad leaned test case).
- Jira bug parent: **task vs. epic**, and whether it depends on current-sprint vs. future.
- Whether "Nice to have / Enhancement" is a **step disposition**, a **case-level flag**, or its own backlog feed.
- Approval granularity: per-run vs. per-package vs. bundle-of-packages for end-to-end.

# Product Requirements Document
## Everstory TestForge — Jira-Native Test Case Management Platform
**Version:** 1.2  
**Author:** Second 9 Labs, LLC (on behalf of Everstory IT)  
**Date:** May 2026  
**Status:** Approved — Ready for Development  
**Changelog v1.2:** Technical corrections applied during implementation kickoff — Anthropic model is now env-driven (`ANTHROPIC_MODEL`, default `claude-sonnet-4-6`) rather than a pinned legacy snapshot; §11.1 auth corrected to the actual v1 trust boundary (shared internal secret) with Forge remote-invocation JWT verification slated for Sprint 2; removed the non-existent `@atlassian/jira-rest-api-client` dependency and `node-fetch` (Node 20 has native `fetch`); Jira issue search targets `/rest/api/3/search/jql`.  
**Changelog v1.1:** Open questions resolved; market/region scope deferred to Phase 2; Vendor Change Tracker promoted to Week 1 demo; timeline confirmed aggressive-go.

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [User Roles & Personas](#4-user-roles--personas)
5. [Core Feature Set](#5-core-feature-set)
6. [Detailed Feature Specifications](#6-detailed-feature-specifications)
7. [AI Enhancements](#7-ai-enhancements)
8. [Integrations](#8-integrations)
9. [Technical Architecture](#9-technical-architecture)
10. [Data Model](#10-data-model)
11. [Security & Compliance](#11-security--compliance)
12. [Environment Strategy](#12-environment-strategy)
13. [Reporting & Analytics](#13-reporting--analytics)
14. [Non-Functional Requirements](#14-non-functional-requirements)
15. [Future Enhancements (Roadmap)](#15-future-enhancements-roadmap)
16. [Timeline & Milestones](#16-timeline--milestones)
17. [Open Questions & Assumptions](#17-open-questions--assumptions)
18. [Claude Code Implementation Brief](#18-claude-code-implementation-brief)

---

## 1. Executive Summary

Everstory operates funeral homes and cemeteries, managing complex workflows across plot inventory, sales, and field operations. The IT division manages product enhancements through vendors (Plotbox, Lawson, Coupa) and homegrown tools. Currently, test cases are tracked in Excel — a brittle, unsearchable, unversioned, and unintegrated approach that creates audit risk, accountability gaps, and no visibility for leadership.

**TestForge** is a Jira-native test case management application built on Atlassian Forge (Custom UI), with an Azure-hosted backend. It is purpose-built for Everstory's unique operating model: a small IT/PO team that authors and manages test cases, decentralized field operators who execute them, and a vendor-driven release calendar that demands structured regression accountability.

TestForge is not a clone of Zephyr or Xray. It learns from their strengths, solves their most-complained-about limitations (pricing, performance, rigid UI, weak AI), and introduces net-new capabilities tailored to Everstory — including a Vendor Change Impact Tracker, a field-operator execution mode, and AI-assisted test case generation powered by the Anthropic Claude API.

---

## 2. Problem Statement

| Pain Point | Current State | Impact |
|---|---|---|
| Test cases live in Excel | No versioning, search, or traceability | Rework, missed regression coverage |
| No Jira linkage | Defects tracked separately | Can't measure story-level test coverage |
| No field operator participation | IT owns all execution | No decentralized accountability |
| No vendor change awareness | Manual tracking | Regression gaps when vendors ship changes |
| No environment tracking | Dev/test/staging/prod conflated | Bugs found in wrong environments |
| No leadership visibility | No dashboards | No data for sprint reviews or vendor escalations |
| Zephyr/Xray cost | $10+/user × 1,000 Jira users | $10k–$15k+/year for ~15 actual testers |

---

## 3. Goals & Success Metrics

### Primary Goals
- **G1:** Replace Excel-based test case management with a structured, versioned, searchable system embedded in Jira.
- **G2:** Enable field operators to execute test cases without requiring Jira authoring permissions.
- **G3:** Establish traceability from Jira stories/epics → test cases → test results → defects.
- **G4:** Surface vendor change events and automatically flag impacted test cases.
- **G5:** Provide AI-assisted authoring to reduce time-to-test-coverage.

### Success Metrics (90-Day Post-Launch)
- 100% of active vendor-related Jira stories have linked test cases
- Test case execution time reduced by ≥ 40% vs. Excel baseline
- Zero test-related defect escapes attributed to missing regression coverage
- ≥ 80% of field operator test assignments completed on time
- Leadership dashboard viewed weekly by PO team and above

---

## 4. User Roles & Personas

### Role Hierarchy

```
Super Admin (System)
    └── Test Manager (PO / IT Lead)
            ├── Test Author (PO / IT Team)
            │       └── Test Reviewer (optional approval workflow)
            ├── Field Operator (Execute-only)
            └── Observer / Leadership (Read-only dashboards)
```

### Role Definitions

| Role | Description | Permissions |
|---|---|---|
| **Super Admin** | Manages app configuration, roles, environments | Full access + config |
| **Test Manager** | Owns test plans, assigns execution, reviews results | Create/edit/delete/assign all |
| **Test Author** | Creates and maintains test cases and suites | Create/edit own, read all |
| **Field Operator** | Executes assigned test cases; no authoring | Execute assigned only |
| **Observer** | Leadership / read-only stakeholders | Read + dashboard only |

> **Note on Market/Region Scoping:** Market and region-level role segmentation is deferred to Phase 2. v1 treats all users as organization-wide. The data model will reserve a `markets[]` field on the Role entity to ensure forward compatibility — it will simply not be enforced in v1 logic.

---

## 5. Core Feature Set

### Module Overview

| Module | Description | Priority |
|---|---|---|
| **Test Repository** | Hierarchical library of test cases, organized by folder/suite | P0 |
| **Test Plans** | Collection of test suites targeted at a release, vendor, or sprint | P0 |
| **Test Execution** | Run test cases, record results, attach evidence | P0 |
| **Jira Traceability** | Link test cases to Jira stories; surface results inside Jira issues | P0 |
| **Defect Management** | Auto-create Jira bugs from failures with duplicate detection | P0 |
| **Environment Tracking** | Tag test executions to specific environments | P0 |
| **Role Management** | RBAC with org-wide scope (market scoping deferred to Phase 2) | P0 |
| **Dashboard & Reporting** | Test coverage, pass/fail metrics, team progress | P0 |
| **AI Test Authoring** | Generate test cases from Jira story descriptions | P1 |
| **AI Coverage Gaps** | Identify stories with missing or thin test coverage | P1 |
| **Vendor Change Tracker** | Log vendor releases, auto-flag impacted test cases | P1 |
| **Teams Notifications** | Push test run events to Microsoft Teams channels | P1 |
| **Test Case Versioning** | Track changes to test cases over time | P1 |
| **Audit Log** | Immutable record of all system actions | P1 |

---

## 6. Detailed Feature Specifications

---

### 6.1 Test Repository

The Test Repository is the canonical library of all test cases across the organization. It is structured, versioned, and searchable.

#### 6.1.1 Folder / Suite Hierarchy
- Folders can be nested up to **5 levels deep**: `Vendor > Product Area > Feature > Test Suite > Test Case`
- Example: `Plotbox > Plot Inventory > Plot Transfer > Regression Suite > TC-001: Verify plot status changes to SOLD after transfer`
- Folders support drag-and-drop reordering
- Folders can be tagged to a **Vendor** (Plotbox/PBX, Lawson/LWS, Coupa/CPA, Homegrown)
- Folders support a `market` tag field (reserved for Phase 2 enforcement; not surfaced in v1 UI)

#### 6.1.2 Test Case Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| ID | Auto-increment (TC-XXXX) | Auto | Unique, permanent, never reused |
| Title | Text | Yes | Concise action statement |
| Objective | Text | No | Why this test exists |
| Preconditions | Text | No | System state before test begins |
| Test Type | Enum | Yes | Regression, UAT, Manual Functional, Smoke, Exploratory |
| Priority | Enum | Yes | Critical, High, Medium, Low |
| Status | Enum | Yes | Draft, Active, Deprecated, Archived |
| Vendor | Multi-select | No | PBX (Plotbox), LWS (Lawson), CPA (Coupa), HG (Homegrown), N/A |
| Market | Multi-select | No | Reserved — Phase 2. Field stored but not enforced in v1 |
| Environment | Multi-select | No | Dev, Test, Staging, Prod |
| Linked Jira Stories | Jira Issue Picker | No | 1..N stories linked |
| Labels / Tags | Multi-select | No | Free-form tagging |
| Owner | User Picker | Yes | Accountable author |
| Version | Auto | Auto | Increments on each edit |
| Created / Updated | Timestamps | Auto | |
| Estimated Duration | Minutes | No | Helps plan execution windows |

#### 6.1.3 Test Steps
Each test case contains an ordered list of steps:

| Field | Type | Notes |
|---|---|---|
| Step # | Auto | Ordered, reorderable |
| Action | Text | What the tester does |
| Test Data | Text | Specific inputs (plot number, user, etc.) |
| Expected Result | Text | What should happen |
| Actual Result | Text | Filled during execution |
| Step Status | Enum | Pass / Fail / Blocked / Skipped |
| Notes | Text | Tester notes during execution |
| Attachment | File | Screenshot, video link (future) |

Steps support **substeps** (one level deep) for complex multi-part actions.

#### 6.1.4 Test Case Versioning
- Every save creates a new immutable version snapshot
- Version history is viewable inline (diff view: what changed between v2 and v3)
- A test case can be **"rolled back"** to any prior version by a Test Manager
- A version can be **"locked"** — marking it as the canonical version used in a specific audit period
- Version metadata: who changed it, when, and what fields changed

#### 6.1.5 Clone & Reuse
- Any test case can be cloned into the same or different folder
- Cloned cases are independent (not linked) but display a "Cloned from TC-XXXX" attribution
- **Test Step Library**: Individual steps can be saved to a shared step library and inserted into any test case. Changes to a shared step propagate to all test cases using it (with a confirmation prompt).

#### 6.1.6 Bulk Operations
- Bulk edit: Priority, Status, Owner, Labels, Environment
- Bulk assign to Test Plan
- Bulk clone
- Bulk archive/deprecate

---

### 6.2 Test Plans

A Test Plan represents an organized testing effort — typically tied to a vendor release, sprint, or UAT cycle.

#### 6.2.1 Test Plan Fields

| Field | Type | Notes |
|---|---|---|
| ID | Auto (TP-XXXX) | |
| Name | Text | e.g., "Plotbox v4.2 — Q3 2026 Regression" |
| Description | Text | Scope, goals |
| Type | Enum | Regression, UAT, Smoke, Full Cycle |
| Vendor | Select | Optional vendor association |
| Status | Enum | Draft, Active, Completed, Archived |
| Target Environment | Select | Dev / Test / Staging / Prod |
| Linked Jira Epic | Jira Issue Picker | Optional |
| Market Scope | Multi-select | Limits to specific markets |
| Start / End Date | Date | |
| Owner | User Picker | |
| Test Suites | Linked suites | N test suites per plan |

#### 6.2.2 Test Cycles
Within a Test Plan, testers create **Test Cycles** — specific execution runs of a subset of test cases.

- A Test Plan can have multiple cycles (e.g., "Cycle 1 — Initial Run", "Cycle 2 — Post-Fix Rerun")
- Cycles track: assigned tester(s), environment, execution window, and aggregate pass/fail
- Cycle progress bar is surfaced in the Test Plan view and in the Jira project panel

#### 6.2.3 Execution Assignment
- Test cases within a cycle can be assigned to specific users (including field operators)
- Assignment can be made individually or bulk-assigned by market or role
- Assignees receive a **Microsoft Teams notification** (see §6.8)
- Field operators only see their assigned test cases in a simplified "My Assignments" view

---

### 6.3 Test Execution

#### 6.3.1 Execution Interface — Standard (Author/Manager)
- Full step-by-step execution panel with pass/fail/blocked/skip per step
- Inline notes per step
- Ability to add attachments per step (screenshots, files)
- Execution timer (optional — track how long execution takes)
- "Quick Execute" mode: mark all steps pass in one click (for smoke/known-good)
- Execution can be paused and resumed (state is saved)

#### 6.3.2 Execution Interface — Field Operator Mode
Field operators need a distraction-free, instruction-forward UI. Key design principles:
- Shows **only assigned test cases**, filtered by their market
- Steps displayed one at a time in a wizard-style flow
- Large, tap-friendly Pass / Fail / Blocked buttons (mobile-ready in roadmap)
- No access to test case editing, test plans, or other testers' work
- "Needs Clarification" flag — operator can flag a step for IT review without failing it
- Completion triggers a Teams notification to the assigning Test Manager

#### 6.3.3 Execution Statuses

| Status | Description |
|---|---|
| **Not Started** | Assigned, not yet opened |
| **In Progress** | Tester has opened and begun |
| **Pass** | All steps passed |
| **Fail** | One or more steps failed |
| **Blocked** | Cannot execute — precondition unmet or environment issue |
| **Skipped** | Intentionally bypassed for this cycle (with required reason) |

#### 6.3.4 Defect Linkage from Execution
When a step is marked **Fail**, the tester is presented with:
1. **Duplicate Detection Panel**: AI-powered search of open Jira bugs matching the test case title, failed step, and linked story. Shows top 3 potential matches with similarity scores.
2. **Link Existing Bug**: Tester selects an existing Jira issue to link to this failure.
3. **Create New Bug**: Pre-fills a Jira bug with test case ID, step detail, environment, expected vs. actual result, test plan name, and tester. Test Manager approves before submission (configurable).

Duplicate detection uses the Claude API to semantically compare the failure description against open bug summaries in the linked Jira project (not just keyword matching).

---

### 6.4 Jira Traceability

#### 6.4.1 Linking Test Cases to Stories
- From within TestForge: link any test case to one or more Jira issues via issue picker
- From within a Jira issue: a **TestForge panel** is injected into the Jira issue detail view (via Forge Issue Panel) showing:
  - All linked test cases (TC-ID, title, status, last execution result)
  - Coverage summary: X of Y test cases passing
  - Quick link to run a new test cycle for this story
  - Last execution date

#### 6.4.2 Coverage View (Epic / Story level)
- Epic-level view: aggregate test coverage across all child stories
- Color-coded coverage indicator: Red (no tests), Yellow (tests exist but not all passing), Green (all passing)
- Accessible from TestForge dashboard and from Jira Epic detail panel

#### 6.4.3 Traceability Matrix
- A dedicated Traceability Matrix view showing: Jira Story → Test Cases → Execution Status → Linked Defects
- Filterable by Vendor, Sprint, Market, Environment, Status
- Exportable to CSV (for audit use)

#### 6.4.4 Jira Automation Triggers (Phase 2, but architect for now)
- When a Jira issue moves to "Ready for QA", auto-create a test cycle from linked test cases
- When all test cases for a story pass, optionally transition the Jira issue to "QA Complete"
- These are configurable per-project by Test Managers

---

### 6.5 Defect Management

#### 6.5.1 Auto-Created Problem Template
When TestForge creates a Jira issue for a test failure, it creates a **"Problem"** issue type (Everstory's standard defect type) in project **DS** (key: `DS-273` is the Parking Lot backlog — all TestForge-generated defects are created here by default, configurable by Super Admin).

```
Issue Type: Problem
Project: DS
Summary: [TestForge] TC-XXXX Failed — [Test Case Title]
Description:
  - Test Plan: [name]
  - Test Cycle: [name]
  - Environment: [env]
  - Executed by: [user]
  - Failed Step: [step #] — [action]
  - Expected: [expected result]
  - Actual: [actual result]
  - Test Case Link: [deep link to TestForge]
Labels: testforge-generated, [vendor code: PBX/LWS/CPA/HG]
Priority: [mapped from test case priority]
```

#### 6.5.2 Defect Metrics
- Track defect density per vendor, per test plan, per market
- Defects linked through TestForge are tagged for dashboard reporting
- Re-execution triggered after a defect is marked "Resolved" in Jira

---

### 6.6 Environment Tracking

#### 6.6.1 Environment Registry
Four standard environments, managed by Super Admin:

| Environment | Purpose | Typical Users |
|---|---|---|
| **DEV** | Active development, integration testing | Backend engineers |
| **TEST** | Formal test case execution, QA | IT/PO Team, Field Operators |
| **STAGING** | Pre-production UAT, final sign-off | PO Team, select field operators |
| **PROD** | Smoke tests post-deployment only | Test Managers only |

- Each environment has: Name, Color Tag, URL/Description, Owner, and Active/Inactive flag
- Test cases and executions are tagged to an environment
- Dashboard can filter all metrics by environment

#### 6.6.2 Environment-Specific Execution Rules
- Test Manager can configure: "Test Plan TP-0014 may only be executed in STAGING"
- Field operators cannot execute against PROD without explicit Test Manager override
- Environment locks are enforced at the execution start screen

---

### 6.7 Vendor Change Tracker

This is a TestForge-native feature with no direct equivalent in Zephyr or Xray.

#### 6.7.1 Vendor Change Log
A log of vendor-pushed changes, releases, and patches. Entries can be created manually or (in future) via webhook from vendor release systems.

| Field | Type |
|---|---|
| Vendor | Code | Example Modules |
|---|---|---|
| Plotbox | PBX | Plot Inventory, Plot Transfer, Sales, Mapping, Interment |
| Lawson | LWS | Finance, HR, Procurement, Reporting |
| Coupa | CPA | Purchase Orders, Invoicing, Supplier Management |
| Homegrown | HG | Internal tools (module names TBD per tool) |

> **Note (OQ-7):** Module-level taxonomy within each vendor will be defined collaboratively with the PO team during Sprint 1. The above examples are starters. The Vendor Change Tracker UI allows Super Admin to define and maintain module lists per vendor without a code deploy.
| Version / Release Tag | Text |
| Change Summary | Long text |
| Affected Modules | Multi-select (configurable per vendor) |
| Release Date | Date |
| Severity | Enum (Breaking, Enhancement, Patch) |
| Linked Jira Issues | Issue Picker |
| Status | Draft / Published / Archived |

#### 6.7.2 AI-Powered Impact Analysis
When a Vendor Change entry is published:
1. Claude API analyzes the **Change Summary** and **Affected Modules**
2. Scans all active test cases tagged to that vendor
3. Returns a list of potentially impacted test cases, ranked by relevance
4. Test Manager reviews and confirms impact list
5. Confirmed test cases are flagged as **"Needs Revalidation"** and can be bulk-added to a new Test Plan

This closes the loop between vendor releases and regression accountability without manual cross-referencing.

#### 6.7.3 Impact Audit Trail
- Every impact analysis is stored with: timestamp, AI model version, input summary, output list, and human reviewer
- This creates a defensible audit record: "We knew about the Plotbox v4.2 change, and here's the regression we ran against it."

---

### 6.8 Microsoft Teams Integration

#### 6.8.1 Notification Events
The following events trigger configurable Teams notifications:

| Event | Default Channel Target | Configurable? |
|---|---|---|
| Test Cycle created | IT Applications Team channel | Yes |
| Test Case assigned to user | Assignee direct message | Yes |
| Test execution completed (pass) | IT Applications Team channel | Yes |
| Test execution failed | IT Applications Team + Reporting channel | Yes |
| Problem auto-created in Jira | IT Applications Team channel | Yes |
| Vendor Change published | IT Applications Team channel | Yes |
| AI impact analysis completed | IT Applications Team channel | Yes |
| Test Plan completed (all cycles done) | Reporting channel | Yes |

#### 6.8.2 Notification Format
Teams Adaptive Cards with:
- Color-coded status header (green/red/yellow)
- Key metadata (Test Plan, TC ID, Environment, Tester)
- Deep link button: "View in TestForge"
- Deep link button: "View in Jira" (where applicable)

#### 6.8.3 Teams Channel Configuration
Configured by Super Admin via TestForge Settings:
- **Target channels (v1):** IT Applications Team, Reporting Channel
- Webhook URLs managed by Everstory IT; coordinate with designated Teams admin for webhook provisioning
- Quiet hours (suppress non-critical notifications outside business hours)

> **Note (OQ-3):** Webhook URL setup requires coordination with an internal Teams/M365 admin. Second 9 Labs will provide the integration spec; Everstory IT to provision and supply webhook URLs before go-live.

---

### 6.9 Dashboard & Reporting

#### 6.9.1 Main Dashboard (Test Manager / Observer)
Always-visible metrics panel with:

**Top KPI Cards:**
- Total Test Cases (Active)
- Tests Executed This Sprint / Period
- Overall Pass Rate (%)
- Open Defects from TestForge
- Vendor Changes Pending Impact Review

**Charts:**
- Pass/Fail/Blocked ratio (donut) — filterable by vendor, environment
- Test execution trend (line chart, 30/60/90 day)
- Coverage heatmap: Jira stories × test case count × pass rate
- Defect volume by vendor (bar chart — PBX / LWS / CPA / HG)
- Field operator completion rate (horizontal bar, by user)

#### 6.9.2 Test Plan Dashboard
Per-plan view:
- Cycle progress (% complete)
- Tester-by-tester status grid
- Step-level failure frequency (which steps fail most often)
- Environment breakdown

#### 6.9.3 Field Operator View
Simplified view:
- "My Assignments" with count and due dates
- Completion streak (light gamification — optional, configurable)
- Status: tests remaining today

#### 6.9.4 Audit-Ready Data Retention
- All execution records are retained indefinitely (with archive compression after 12 months)
- Audit export: full execution log for a given Test Plan, date range, or vendor
- Exports include: TC-ID, title, version at time of execution, step results, tester, timestamp, environment, linked Jira issues, linked defects
- Export format: CSV (Phase 1), PDF report (Phase 2)

---

## 7. AI Enhancements

All AI features use the **Anthropic Claude API**. The model is configured via the `ANTHROPIC_MODEL` environment variable (default: `claude-sonnet-4-6` for cost/quality balance); cheap, high-frequency calls (duplicate detection, step clarity) may be routed to a Haiku-class model to control spend. A mid-tier Anthropic usage plan (~$50–150/month at Everstory's expected scale) is sufficient.

---

### 7.1 AI Test Case Generation

**Trigger:** Test Author clicks "Generate from Jira Story" on any linked story, or invokes from the empty test case editor.

**Input to Claude:**
- Jira story title and description
- Acceptance criteria (if present in the story)
- Story type / labels
- Vendor and module context (from folder location)
- Existing test cases in the same folder (for deduplication context)

**Output from Claude:**
- 3–8 suggested test cases, each with:
  - Title
  - Objective
  - Preconditions
  - Test steps (action + expected result)
  - Suggested priority
  - Suggested test type

**UX Flow:**
- Claude's suggestions appear in a side panel
- Author can accept individual test cases (adds to repo), edit inline, or reject
- Each accepted case is tagged `ai-generated` and flagged for human review before activation
- Author must explicitly "Activate" AI-generated test cases — they start in "Draft" status

---

### 7.2 AI Coverage Gap Analysis

**Trigger:** On-demand from Test Manager dashboard, or auto-triggered when a new Jira story moves to "Ready for QA."

**Input to Claude:**
- Jira epic/story titles and descriptions in the target project
- Existing test cases linked to each story
- Historical execution results

**Output from Claude:**
- A ranked list of stories with low or no test coverage
- For each gap: suggested test areas to cover (not full test cases — guidance prompts)
- A "coverage risk score" (High/Medium/Low) per story, with reasoning

**UX Flow:**
- Shown as a "Coverage Health" panel on the dashboard
- Click into any gap item → opens story in Jira and pre-loads the AI Test Case Generator

---

### 7.3 AI Duplicate Bug Detection (at execution failure)

Already described in §6.3.4. This is the highest-value immediate AI use case — it prevents duplicate Jira tickets and saves triage time.

---

### 7.4 AI Step Clarity Scorer (Passive)

**Trigger:** When a test case is saved. **Enabled by default** for all authors (configurable off per-user in profile settings).

**Background analysis by Claude:**
- Scores each test step for ambiguity (1–10)
- Flags steps that use vague language ("verify it works", "check the page", "make sure it's correct")
- Suggests rewritten steps inline

**UX:**
- A subtle "clarity warning" icon on ambiguous steps
- Hover to see Claude's rewrite suggestion
- One-click to accept or dismiss

This is a passive quality gate — it does not block saving, but improves test case quality over time. Especially useful for field operators who execute with less context.

---

### 7.5 AI Vendor Change Impact Analysis

Already described in §6.7.2. This is the highest strategic differentiator vs. Zephyr/Xray.

---

### 7.6 AI Cost Management
- All Claude API calls are logged with token counts
- A configurable monthly budget cap with alerts (at 75% and 90% of budget)
- Low-cost operations (step clarity, duplicate detection) use streaming + caching
- High-cost operations (full coverage gap analysis) are rate-limited to once per 24 hours per project
- Admin dashboard shows AI API spend by feature category

---

## 8. Integrations

### 8.1 Atlassian Forge (Jira Cloud)
- App delivered as a **Forge Custom UI** application (React, hosted on Atlassian's Forge runtime)
- Forge modules used:
  - `jira:issuePanel` — TestForge panel inside Jira issue detail
  - `jira:projectPage` — Full TestForge app page within Jira project navigation
  - `jira:globalPage` — TestForge cross-project dashboard
  - `webtrigger` — Receives inbound webhooks (e.g., Jira issue transitions)
  - `trigger` — Responds to Jira events (issue created, updated, transitioned)
- Backend logic runs on **Azure** (not Forge Functions) via `@forge/api` `fetch()` to Azure-hosted REST API
- Forge handles authentication context; app inherits user's Jira identity

### 8.2 Jira REST API v3
Used for:
- Reading issue details, epics, stories, labels, sprints
- Creating bug issues (defect creation)
- Searching issues for duplicate detection
- Reading project structure and boards

### 8.3 Microsoft Teams
- Microsoft Teams Incoming Webhooks (no Azure Bot Framework needed for v1)
- Phase 2: Microsoft Graph API for richer adaptive card interactions (reply from Teams, update execution status)

### 8.4 Microsoft Azure Active Directory (SSO)
- Users authenticate via their Microsoft identity through Atlassian's Jira SSO
- TestForge inherits Jira's authentication — no separate login
- Role mapping: TestForge roles assigned by Super Admin, stored in Azure backend DB, linked to Atlassian account ID
- No direct MSAL/OAuth flow needed in v1 (Forge provides authenticated user context)

### 8.5 Open Vendor Integration Architecture (Future)
- Reserved `/api/v1/vendor-webhooks/{vendorId}` endpoint
- Vendors (Plotbox, Lawson, Coupa) can push release events via authenticated webhook
- Inbound payloads map to Vendor Change Tracker entries
- API key auth per vendor, managed by Super Admin
- No vendor access to test case data — write-only inbound webhook

---

## 9. Technical Architecture

### 9.1 Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                      JIRA CLOUD                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           FORGE APP (Custom UI — React)                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │ Issue Panel  │  │ Project Page │  │ Global Page  │   │   │
│  │  │ (per-ticket  │  │ (Full App UI)│  │ (Dashboard)  │   │   │
│  │  │  test panel) │  │              │  │              │   │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │   │
│  │         └─────────────────┴─────────────────┘           │   │
│  │                           │                              │   │
│  │                    Forge fetch()                         │   │
│  └───────────────────────────┼──────────────────────────────┘   │
└──────────────────────────────┼─────────────────────────────────┘
                               │ HTTPS / JWT
┌──────────────────────────────▼─────────────────────────────────┐
│                  AZURE — TestForge Backend                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              REST API (Node.js / Express)                │   │
│  │  /test-cases  /test-plans  /executions  /vendor-changes  │   │
│  │  /reports     /roles       /teams-notify  /ai            │   │
│  └──────────┬──────────────────────────┬────────────────────┘   │
│             │                          │                         │
│  ┌──────────▼──────────┐  ┌───────────▼────────────┐          │
│  │  Azure Database for  │  │  Azure Blob Storage     │          │
│  │  PostgreSQL          │  │  (Attachments, exports, │          │
│  │  (primary datastore) │  │   audit archives)       │          │
│  └─────────────────────┘  └────────────────────────┘          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              External Service Calls                      │   │
│  │  Anthropic Claude API │ Jira REST v3 │ MS Teams Webhooks │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Forge Frontend | React 18 + Atlassian Design System (ADS) | Required for Forge Custom UI; ADS ensures Jira-native look/feel |
| Backend Runtime | Node.js 20 LTS + Express | Familiar, lightweight, strong Atlassian SDK support |
| Backend Language | TypeScript | Type safety critical for data model integrity |
| Primary Database | Azure Database for PostgreSQL (Flexible Server) | Managed, cost-effective (~$30–50/mo for B1ms tier), great for relational test data |
| File Storage | Azure Blob Storage | Cheap attachment storage (~$2–5/mo at early scale) |
| AI | Anthropic Claude API (env-driven `ANTHROPIC_MODEL`, default `claude-sonnet-4-6`) | Best quality/cost ratio, existing ecosystem familiarity |
| Notifications | MS Teams Incoming Webhooks | Zero infrastructure cost, easy setup |
| Auth | Forge-managed (Atlassian identity) | No separate auth system needed |
| CI/CD | GitHub Actions → Azure App Service | Standard, free tier sufficient |
| Hosting | Azure App Service (B2 plan) | ~$30–50/mo, autoscale available |

**Estimated Monthly Hosting Cost: $80–110/mo** (PostgreSQL + App Service + Blob Storage + minor networking)

### 9.3 Forge App Structure

```
testforge-forge/
├── manifest.yml              # Forge modules declaration
├── src/
│   ├── index.tsx             # Global page entry
│   ├── issue-panel/          # Jira issue panel component
│   ├── project-page/         # Full app UI (React SPA)
│   │   ├── components/
│   │   │   ├── TestRepository/
│   │   │   ├── TestPlans/
│   │   │   ├── Execution/
│   │   │   ├── VendorTracker/
│   │   │   ├── Dashboard/
│   │   │   └── Settings/
│   │   ├── hooks/
│   │   ├── store/            # Zustand or React Context
│   │   └── api/              # Typed API client to Azure backend
│   └── resolvers/            # Forge backend resolvers (thin pass-through)
└── package.json
```

### 9.4 Azure Backend Structure

```
testforge-api/
├── src/
│   ├── routes/
│   │   ├── testCases.ts
│   │   ├── testPlans.ts
│   │   ├── executions.ts
│   │   ├── vendorChanges.ts
│   │   ├── roles.ts
│   │   ├── reports.ts
│   │   └── ai.ts
│   ├── services/
│   │   ├── jiraService.ts     # Jira REST v3 client
│   │   ├── claudeService.ts   # Anthropic SDK wrapper
│   │   ├── teamsService.ts    # Teams webhook sender
│   │   └── auditService.ts    # Immutable audit log writer
│   ├── models/                # TypeScript interfaces + Prisma schema
│   ├── middleware/
│   │   ├── auth.ts            # JWT validation (from Forge context)
│   │   └── rateLimiter.ts     # AI endpoint throttling
│   └── db/
│       ├── schema.prisma
│       └── migrations/
└── package.json
```

---

## 10. Data Model

### Core Entities (simplified)

```sql
TestCase
  id, title, objective, preconditions, type, priority, status,
  vendor[], market[], environment[], folderId, ownerId,
  version, createdAt, updatedAt, archivedAt

TestStep
  id, testCaseId, order, action, testData, expectedResult,
  sharedStepId (nullable), subSteps[]

TestCaseVersion
  id, testCaseId, versionNumber, snapshot (JSONB), changedById, changedAt, changeNotes, locked

TestFolder
  id, name, parentId, vendorTag, marketTag, projectKey

TestPlan
  id, name, description, type, vendorId, status, environment,
  jiraEpicKey, marketScope[], startDate, endDate, ownerId

TestCycle
  id, testPlanId, name, assignedTo[], environment, status, startedAt, completedAt

TestExecution
  id, testCycleId, testCaseId, testCaseVersion, assignedTo, status,
  startedAt, completedAt, durationSeconds, notes, environment

ExecutionStepResult
  id, executionId, stepId, status, actualResult, notes, attachmentUrls[]

Defect
  id, executionId, jiraIssueKey, createdByAI, duplicateOf, createdAt

VendorChange
  id, vendor, versionTag, summary, affectedModules[], severity,
  releaseDate, status, aiAnalysisId, publishedAt

AIAnalysis
  id, vendorChangeId (nullable), type, inputSummary, outputJson,
  modelVersion, tokensUsed, reviewedBy, reviewedAt

Role
  id, userId, atlassianAccountId, role (enum), markets[], projectKeys[], createdAt

AuditLog
  id, actorId, action, entityType, entityId, before (JSONB), after (JSONB), timestamp, ip
```

---

## 11. Security & Compliance

### 11.1 Authentication & Authorization
- **v1 trust boundary:** API requests are routed frontend → Forge resolver → Azure backend. The backend trusts the forwarded Atlassian `accountId` only when accompanied by a shared internal secret (`TESTFORGE_INTERNAL_SECRET`) over TLS, so the secret never reaches the browser. **Sprint 2 upgrade:** verify the Forge remote-invocation JWT (issuer = Forge, audience = this app) against Forge's published keys and read `accountId` from the verified claims (not a client-supplied header)
- TestForge roles are enforced server-side on every API call — the UI reflects permissions, the API enforces them
- Field operators have the most restricted token scope; cannot access test authoring or admin endpoints
- Super Admin role requires explicit assignment; no self-elevation

### 11.2 Data Security
- All data encrypted in transit (TLS 1.3 minimum)
- Azure PostgreSQL encrypted at rest (AES-256)
- Azure Blob Storage encrypted at rest
- No test data, Jira content, or user PII is sent to Claude API without sanitization — story descriptions are passed, not personal data
- Claude API calls explicitly opt out of data training (Anthropic API customers are not used for training by default)

### 11.3 Audit Logging
- Every create, update, delete, execute, and export action is written to the immutable `AuditLog` table
- Audit logs are never deleted — only archived to cold Azure Blob Storage after 24 months
- Audit log is accessible only to Super Admin role
- Suitable for regulatory inquiry, vendor escalation, and internal accountability

### 11.4 Sensitive Data Handling
- Everstory's funeral/cemetery operational data (plot numbers, decedent records) **must never enter test case fields directly**
- Test data fields should use anonymized/synthetic data — a "Test Data Guidelines" section is surfaced in the UI when creating test steps
- A configurable data masking flag can mark test case fields as "No Real PII" with a validation reminder

### 11.5 Vendor Access Readiness (Future)
- Vendor webhook endpoints are on a separate subdomain with independent API key rotation
- No vendor can read Everstory test cases — only write to the Vendor Change inbound endpoint
- All vendor API keys are stored in Azure Key Vault

---

## 12. Environment Strategy

### 12.1 Recommended Pipeline Structure

```
Developer commits code
       ↓
    DEV (continuous)
    Purpose: Integration testing, developer self-testing
    Who executes: Backend engineers
    TestForge: Yes (smoke tests only, auto-triggered)
       ↓
    TEST (per sprint/feature branch)
    Purpose: Formal QA execution, regression suites
    Who executes: IT/PO team, select field operators
    TestForge: Yes (primary execution environment)
       ↓
    STAGING (pre-release)
    Purpose: UAT, final sign-off before vendor pushes to prod
    Who executes: PO team + field operators for UAT scenarios
    TestForge: Yes (UAT test plans)
       ↓
    PROD (post-release)
    Purpose: Smoke tests only — confirm deploy was successful
    Who executes: Test Managers only
    TestForge: Yes (tightly scoped smoke suite, ≤15 min)
```

### 12.2 Environment Governance in TestForge
- Test Plans are pinned to an environment at creation — cannot change mid-cycle
- Execution results from different environments are tracked separately (a test passing in TEST ≠ passing in STAGING)
- Dashboard shows environment-segmented pass rates
- PROD execution requires Test Manager role AND a "PROD execution" permission flag (separate toggle)

---

## 13. Reporting & Analytics

### 13.1 Built-in Reports

| Report | Description | Access |
|---|---|---|
| Test Coverage by Story | Stories with / without / passing test cases | All roles |
| Execution Summary | Pass/Fail/Blocked counts per test plan/cycle | All roles |
| Defect Traceability | Test failures → Jira defects, including resolution status | Manager+ |
| Tester Productivity | Executions per user, avg duration, completion rate | Manager+ |
| Vendor Regression History | Test plans by vendor, pass rate trend over time | Manager+ |
| Environment Health | Pass rates by environment, trend | Manager+ |
| AI Usage | Token consumption, feature breakdown, cost estimate | Super Admin |
| Audit Trail | Full action log with filters | Super Admin |

### 13.2 Jira Dashboard Gadgets (Phase 2)
TestForge will publish Jira Dashboard gadgets:
- "TestForge Coverage Status" — Coverage % for a selected project
- "TestForge Execution Trend" — 30-day pass rate sparkline
- "Open TestForge Defects" — Count of unresolved AI-created bugs

### 13.3 Data Retention Policy
- Execution records: Retained indefinitely, archived to cold storage after 12 months
- AI analysis records: Retained for 24 months
- Audit logs: Retained indefinitely, cold-archived after 24 months
- Deleted test cases: Soft-deleted (status = "Archived"), never hard-deleted
- Export capability unlocked for: Test Managers (own plans), Super Admin (all)

---

## 14. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Test repository page loads in < 2 seconds for up to 10,000 test cases |
| **Performance** | Execution step save/update response < 500ms |
| **AI Latency** | Test case generation response < 8 seconds (streaming preferred) |
| **Availability** | 99.5% uptime target (Azure App Service SLA) |
| **Scalability** | Architecture supports up to 10,000 active test cases, 500 concurrent executions |
| **Browser Support** | Chrome, Edge, Firefox (latest 2 versions); Safari secondary |
| **Accessibility** | WCAG 2.1 AA compliance for all core execution flows |
| **Mobile** | Responsive layout for execution flows (field operator mode) — Phase 2 native |
| **Forge Limits** | Forge Custom UI respects Atlassian sandbox (no direct DOM access, approved CDNs only) |
| **API Rate Limits** | Jira API calls batched and cached; max 50 req/10s per user |

---

## 15. Future Enhancements (Roadmap)

### Phase 2 (Sprint 3–6)
- **Mobile-optimized field operator execution** (PWA or React Native wrapper)
- **Screenshot / screen recording attachment** per execution step (Azure Blob backed)
- **PDF report export** with Everstory branding
- **Jira Automation integration** (trigger test cycles from board events)
- **Jira Dashboard gadgets** (TestForge coverage and trend widgets)
- **CSV/Excel import** of existing test cases (migrate from Excel baseline)

### Phase 3 (Quarter 2+)
- **Test automation hooks** — link test cases to automated test run results (CI/CD pipeline output)
- **Vendor portal access** — read-only vendor view of relevant test plans (scoped by vendor tag)
- **BDD/Gherkin step editor** — write test steps in Given/When/Then format
- **AI test data generator** — generate synthetic test data sets (plot numbers, names, dates) for test step data fields
- **Microsoft Graph integration** — richer Teams adaptive cards (reply to assign, approve from Teams)
- **Atlassian Marketplace listing** — private-to-public path if Everstory elects to license externally
- **Slack integration** (alternative to Teams, for future organizational flexibility)

### Long-Term Considerations
- SOC 2 Type II readiness (if externally licensed)
- Multi-tenant architecture (if Marketplace-published)
- HIPAA alignment review (funeral/cemetery records context)

---

## 16. Timeline & Milestones

> ⚠️ **Confirmed Aggressive.** This timeline is intentional and owner-approved. It assumes Second 9 Labs has 1–2 dedicated engineers running in parallel, Azure is provisioned on Day 1, and Everstory IT provides same-day feedback on blockers. Go/no-go sign-off authority: **Product Owner**.

### Week 1 — Demo Build
**Goal: A live, working demo inside Jira showing the full core loop — including Vendor Change Tracker with AI impact analysis**

| Day | Deliverable | Notes |
|---|---|---|
| 1 AM | Forge app scaffolded, Custom UI shell visible in Jira | Forge CLI setup, manifest.yml, Atlassian tunnel running |
| 1 PM | Azure App Service + PostgreSQL provisioned, Prisma schema migrated | Parallelize with Forge setup |
| 2 | Test Case CRUD + folder structure (PBX/LWS/CPA/HG vendor tags) | Core repository working |
| 2–3 | Test Plan + Test Cycle creation, basic user assignment | Field operators already have Jira accounts — no provisioning needed |
| 3–4 | Execution flow — standard mode + Field Operator mode (wizard UI) | Both execution modes in demo |
| 4 | Jira Issue Panel — linked test cases visible on Jira issue detail | Forge issuePanel module |
| 4–5 | **Vendor Change Tracker** — entry creation, module tagging, publish | Core VCT entity and UI |
| 5 | **AI Impact Analysis** — Claude API call against test case library, ranked output | Vendor codes + test case tags fed to Claude |
| 5–6 | **Problem auto-creation** in Jira project DS from failed execution | Uses "Problem" issue type, populates DS backlog |
| 6 | **AI Duplicate Detection** — semantic match on open DS Problems | Claude + Jira REST v3 search |
| 6–7 | Basic dashboard (KPI cards + pass/fail donut), Teams notification (1 event: test failure) | Demo-ready polish |
| 7 | **Demo dry run** — full walkthrough with Product Owner | Go/no-go check before stakeholder demo |

**Demo Script Flow:**
1. Open a Jira story → see TestForge issue panel with linked test cases and coverage indicator
2. Open TestForge → show test repository, folder hierarchy with PBX/LWS/CPA tags
3. Create a Test Plan → assign a test cycle to a field operator
4. Execute a test case (standard mode) → mark a step failed → AI duplicate detection fires → creates Problem in DS
5. Log a new Vendor Change (PBX, module: Plot Inventory) → AI impact analysis runs → see ranked impacted test cases
6. Dashboard — pass rate, open defects, vendor changes pending review

---

### Sprint 2 — Go-Live Build
**Goal: Production-hardened, security-reviewed, PO team piloting**

| Week | Deliverable |
|---|---|
| 2 | AI test case generation (from Jira story → Draft test cases) |
| 2 | AI Coverage Gap Analysis, AI Step Clarity Scorer (on by default) |
| 2 | Environment tracking (DEV/TEST/STAGING/PROD), environment governance rules |
| 2 | Full RBAC enforcement server-side, role management UI for Super Admin |
| 3 | Test case versioning (diff view, rollback, lock) |
| 3 | Shared step library |
| 3 | Full Teams notifications (all 8 event types, IT Applications + Reporting channels) |
| 3 | Audit log, data retention policy, Azure security hardening |
| 3 | Traceability matrix view + CSV export |
| 3 | UAT with PO team, defect triage, documentation |
| **End of Sprint 2** | **✅ GO-LIVE — Pilot: IT/PO team (sign-off: Product Owner)** |

---

### Sprint 3 — Field Operator Rollout + Reporting
- Full Field Operator execution mode (tested with actual field staff)
- Jira Dashboard gadgets (coverage + execution trend)
- PDF report export
- CSV/Excel import for Excel test case migration
- Expanded Teams Adaptive Cards (Phase 2 richness)
- Market/region scoping (Phase 2 feature unlock)

---

## 17. Open Questions & Assumptions

| # | Question | Answer | Status |
|---|---|---|---|
| OQ-1 | Jira project key for Parking Lot backlog (TestForge-generated Problems) | **DS** (key: DS-273 is the backlog; all Problems created at project level DS) | ✅ Resolved |
| OQ-2 | Everstory market/region definitions | **Deferred to Phase 2.** v1 is org-wide scope only. Data model will reserve `markets[]` field. | ✅ Resolved |
| OQ-3 | Microsoft Teams channels and webhook management | **Channels:** IT Applications Team, Reporting Channel. Webhook URLs to be provisioned by Everstory IT in coordination with Teams/M365 admin. Second 9 Labs provides spec. | ✅ Resolved (action pending) |
| OQ-4 | Azure subscription ownership (Everstory vs. Second 9 Labs) | **Everstory has an existing Azure subscription.** Second 9 Labs deploys into Everstory's Azure tenant. Billing stays with Everstory. | ✅ Resolved |
| OQ-5 | Jira issue type for test failures | **"Problem"** — all TestForge-generated defects use this type in project DS | ✅ Resolved |
| OQ-6 | Jira permissions blocking Forge programmatic issue creation | No known blockers. Forge app will use `write:jira-work` scope; test on first deploy. | ✅ Resolved (verify on deploy) |
| OQ-7 | Vendor module taxonomy / naming convention | **PBX** (Plotbox), **LWS** (Lawson), **CPA** (Coupa), **HG** (Homegrown). Module-level lists defined by PO team in Sprint 1 via Super Admin UI. | ✅ Resolved |
| OQ-8 | AI Step Clarity Scorer — opt-in or default on? | **On by default** for all authors. Configurable off per user in profile settings. | ✅ Resolved |
| OQ-9 | Go/no-go sign-off authority for go-live | **Product Owner** signs off. | ✅ Resolved |
| **A-1** | Jira Cloud plan supports Forge Custom UI (requires Standard or above) | | Assumed — verify with Atlassian admin |
| **A-2** | Microsoft Teams is company standard; webhook config accessible | | Confirmed |
| **A-3** | Second 9 Labs builds under work-for-hire; Everstory owns the IP | | To be confirmed in contract |
| **A-4** | Anthropic API customers excluded from model training by default | | Confirmed |
| **A-5** | Field operators already have Jira Cloud accounts provisioned | | ✅ Confirmed by Product Owner |

---

## 18. Claude Code Implementation Brief

This section is designed to be handed directly to Claude Code (or an engineer using it) as a project bootstrap prompt.

---

### Project: TestForge — Everstory Test Case Management App

**What to build:** A Jira-native test case management application using Atlassian Forge (Custom UI) with a Node.js + TypeScript backend hosted on Azure.

**Repo structure:** Two packages in a monorepo:
- `/forge-app` — Forge Custom UI (React 18, Atlassian Design System)
- `/api` — Express + TypeScript backend, Prisma ORM, Azure PostgreSQL

---

### Bootstrap Commands

```bash
# 1. Install Forge CLI
npm install -g @forge/cli
forge login

# 2. Create Forge app
forge create testforge-forge --template custom-ui

# 3. Backend
mkdir testforge-api && cd testforge-api
npm init -y
npm install express typescript @types/express prisma @prisma/client
npm install @anthropic-ai/sdk   # Jira REST v3 is called with Node 20's native fetch — no Jira SDK package
npm install jsonwebtoken jwks-rsa express-rate-limit
npx prisma init
```

---

### Forge `manifest.yml` Modules to Declare

```yaml
modules:
  jira:issuePanel:
    - key: testforge-issue-panel
      resource: main
      resolver:
        function: resolver
      title: TestForge
      icon: https://[your-azure-cdn]/testforge-icon.png

  jira:projectPage:
    - key: testforge-project-page
      resource: main
      resolver:
        function: resolver
      title: TestForge
      icon: https://[your-azure-cdn]/testforge-icon.png

  jira:globalPage:
    - key: testforge-global-dashboard
      resource: main
      resolver:
        function: resolver
      title: TestForge Dashboard

  webtrigger:
    - key: testforge-jira-webhook
      function: jira-webhook-handler

permissions:
  scopes:
    - read:jira-work
    - write:jira-work
    - read:jira-user
  external:
    fetch:
      backend:
        - https://[your-azure-api-domain].azurewebsites.net
```

---

### Key Implementation Notes for Claude Code

1. **Auth pattern:** Forge provides `useProductContext()` which gives `accountId`. Pass this as a header to the Azure API, validated against Atlassian's JWKS endpoint server-side.

2. **Forge storage:** Do NOT use Forge Storage for primary data — use Azure PostgreSQL. Forge Storage has tight limits (~10MB total) insufficient for test case history.

3. **Prisma schema starting point:** Use the entity definitions in §10 of this PRD. All foreign keys should use UUIDs, not integers (to support future multi-tenant).

4. **Jira issue panel:** Use `@forge/react` `<IssuePanel>` component. The panel should render a lightweight summary — don't load the full app bundle in the panel.

5. **AI streaming:** Use Anthropic SDK's streaming mode (`claude.messages.stream()`) for test case generation so the UI can show tokens arriving progressively. Don't wait for the full response.

6. **Teams notifications:** Use Node 20's built-in global `fetch` (no `node-fetch` dependency) to POST to Teams Incoming Webhook URLs. Wrap in a queue (simple in-memory queue is fine for v1) to avoid blocking execution save responses.

7. **Vendor Change AI:** The Claude prompt for impact analysis should include: (a) the change summary, (b) a list of test case titles + IDs + tags — ask Claude to return a JSON array of `{ tcId, relevanceScore, reasoning }`. Parse the JSON response, not free text.

8. **Role enforcement middleware:**
```typescript
// middleware/authorize.ts
export const authorize = (...allowedRoles: Role[]) =>
  async (req, res, next) => {
    const userRole = await getRoleByAccountId(req.headers['x-account-id']);
    if (!allowedRoles.includes(userRole)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
```

9. **Duplicate bug detection prompt pattern:**
```
Given these open Jira bug summaries: [list]
And this test failure: [step action] — expected [X] but got [Y]
Return the top 3 most similar bugs as JSON: [{issueKey, summary, similarityScore}]
Score from 0.0 to 1.0. Return [] if none are similar above 0.4.
```

10. **Jira Problem creation payload** uses Jira REST v3 POST `/rest/api/3/issue` with `issuetype: { name: "Problem" }`, project key `DS`. All TestForge-generated issues land in the DS Parking Lot backlog by default. This is confirmed — no OQ needed.

---

*End of PRD v1.2 — Everstory TestForge*  
*Status: Approved. All open questions resolved. No blockers.*  
*Go-live sign-off authority: Product Owner.*  
*Next step: Claude Code implementation brief — ready for Second 9 Labs Day 1 kickoff.*

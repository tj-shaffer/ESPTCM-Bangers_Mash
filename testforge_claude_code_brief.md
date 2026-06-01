# TestForge — Claude Code Implementation Brief
## Everstory IT / Second 9 Labs, LLC
**Version:** 1.1  
**Date:** May 2026  
**Purpose:** Hand this document directly to Claude Code to bootstrap and build TestForge sprint by sprint.  
**Changelog v1.1:** Corrected to Custom UI (removed `render: native`); model env-driven (`ANTHROPIC_MODEL`, default `claude-sonnet-4-6`) with prompt caching; removed `@atlassian/jira-rest-api-client` and `node-fetch` (Node 20 native `fetch`); Jira search → `/rest/api/3/search/jql`; added `displayId` sequence (TC-XXXX); folder tree uses `@atlaskit/pragmatic-drag-and-drop`; v1 auth = shared internal secret, Sprint-2 Forge-JWT verification. See `CLAUDE.md` and `DECISIONS.md` for the authoritative, corrected invariants.

---

## How to Use This Brief

This document is structured as a series of **phased prompts** you feed to Claude Code in order. Each phase builds on the last. Start a Claude Code session, paste the context block first, then work through each phase prompt sequentially.

Do not skip phases. Each phase assumes the previous one is complete and committed to Git.

---

## CONTEXT BLOCK — Paste This First in Every Claude Code Session

```
You are building TestForge — a Jira-native test case management application for Everstory, 
a funeral home and cemetery operator. The app is a monorepo with two packages:

1. /forge-app — Atlassian Forge Custom UI app (React 18, Atlassian Design System v1)
   This is the Jira-embedded frontend. It runs inside Jira Cloud via Atlassian Forge.
   
2. /api — Node.js 20 + TypeScript + Express REST API, hosted on Azure App Service.
   This is the backend. The Forge app calls this via HTTPS.

Key facts you must never forget:
- Jira issue type for defects: "Problem" (NOT "Bug")
- Default Jira project for TestForge-generated Problems: project key "DS"
- Vendor codes: PBX (Plotbox), LWS (Lawson), CPA (Coupa), HG (Homegrown)
- AI provider: Anthropic Claude API. Model via env var ANTHROPIC_MODEL (default: claude-sonnet-4-6). Never hardcode the model id; cheap calls may use a Haiku-class model
- Database: Azure Database for PostgreSQL (Flexible Server), ORM: Prisma
- Auth (v1): resolver forwards accountId (x-atlassian-account-id) + a shared secret (x-testforge-internal-secret); the backend trusts accountId only when the secret matches. Sprint 2: verify the Forge remote-invocation JWT instead.
- Notifications: Microsoft Teams Incoming Webhooks (two channels: IT Applications Team, Reporting)
- Do NOT use Forge Storage for primary data — always use Azure PostgreSQL
- All primary keys are UUIDs (never integer PKs). Exception: TestCase/TestPlan/VendorChange also carry a separate monotonic `displayId` sequence for human IDs (TC-XXXX/TP-XXXX/VC-XXXX) — permanent, never reused
- TypeScript strict mode throughout
- Call path: frontend → resolver via @forge/bridge invoke(); resolver → Azure API via @forge/api fetch() (egress-allowlisted in manifest). Secret + accountId are attached in the resolver, never in the browser
```

---

## PHASE 0 — Repository & Infrastructure Setup

### Prompt 0.1 — Monorepo Scaffold

```
Create a monorepo called testforge with the following structure:

testforge/
├── .github/
│   └── workflows/
│       ├── api-deploy.yml        # GitHub Actions: deploy /api to Azure App Service on push to main
│       └── forge-deploy.yml      # GitHub Actions: forge deploy on push to main
├── forge-app/                    # Atlassian Forge Custom UI app (scaffold only for now)
├── api/                          # Express + TypeScript backend
├── .gitignore
└── README.md

Requirements:
- Root package.json with workspaces: ["forge-app", "api"]
- Each sub-package has its own package.json, tsconfig.json
- .gitignore covers node_modules, .env, dist, .forge
- README explains the two-package architecture, how to run locally, and how to deploy

For the /api package:
- TypeScript 5.x, strict mode
- Express 4.x
- Prisma 5.x
- Dependencies: express, typescript, @types/express, @types/node, prisma, @prisma/client,
  @anthropic-ai/sdk, jsonwebtoken, jwks-rsa, express-rate-limit, cors, dotenv, uuid, @types/uuid
- Dev dependencies: ts-node-dev, @types/jsonwebtoken, @types/cors
- npm scripts: dev (ts-node-dev), build (tsc), start (node dist/index.js), db:migrate, db:generate

For the /forge-app package:
- Run: forge create . --template custom-ui (placeholder — actual Forge scaffold comes in Phase 1)
- For now just create the directory with a placeholder package.json

Create the GitHub Actions workflow for /api:
- Trigger: push to main, changes in api/**
- Steps: npm ci, npm run build, deploy to Azure App Service using azure/webapps-deploy@v3
- Uses secrets: AZURE_WEBAPP_PUBLISH_PROFILE, AZURE_WEBAPP_NAME

Do not create application code yet — just the scaffold, configs, and CI.
```

---

### Prompt 0.2 — Prisma Schema

```
In /api, create the complete Prisma schema at prisma/schema.prisma.

Database provider: postgresql
Use @@map for snake_case table names.
All primary keys: String @id @default(uuid())
All timestamps: DateTime @default(now()) or @updatedAt

Create the following models exactly:

--- ENUMS ---
enum Role { SUPER_ADMIN TEST_MANAGER TEST_AUTHOR FIELD_OPERATOR OBSERVER }
enum TestType { REGRESSION UAT MANUAL_FUNCTIONAL SMOKE EXPLORATORY }
enum Priority { CRITICAL HIGH MEDIUM LOW }
enum TestCaseStatus { DRAFT ACTIVE DEPRECATED ARCHIVED }
enum VendorCode { PBX LWS CPA HG }
enum Environment { DEV TEST STAGING PROD }
enum ExecutionStatus { NOT_STARTED IN_PROGRESS PASS FAIL BLOCKED SKIPPED }
enum TestPlanType { REGRESSION UAT SMOKE FULL_CYCLE }
enum TestPlanStatus { DRAFT ACTIVE COMPLETED ARCHIVED }
enum VendorChangeSeverity { BREAKING ENHANCEMENT PATCH }
enum VendorChangeStatus { DRAFT PUBLISHED ARCHIVED }
enum AIAnalysisType { VENDOR_IMPACT COVERAGE_GAP TEST_GENERATION DUPLICATE_DETECTION STEP_CLARITY }

--- MODELS ---

UserRole {
  id, atlassianAccountId (String @unique), displayName, email,
  role (Role), 
  markets (String[])        // reserved for Phase 2, not enforced in v1
  projectKeys (String[])
  createdAt, updatedAt
}

TestFolder {
  id, name, parentId (String? — self-relation), 
  vendorCode (VendorCode?), 
  marketTag (String?)       // reserved Phase 2
  projectKey (String)
  order (Int @default(0))
  createdAt, updatedAt
  children (TestFolder[] — self-relation)
  parent (TestFolder?)
  testCases (TestCase[])
}

TestCase {
  id (String @id @default(uuid())),
  displayId (Int @default(autoincrement()) @unique — rendered as TC-XXXX in the app layer; permanent, never reused),
  title, objective (String?), preconditions (String?),
  testType (TestType), priority (Priority), status (TestCaseStatus @default(DRAFT)),
  vendors (VendorCode[]),
  markets (String[])        // reserved Phase 2
  environments (Environment[]),
  folderId (String), folder (TestFolder)
  ownerId (String)
  version (Int @default(1))
  aiGenerated (Boolean @default(false))
  jiraStoryKeys (String[])
  labels (String[])
  estimatedDurationMinutes (Int?)
  createdAt, updatedAt, archivedAt (DateTime?)
  steps (TestStep[])
  versions (TestCaseVersion[])
  executions (TestExecution[])
}

TestStep {
  id, testCaseId (TestCase),
  order (Int), action (String), testData (String?), expectedResult (String),
  sharedStepId (String?)    // for shared step library
  clarityScore (Int?)       // AI clarity score 1-10
  claritySuggestion (String?)
  createdAt, updatedAt
  subSteps (TestSubStep[])
}

TestSubStep {
  id, testStepId, order (Int), action, testData (String?), expectedResult
}

SharedStep {
  id, title, action, testData (String?), expectedResult,
  createdById, createdAt, updatedAt
}

TestCaseVersion {
  id, testCaseId, versionNumber (Int),
  snapshot (Json),          // full TestCase+steps at time of version
  changedById (String), changeNotes (String?),
  locked (Boolean @default(false))
  createdAt
}

TestPlan {
  id, name, description (String?),
  planType (TestPlanType), vendorCode (VendorCode?),
  status (TestPlanStatus @default(DRAFT)),
  targetEnvironment (Environment),
  jiraEpicKey (String?),
  marketScope (String[])    // reserved Phase 2
  startDate (DateTime?), endDate (DateTime?),
  ownerId (String), projectKey (String),
  createdAt, updatedAt
  cycles (TestCycle[])
}

TestCycle {
  id, testPlanId, name,
  environment (Environment),
  status (ExecutionStatus @default(NOT_STARTED)),
  startedAt (DateTime?), completedAt (DateTime?),
  createdAt, updatedAt
  assignments (CycleAssignment[])
  executions (TestExecution[])
}

CycleAssignment {
  id, testCycleId, testCaseId, assignedToAccountId (String),
  assignedAt (DateTime @default(now()))
}

TestExecution {
  id, testCycleId, testCaseId,
  testCaseVersion (Int),    // version number at time of execution
  assignedToAccountId (String), executedByAccountId (String?),
  status (ExecutionStatus @default(NOT_STARTED)),
  environment (Environment),
  startedAt (DateTime?), completedAt (DateTime?),
  durationSeconds (Int?), notes (String?),
  createdAt, updatedAt
  stepResults (ExecutionStepResult[])
  defects (Defect[])
}

ExecutionStepResult {
  id, executionId, testStepId, stepOrder (Int),
  status (ExecutionStatus),
  actualResult (String?), notes (String?),
  attachmentUrls (String[])
  createdAt, updatedAt
}

Defect {
  id, executionId,
  jiraIssueKey (String?),   // DS-XXXX — set after Jira creation
  createdByAI (Boolean @default(false)),
  duplicateOfKey (String?), // if AI detected duplicate
  jiraCreationPayload (Json?),
  createdAt
}

VendorChange {
  id, vendorCode (VendorCode),
  versionTag (String), summary (String),
  affectedModules (String[]),
  severity (VendorChangeSeverity),
  releaseDate (DateTime?),
  status (VendorChangeStatus @default(DRAFT)),
  jiraIssueKeys (String[]),
  publishedAt (DateTime?), publishedById (String?),
  createdAt, updatedAt
  aiAnalyses (AIAnalysis[])
}

AIAnalysis {
  id, analysisType (AIAnalysisType),
  vendorChangeId (String?),
  testCaseId (String?),     // for step clarity
  executionId (String?),    // for duplicate detection
  inputSummary (String),
  outputJson (Json),
  modelVersion (String),
  inputTokens (Int), outputTokens (Int),
  reviewedByAccountId (String?), reviewedAt (DateTime?),
  createdAt
}

AuditLog {
  id, actorAccountId (String),
  action (String),          // e.g. "TestCase.create", "TestExecution.update"
  entityType (String), entityId (String),
  before (Json?), after (Json?),
  ipAddress (String?),
  createdAt
  @@index([entityType, entityId])
  @@index([actorAccountId])
  @@index([createdAt])
}

After the schema, generate the initial migration with: npx prisma migrate dev --name init
Then generate the client: npx prisma generate
```

---

### Prompt 0.3 — Azure Infrastructure (README instructions)

```
Create a file at /api/AZURE_SETUP.md with step-by-step Azure CLI commands to provision 
the TestForge infrastructure in Everstory's existing Azure subscription.

Include commands for:

1. Create Resource Group
   az group create --name rg-testforge-prod --location eastus

2. Create Azure Database for PostgreSQL Flexible Server
   - SKU: Standard_B1ms (burstable, ~$13/mo)
   - Storage: 32GB
   - Version: 16
   - Name: testforge-db
   - Create database: testforge
   - Enable SSL enforcement
   - Create firewall rule for Azure App Service outbound IPs (placeholder — update after App Service created)

3. Create Azure App Service Plan
   - SKU: B2 (~$30/mo)
   - OS: Linux
   - Name: plan-testforge

4. Create Azure App Service (Web App)
   - Name: testforge-api
   - Runtime: NODE|20-lts
   - Plan: plan-testforge
   - Set environment variables (list all required env vars with placeholder values — see below)

5. Create Azure Blob Storage Account
   - Name: testforgestorage
   - SKU: Standard_LRS
   - Create container: attachments (private access)
   - Create container: exports (private access)
   - Create container: audit-archive (private access, cool tier)

6. Required App Service Environment Variables (document all of these):
   DATABASE_URL                    # PostgreSQL connection string
   ANTHROPIC_API_KEY               # From console.anthropic.com
   ATLASSIAN_JWKS_URI              # https://[tenant].atlassian.net/.well-known/jwks.json
   JIRA_BASE_URL                   # https://[tenant].atlassian.net
   JIRA_SERVICE_ACCOUNT_EMAIL      # Bot account email for Jira API calls
   JIRA_SERVICE_ACCOUNT_TOKEN      # Jira API token
   JIRA_DEFAULT_PROJECT_KEY        # DS
   JIRA_PROBLEM_ISSUE_TYPE         # Problem
   TEAMS_WEBHOOK_IT_APPLICATIONS   # MS Teams webhook URL for IT Applications Team
   TEAMS_WEBHOOK_REPORTING         # MS Teams webhook URL for Reporting channel
   AI_MONTHLY_BUDGET_USD           # e.g. 150
   NODE_ENV                        # production
   ALLOWED_FORGE_APP_ID            # Forge app ID (from manifest.yml after deploy)

7. Get the App Service publish profile for GitHub Actions:
   az webapp deployment list-publishing-profiles --name testforge-api --resource-group rg-testforge-prod

Note which outputs need to be added as GitHub Actions secrets:
- AZURE_WEBAPP_PUBLISH_PROFILE
- AZURE_WEBAPP_NAME (testforge-api)
```

---

## PHASE 1 — Forge App Shell + Auth

### Prompt 1.1 — Forge Scaffold & Manifest

```
In /forge-app, create a complete Atlassian Forge Custom UI application.

Run the scaffold and then configure manifest.yml with these exact modules:

app:
  id: [will be assigned after first forge deploy — leave as placeholder]

modules:
  # NOTE: Custom UI — do NOT use `render: native` (that is UI Kit). Custom UI modules
  # reference a static `resource` + a `resolver` function only.
  jira:issuePanel:
    - key: testforge-issue-panel
      resource: main
      resolver:
        function: resolver
      title: TestForge
      
  jira:projectPage:
    - key: testforge-project-page
      resource: main
      resolver:
        function: resolver
      title: TestForge
      layout: basic

  jira:globalPage:
    - key: testforge-global-page
      resource: main
      resolver:
        function: resolver
      title: TestForge Dashboard

  webtrigger:
    - key: testforge-webhook-receiver
      function: webhook-handler

  function:
    - key: resolver
      handler: index.handler
    - key: webhook-handler
      handler: webhookHandler.handler

resources:
  - key: main
    path: build           # Custom UI: point at the BUILT static frontend (Vite output), not src
    tunnel:
      port: 3000

permissions:
  scopes:
    - read:jira-work
    - write:jira-work  
    - read:jira-user
    - read:me
  external:
    fetch:
      backend:
        - https://testforge-api.azurewebsites.net

Then create the Forge backend resolver at src/index.ts:
- Import @forge/resolver
- Create a resolver for "getContext" that returns the current user's accountId, 
  displayName, and the current issue key (if in issue panel context)
- This is used by the frontend to bootstrap authentication

Create a thin API client at src/frontend/src/api/client.ts:
- All calls go to https://testforge-api.azurewebsites.net/api/v1
- Every request includes header: x-atlassian-account-id: [accountId from context]
- Use @forge/bridge invoke() to call the resolver for context, then use requestJira 
  or direct fetch with the accountId header for API calls
- Export typed functions: get<T>(path), post<T>(path, body), put<T>(path, body), del(path)
- Include error handling that surfaces Forge-specific errors cleanly

Create a React context provider at src/frontend/src/context/AuthContext.tsx:
- On mount, calls the getContext resolver
- Stores: accountId, displayName, currentIssueKey
- Exposes useAuth() hook
- Shows a loading spinner while context is being fetched
```

---

### Prompt 1.2 — API Auth Middleware

```
In /api/src/middleware/, create auth.ts:

This middleware validates that incoming requests are from the TestForge Forge app.

Strategy:
- Forge passes the user's Atlassian accountId in header: x-atlassian-account-id
- For backend-to-backend calls (Forge resolver → Azure API), also validate a shared 
  secret in header: x-testforge-internal-secret (env var: TESTFORGE_INTERNAL_SECRET)
- For v1, trust the accountId header if the internal secret validates — we're in a 
  controlled Forge environment so external spoofing is not a risk
- Attach req.accountId = accountId to all validated requests

Create authorize.ts middleware:
- Import the UserRole Prisma model
- export const authorize = (...roles: Role[]) => async middleware
- Looks up the UserRole record by req.accountId
- If no record found: default role is OBSERVER (read-only)
- If role not in allowed roles: 403 Forbidden
- Attaches req.userRole to the request

Create auditMiddleware.ts:
- After response, logs to AuditLog table for mutating operations (POST, PUT, PATCH, DELETE)
- Captures: actorAccountId, method+path as action, request body as after, response status
- Fire-and-forget (don't await — don't delay response)

Create rateLimiter.ts:
- Export aiRateLimiter: max 20 AI requests per user per hour
- Export standardLimiter: max 200 requests per user per 10 minutes
- Use express-rate-limit with in-memory store (sufficient for v1 single instance)
```

---

## PHASE 2 — Test Repository (Core CRUD)

### Prompt 2.1 — Test Case API

```
In /api/src/routes/, create testCases.ts with a complete Express router.

Implement these endpoints:

GET    /api/v1/test-cases              — list with filters: folderId, status, vendor, type, search
GET    /api/v1/test-cases/:id          — get single test case with steps and latest version
POST   /api/v1/test-cases              — create test case (requires TEST_AUTHOR+)
PUT    /api/v1/test-cases/:id          — update (creates new version snapshot automatically)
DELETE /api/v1/test-cases/:id          — soft delete (sets status=ARCHIVED, sets archivedAt)
GET    /api/v1/test-cases/:id/versions — list version history
POST   /api/v1/test-cases/:id/clone    — clone to same or different folder
POST   /api/v1/test-cases/bulk         — bulk update: { ids[], patch: { status?, priority?, ownerId? } }

For GET list, support query params:
- folderId, status, vendors (comma-separated VendorCode), testType, priority
- search (full-text on title + objective)
- jiraStoryKey (filter by linked story)
- page, pageSize (default 50, max 200)
- sortBy: title | priority | updatedAt | status (default updatedAt desc)

For POST/PUT:
- Validate all enum fields against Prisma enums
- On any PUT that changes title, steps, preconditions, or expectedResult of any step:
  auto-create a TestCaseVersion snapshot (JSON.stringify the full test case + steps)
- Increment version field on TestCase
- Return the full updated test case

For clone:
- Deep clone test case and all steps
- Set status=DRAFT, version=1, aiGenerated=false
- Add " (Copy)" suffix to title
- Record clonedFromId as a label

Apply middleware: standardLimiter, auth, authorize appropriately per endpoint.
```

---

### Prompt 2.2 — Test Folder API

```
In /api/src/routes/, create testFolders.ts:

GET    /api/v1/folders                 — get full folder tree for a projectKey (nested)
POST   /api/v1/folders                 — create folder (TEST_AUTHOR+)
PUT    /api/v1/folders/:id             — rename, reparent, update vendor/market tags
DELETE /api/v1/folders/:id             — only if folder has no active test cases
POST   /api/v1/folders/reorder         — update order for drag-and-drop: { updates: [{id, order, parentId}] }

For GET tree:
- Accept query param: projectKey
- Return nested structure: each folder has children[] array
- Include testCaseCount per folder (active cases only)
- Max depth: 5 levels

Validation:
- Prevent circular parent references
- Prevent deletion of folders containing active (non-archived) test cases
```

---

### Prompt 2.3 — Forge Frontend: Test Repository UI

```
In /forge-app/src/frontend/src/, build the Test Repository view.

This is the main view shown on the jira:projectPage module.

Use Atlassian Design System (ADS) components throughout:
- @atlaskit/pragmatic-drag-and-drop for the folder tree (left panel) — note: @atlaskit/tree is deprecated
- @atlaskit/dynamic-table for the test case list (right panel)  
- @atlaskit/modal-dialog for create/edit test case
- @atlaskit/select, @atlaskit/textfield, @atlaskit/button, @atlaskit/badge throughout
- @atlaskit/empty-state for empty folder views

Layout: two-panel (sidebar + main content), similar to Jira's own project navigation.

Left panel — Folder Tree:
- Collapsible folder hierarchy
- Each folder shows: name, vendor badge (PBX/LWS/CPA/HG color-coded), test case count
- "New Folder" button at top
- Drag-and-drop reordering (use @atlaskit/pragmatic-drag-and-drop)
- Right-click context menu: Rename, Add Subfolder, Delete

Right panel — Test Case List:
- Columns: ID (TC-XXXX), Title, Type, Priority, Status, Owner, Last Updated, Linked Stories (count)
- Priority color coding: Critical=red, High=orange, Medium=yellow, Low=grey
- Status badges using ADS Lozenge component
- Click row → opens Test Case Detail panel (slide-in drawer using @atlaskit/drawer)
- Toolbar: Search input, filter dropdowns (Type, Priority, Status, Vendor), "New Test Case" button
- Bulk select checkboxes → bulk action toolbar appears

Test Case Create/Edit Modal:
- All fields from the PRD data model
- Step editor: ordered list of steps, each with Action, Test Data, Expected Result
- Add/remove/reorder steps (drag handles)
- "Add Substep" button per step
- Vendor multi-select with PBX/LWS/CPA/HG options
- Jira story picker: search and link Jira issues (call Jira REST via Forge requestJira())
- Save → calls POST or PUT /api/v1/test-cases
- After save, show AI Step Clarity results if any steps scored < 7 (see AI Phase)

All state management via React Query (TanStack Query) for server state.
Use Zustand for UI state (selected folder, selected test cases for bulk ops, open drawer).
```

---

## PHASE 3 — Test Plans & Execution

### Prompt 3.1 — Test Plans API

```
In /api/src/routes/, create testPlans.ts and testCycles.ts.

testPlans.ts endpoints:
GET    /api/v1/test-plans              — list with filters: status, vendorCode, projectKey
GET    /api/v1/test-plans/:id          — get with cycles summary
POST   /api/v1/test-plans              — create (TEST_MANAGER+)
PUT    /api/v1/test-plans/:id          — update
DELETE /api/v1/test-plans/:id          — archive only (no hard delete)

testCycles.ts endpoints:
GET    /api/v1/test-plans/:planId/cycles          — list cycles for a plan
POST   /api/v1/test-plans/:planId/cycles          — create cycle
PUT    /api/v1/cycles/:id                         — update cycle
POST   /api/v1/cycles/:id/assign                  — assign test cases to users
  Body: { assignments: [{ testCaseId, accountId }] }
  Creates CycleAssignment records and TestExecution records (status=NOT_STARTED)
  After creating assignments: fire Teams notification (IT Applications channel)
  Notification: "New test assignments in cycle [name] — [N] test cases assigned"

GET    /api/v1/cycles/:id/assignments             — list assignments with execution status
GET    /api/v1/cycles/:id/progress                — aggregate: total, by status counts, % complete

For cycle creation, snapshot the test case versions:
- Store testCaseVersion on TestExecution = the current TestCase.version at time of assignment
- This ensures execution is always against the version that was current when assigned

Include a GET /api/v1/my-assignments endpoint:
- Filters TestExecution by assignedToAccountId = req.accountId
- Returns: NOT_STARTED and IN_PROGRESS executions only
- Includes: test case title, cycle name, plan name, environment, estimated duration
- Sorted by: cycle end date ASC
```

---

### Prompt 3.2 — Execution API

```
In /api/src/routes/, create executions.ts:

GET    /api/v1/executions/:id          — get execution with all step results
PUT    /api/v1/executions/:id/start    — set status=IN_PROGRESS, startedAt=now
PUT    /api/v1/executions/:id/complete — set status (PASS/FAIL/BLOCKED/SKIPPED), completedAt=now
                                         calculates durationSeconds
PATCH  /api/v1/executions/:id/steps/:stepId — update a single step result
  Body: { status, actualResult?, notes?, attachmentUrls? }
  
POST   /api/v1/executions/:id/defect   — create a defect for this execution
  Body: { linkExistingKey?: string, createNew?: boolean, stepId?: string }
  If createNew=true:
    1. Call /api/v1/ai/duplicate-detection first (internal call)
    2. Create Jira Problem issue in project DS using Jira REST API
    3. Store Defect record with jiraIssueKey
    4. Send Teams notification to IT Applications channel
  If linkExistingKey provided:
    1. Store Defect record with that key (no Jira API call needed)

For PATCH step result:
- Auto-calculate overall execution status after each step update:
  - Any step FAIL → execution status becomes FAIL (but stays IN_PROGRESS until explicitly completed)
  - All steps PASS → suggest PASS (don't auto-complete — require explicit completion)
- Return updated execution summary with step status counts

Important: FIELD_OPERATOR role can only update executions assigned to their accountId.
TEST_MANAGER can update any execution.
```

---

### Prompt 3.3 — Forge Frontend: Execution UI (Both Modes)

```
Build two execution interfaces in the Forge app.

--- STANDARD EXECUTION MODE (for TEST_AUTHOR, TEST_MANAGER) ---

Route/View: /execution/:executionId

Layout: Full page, two columns
Left: Test case metadata (title, TC-ID, type, priority, linked stories, preconditions)
Right: Step-by-step execution panel

Step Panel:
- All steps visible in a scrollable list
- Each step: step number, Action text, Test Data (highlighted box), Expected Result
- Per-step status buttons: Pass (green), Fail (red), Blocked (orange), Skip (grey)
- Clicking any status opens an inline form for: Actual Result (text), Notes, Attachments
- Steps lock after being given a status (can undo with an "Edit" link)
- Progress bar at top: X/Y steps completed
- Running timer showing elapsed execution time

On any step marked FAIL:
- Slide-in panel appears: "Possible Duplicate Problems"
- Show loading state while AI duplicate detection runs
- Display top 3 results as cards: Jira key, summary, similarity % badge
- Buttons: "Link This Issue", "Create New Problem", "None of These"
- If "Create New Problem": show pre-filled Jira fields for confirmation before submitting

Footer bar: "Complete Execution" button (enabled when all steps have a status)
  → Opens modal: confirm overall status (PASS / FAIL / BLOCKED), final notes
  → Calls PUT /executions/:id/complete

--- FIELD OPERATOR MODE ---

Route/View: /my-assignments and /execution/:executionId?mode=operator

My Assignments page:
- Clean card grid: one card per assigned execution
- Card shows: Test Plan name, Test Case title (large), Environment badge, 
  estimated duration, status (NOT_STARTED / IN_PROGRESS)
- "Start" button on each card
- Empty state: "No assignments! You're all caught up." with a checkmark illustration

Execution in Operator Mode:
- Single-step wizard: shows ONE step at a time (step N of Y)
- Large, clear typography — minimal visual noise
- Step content: Action (primary), Expected Result (secondary, light background box)
- Test Data shown in a highlighted block if present
- Three large buttons at bottom: ✓ Pass | ✗ Fail | ⊘ Blocked
- On Fail: simple text area "What happened?" (actualResult) — no duplicate detection UI
  (defect creation is handled by TEST_MANAGER, not field operators)
- "Flag for Clarification" link — adds a note that surfaces to Test Manager
- Navigation: Previous step (if needed) | Next Step
- Progress: "Step 3 of 8" with progress bar
- On final step complete: confirmation screen with summary, then back to My Assignments

Use ADS components throughout. Operator mode should feel like a mobile-first form even on desktop.
```

---

## PHASE 4 — Jira Integration

### Prompt 4.1 — Jira Service

```
In /api/src/services/, create jiraService.ts:

This service wraps all Jira REST API v3 calls. Use Node 20's built-in global fetch (no node-fetch dependency).
Base URL from env: JIRA_BASE_URL
Auth: Basic auth with JIRA_SERVICE_ACCOUNT_EMAIL:JIRA_SERVICE_ACCOUNT_TOKEN (base64)
All methods async, return typed results.

Implement:

getIssue(issueKey: string): Promise<JiraIssue>
  GET /rest/api/3/issue/{issueKey}
  
searchIssues(jql: string, fields: string[]): Promise<JiraIssue[]>
  POST /rest/api/3/search/jql   (the legacy /rest/api/3/issue/search is deprecated/being removed)
  
createIssue(payload: CreateIssuePayload): Promise<{ id: string, key: string }>
  POST /rest/api/3/issue
  Payload type includes: project.key, issuetype.name, summary, description (ADF format),
  labels, priority.name
  
createProblemFromExecution(execution: TestExecution, failedStep: ExecutionStepResult, testCase: TestCase): Promise<string>
  Builds the Problem payload:
  - project: { key: "DS" }
  - issuetype: { name: "Problem" }
  - summary: "[TestForge] TC-XXXX Failed — {testCase.title}"
  - description: ADF document with structured failure details
  - labels: ["testforge-generated", vendorCode (lowercase)]
  - priority: maps TestCase.priority → Jira priority name
    (CRITICAL→Highest, HIGH→High, MEDIUM→Medium, LOW→Low)
  Calls createIssue, returns the new Jira issue key (e.g. "DS-847")

getOpenProblems(projectKey: string, maxResults: number): Promise<JiraIssue[]>
  JQL: project = DS AND issuetype = Problem AND statusCategory != Done
  Returns summary and key for duplicate detection

Helper: buildADF(text: string): object
  Converts plain text with newlines to minimal ADF (Atlassian Document Format) JSON
  Use paragraph nodes for each line — keep it simple
```

---

### Prompt 4.2 — Jira Issue Panel (Forge)

```
Build the TestForge Jira Issue Panel (jira:issuePanel module).

This is a lightweight component that appears inside every Jira issue detail page.

Component: src/frontend/src/panels/IssuePanel.tsx

On mount:
1. Get current issue key from Forge context
2. Call GET /api/v1/test-cases?jiraStoryKey={issueKey}
3. Call GET /api/v1/issue-coverage/{issueKey} (create this API endpoint)

Display:
- Header: "TestForge" with a small logo mark
- Coverage indicator:
  - Green check: "All X tests passing"
  - Yellow warning: "X of Y tests passing"  
  - Red X: "X tests failing"
  - Grey dash: "No test cases linked"
- Test case table (compact):
  Columns: TC-ID | Title | Type | Last Result | Executed By | Date
  Use ADS DynamicTable with compact density
  Max 10 rows; "View all in TestForge →" link if more
- "Run New Cycle" button (TEST_MANAGER only) → opens TestForge project page 
  with new cycle pre-configured for this story

Add the /api/v1/issue-coverage/:issueKey endpoint to /api/src/routes/coverage.ts:
- Finds all test cases with jiraStoryKey in jiraStoryKeys array
- Gets latest execution per test case
- Returns: { total, passing, failing, blocked, notRun, coverageStatus }
- coverageStatus: "green" | "yellow" | "red" | "none"

Keep the panel bundle small — don't import the full app. 
Use separate webpack entry point for the panel if possible.
```

---

## PHASE 5 — Vendor Change Tracker + AI

### Prompt 5.1 — Vendor Change Tracker API

```
In /api/src/routes/, create vendorChanges.ts:

GET    /api/v1/vendor-changes          — list with filters: vendorCode, status, severity
GET    /api/v1/vendor-changes/:id      — get with AI analyses
POST   /api/v1/vendor-changes          — create (TEST_MANAGER+)
PUT    /api/v1/vendor-changes/:id      — update (DRAFT only)
POST   /api/v1/vendor-changes/:id/publish — set status=PUBLISHED, publishedAt=now
  After publish: automatically trigger AI impact analysis (async)
  Send Teams notification: IT Applications channel
  "Vendor Change Published: [PBX] [version] — AI impact analysis running..."

POST   /api/v1/vendor-changes/:id/analyze — manually trigger/re-run AI impact analysis

GET    /api/v1/vendor-changes/:id/impacted-cases — get AI analysis results
  Returns test cases flagged as impacted, sorted by relevanceScore desc

POST   /api/v1/vendor-changes/:id/confirm-impact — Test Manager confirms impact list
  Body: { confirmedTestCaseIds: string[] }
  Sets confirmed test cases status to ACTIVE (if DEPRECATED) or adds "needs-revalidation" label
  Returns count confirmed

Also create a reserved webhook endpoint for future vendor push notifications:
POST   /api/v1/webhooks/vendor/:vendorCode
  - Requires x-api-key header (stored in env per vendor)
  - Creates a VendorChange record in DRAFT status
  - Returns 202 Accepted
  - Body is stored as-is in the VendorChange summary for human review
  Vendor codes in URL: pbx, lws, cpa, hg
```

---

### Prompt 5.2 — Claude Service + AI Routes

```
In /api/src/services/, create claudeService.ts:

Import @anthropic-ai/sdk. Model: read from env ANTHROPIC_MODEL (default "claude-sonnet-4-6") via a single config module — do not hardcode. Enable prompt caching (cache_control) on the static system preamble and the reusable test-case corpus. Max tokens: 1000 unless noted.

Implement these methods:

1. analyzeVendorImpact(vendorChange: VendorChange, testCases: TestCase[]): Promise<ImpactResult[]>

   Prompt:
   """
   You are a QA analyst reviewing the impact of a software vendor change on existing test cases.

   VENDOR CHANGE:
   Vendor: {vendorCode}
   Version: {versionTag}
   Severity: {severity}
   Affected Modules: {affectedModules.join(', ')}
   Summary: {summary}

   TEST CASES (JSON array — id, title, vendors, labels, folder path):
   {JSON.stringify(testCases.map(tc => ({ id: tc.id, title: tc.title, vendors: tc.vendors, labels: tc.labels })))}

   Analyze each test case and determine if it may be impacted by this vendor change.
   Return ONLY a JSON array. No explanation text before or after the JSON.
   Format: [{ "tcId": "...", "relevanceScore": 0.0-1.0, "reasoning": "one sentence" }]
   Only include test cases with relevanceScore >= 0.3.
   Rank by relevanceScore descending.
   """

   Parse response as JSON. Store in AIAnalysis record.
   Max tokens: 2000 (more test cases = more tokens needed)

2. generateTestCases(jiraStory: JiraIssue, existingCases: TestCase[], vendorCode?: VendorCode): Promise<GeneratedTestCase[]>

   Prompt:
   """
   You are a senior QA engineer creating test cases for a software story.

   JIRA STORY:
   Key: {story.key}
   Title: {story.fields.summary}
   Description: {plainTextDescription}
   Acceptance Criteria: {acceptanceCriteria or "Not specified"}
   {vendorCode ? `Vendor System: ${vendorCode}` : ''}

   EXISTING TEST CASES IN THIS AREA (to avoid duplication):
   {existingCases.slice(0,10).map(tc => tc.title).join('\n')}

   Generate 3-7 comprehensive test cases. Return ONLY a JSON array. No text before or after.
   Format each test case as:
   {
     "title": "string",
     "objective": "string",
     "preconditions": "string",
     "testType": "REGRESSION|UAT|MANUAL_FUNCTIONAL|SMOKE",
     "priority": "CRITICAL|HIGH|MEDIUM|LOW",
     "steps": [{ "action": "string", "testData": "string", "expectedResult": "string" }]
   }
   """

3. detectDuplicateProblems(failureDescription: string, openProblems: {key: string, summary: string}[]): Promise<DuplicateMatch[]>

   Prompt:
   """
   You are a QA triage analyst checking for duplicate issues.
   
   NEW FAILURE: {failureDescription}
   
   OPEN PROBLEMS:
   {openProblems.map(p => `${p.key}: ${p.summary}`).join('\n')}
   
   Return ONLY a JSON array of potential duplicates with similarity >= 0.4.
   No text before or after the JSON.
   Format: [{ "issueKey": "DS-XXX", "summary": "...", "similarityScore": 0.0-1.0 }]
   Sorted by similarityScore descending. Max 3 results.
   """

4. scoreStepClarity(steps: TestStep[]): Promise<ClarityResult[]>

   Prompt:
   """
   You are a QA coach reviewing test step clarity. 
   Vague steps confuse testers and cause incorrect pass/fail results.
   
   TEST STEPS:
   {steps.map((s,i) => `Step ${i+1}: Action: "${s.action}" | Expected: "${s.expectedResult}"`).join('\n')}
   
   Score each step 1-10 for clarity (10 = perfectly clear, 1 = completely vague).
   Flag steps scoring 6 or below. For flagged steps, suggest a rewrite.
   Return ONLY JSON. No text before or after.
   Format: [{ "stepIndex": 0, "score": 8, "suggestion": null }, { "stepIndex": 2, "score": 4, "suggestion": "rewritten step text" }]
   Only include steps with scores <= 6 in the output. Return [] if all steps are clear.
   """

For all methods:
- Wrap in try/catch, log errors, return empty array on failure (don't throw to caller)
- Log token usage to AIAnalysis table after each call
- Check monthly budget before expensive calls (analyzeVendorImpact, generateTestCases)

Create /api/src/routes/ai.ts with:
POST /api/v1/ai/generate-test-cases     — body: { jiraIssueKey, folderId }
POST /api/v1/ai/coverage-gaps           — body: { projectKey }  
POST /api/v1/ai/duplicate-detection     — body: { executionId, stepId }
POST /api/v1/ai/step-clarity            — body: { testCaseId } (called async after save)
GET  /api/v1/ai/usage                   — Super Admin: monthly token/cost summary

Apply aiRateLimiter to all routes. Apply authorize(SUPER_ADMIN, TEST_MANAGER, TEST_AUTHOR).
```

---

### Prompt 5.3 — Vendor Change UI (Forge)

```
Build the Vendor Change Tracker view in the Forge app.

Route/View: /vendor-changes

List View:
- Table columns: VC-ID | Vendor (colored badge) | Version | Severity | Release Date | 
  Status | Impacted Tests (count from AI analysis) | Actions
- Severity color coding: BREAKING=red, ENHANCEMENT=blue, PATCH=grey
- Status badge: DRAFT=grey, PUBLISHED=green, ARCHIVED=faded
- "New Vendor Change" button (TEST_MANAGER+ only)
- Filters: vendor code, severity, status, date range

Create/Edit Modal:
- Fields: Vendor (select PBX/LWS/CPA/HG), Version Tag (text), Release Date (date picker)
- Severity (select), Affected Modules (multi-select, options loaded per vendor from API)
- Summary (rich textarea — markdown supported)
- Linked Jira Issues (multi-select issue picker)
- Save as Draft | Publish buttons

Detail View (slide-in drawer):
- All fields displayed
- "Run AI Impact Analysis" button → shows loading state → populates impact table
- Impact Table: 
  Columns: TC-ID | Title | Vendor | Relevance Score (colored bar) | Reasoning | Confirm?
  Relevance Score: color-coded (red ≥0.8, orange ≥0.5, yellow ≥0.3)
  "Confirm Impact" checkbox per row
  "Confirm Selected" bulk action button → calls /confirm-impact
- After confirmation: show count of test cases flagged as needing revalidation

AI Analysis State UX:
- Initial: "No analysis run yet" with "Analyze Impact" button
- Loading: animated spinner with "Claude is analyzing {N} test cases..."
- Complete: show results table with timestamp
- "Re-run Analysis" link to refresh

Show a "Vendor Change Pending Review" badge count in the main navigation when 
there are PUBLISHED changes with no AI analysis review completed.
```

---

## PHASE 6 — Teams Notifications & Reporting

### Prompt 6.1 — Teams Notification Service

```
In /api/src/services/, create teamsService.ts:

Use Node 20's built-in global fetch (no node-fetch dependency) to POST to Teams Incoming Webhook URLs.
URLs from env: TEAMS_WEBHOOK_IT_APPLICATIONS, TEAMS_WEBHOOK_REPORTING

Build Teams Adaptive Card payloads for each event type.
Use the Adaptive Cards schema (JSON). Version 1.4 compatible.

Implement sendNotification(event: TeamsEvent): Promise<void>
- Fire-and-forget wrapper (catch errors, log, don't throw)
- Determines which webhook URL(s) to use per event type

Event types and their channel targets:

CYCLE_CREATED → IT Applications
  Card: "🧪 New Test Cycle Created"
  Body: Plan name, cycle name, N test cases, environment badge, assigned to N testers
  Actions: [{ "View in TestForge": deeplink }]

EXECUTION_ASSIGNED → IT Applications (+ could DM user via Graph in Phase 2)
  Card: "📋 Test Cases Assigned to You"
  Body: Assignee name, cycle name, N test cases, due date if set
  Actions: [{ "View My Assignments": deeplink }]

EXECUTION_FAILED → IT Applications + Reporting
  Card: "❌ Test Execution Failed" (red accent color)
  Body: TC-ID, test case title, environment, executed by, failed step summary
  Actions: [{ "View Execution": deeplink }, { "View Problem in Jira": jiraDeeplink }]

PROBLEM_CREATED → IT Applications
  Card: "🐛 Problem Created in Jira"
  Body: Jira key (DS-XXX), title, linked TC-ID, environment
  Actions: [{ "View in Jira": jiraIssueLink }]

VENDOR_CHANGE_PUBLISHED → IT Applications
  Card: "📦 Vendor Change Published" (blue accent)
  Body: Vendor badge, version, severity, affected modules, "AI analysis starting..."
  Actions: [{ "View Change": deeplink }]

VENDOR_IMPACT_ANALYZED → IT Applications
  Card: "🤖 AI Impact Analysis Complete"
  Body: Vendor, version, N test cases flagged, top 3 impacted cases listed
  Actions: [{ "Review Impact": deeplink }]

TEST_PLAN_COMPLETED → Reporting
  Card: "✅ Test Plan Completed" (green accent)
  Body: Plan name, vendor, pass rate %, N pass / N fail / N blocked, duration
  Actions: [{ "View Report": deeplink }]

Deep links format: https://[jira-tenant].atlassian.net/jira/apps/[forge-app-id]/[route]
Store JIRA_BASE_URL and FORGE_APP_ID in env vars for link construction.

Integrate teamsService calls into:
- POST /cycles/:id/assign → CYCLE_CREATED + EXECUTION_ASSIGNED (per assignee)
- PUT /executions/:id/complete (when status=FAIL) → EXECUTION_FAILED
- POST /executions/:id/defect → PROBLEM_CREATED
- POST /vendor-changes/:id/publish → VENDOR_CHANGE_PUBLISHED
- After analyzeVendorImpact completes → VENDOR_IMPACT_ANALYZED
- PUT /test-plans/:id when status→COMPLETED → TEST_PLAN_COMPLETED
```

---

### Prompt 6.2 — Dashboard API & UI

```
Create /api/src/routes/dashboard.ts:

GET /api/v1/dashboard/summary — main KPI cards
Returns:
{
  totalActiveTestCases: number,
  testsExecutedThisPeriod: number,   // last 30 days
  overallPassRate: number,           // % of last execution per test case that passed
  openProblems: number,              // Defect records with no resolution
  vendorChangesPendingReview: number, // PUBLISHED VendorChanges with no confirmed impact review
  executionsByStatus: { PASS, FAIL, BLOCKED, SKIPPED, NOT_STARTED }
}

GET /api/v1/dashboard/pass-rate-trend?days=30|60|90
Returns: [{ date: "2026-05-01", pass: N, fail: N, blocked: N }]
Aggregate daily execution completions

GET /api/v1/dashboard/coverage-by-story?projectKey=DS
Returns stories with linked test case counts and latest execution status
Calls Jira to get story list, then cross-references with TestCase.jiraStoryKeys

GET /api/v1/dashboard/defects-by-vendor
Returns: [{ vendorCode, count }] for open Defects, grouped by linked test case vendor

GET /api/v1/dashboard/operator-completion
Returns: [{ accountId, displayName, assigned, completed, completionRate }]
For TEST_MANAGER+, shows all operators. For FIELD_OPERATOR, shows only self.

---

Build Dashboard view in Forge app at /dashboard:

Top KPI row (5 cards):
1. Active Test Cases — count with icon
2. Executed (30 days) — count with up/down trend arrow
3. Pass Rate — large % with green/yellow/red color
4. Open Problems — count with Jira link
5. Pending Vendor Reviews — count with orange badge if > 0

Charts row (use recharts, imported from the recharts package):
- Pass/Fail/Blocked donut chart (left, 40% width) — filterable by vendor dropdown
- Execution trend line chart (right, 60% width) — 30/60/90 day toggle

Coverage heatmap section:
- Table: Jira Story Key | Story Title | Test Cases | Passing | Status
- Status: colored dot (green/yellow/red/grey)
- Click story → opens Jira issue in new tab

Defect volume bar chart:
- Horizontal bars by vendor code (PBX/LWS/CPA/HG)
- Count of open Problems per vendor

Field Operator completion table (TEST_MANAGER view):
- Columns: Name | Assigned | Completed | Rate | Status bar
```

---

## PHASE 7 — Security Hardening & Go-Live Prep

### Prompt 7.1 — Security & Final Checks

```
Perform a security review pass on the entire /api codebase and fix any issues found.

Check and implement the following:

1. Input validation: Add express-validator to all POST/PUT endpoints.
   Validate: string lengths (title max 500, description max 10000), enum values,
   UUID format for all ID parameters, array sizes (max 50 items in bulk operations)

2. SQL injection: Verify all database queries use Prisma parameterized queries only.
   Search no raw SQL strings concatenating user input.

3. CORS: Configure cors() middleware in /api/src/index.ts to only allow:
   - Forge app origin (*.atlassian.net)
   - In dev: localhost:3000
   Never allow wildcard * in production.

4. Sensitive data: Ensure no API keys, tokens, or passwords appear in:
   - Any response body
   - Any audit log entry
   - Any AI prompt sent to Anthropic (check jiraService and claudeService)
   Redact: email addresses, Jira API tokens, DB connection strings from all logs.

5. Rate limiting: Confirm aiRateLimiter and standardLimiter are applied to all routes.
   Add a stricter limiter for /api/v1/vendor-changes/:id/analyze: 5 per hour per user.

6. Error handling: Add global error handler middleware that:
   - Returns generic error message to client (never stack traces in production)
   - Logs full error internally
   - Returns appropriate HTTP status codes

7. Health check: Add GET /health endpoint that returns:
   { status: "ok", db: "connected"|"error", timestamp: ISO }
   Used by Azure App Service health monitoring.

8. Helmet: Add helmet() middleware for security headers.

9. Environment variable validation on startup:
   Check all required env vars are present at process startup.
   If any missing: log error and exit(1) with a clear message listing what's missing.

10. Test the Jira Problem creation end-to-end in a dev environment:
    Confirm issue type "Problem" creates successfully in project DS.
    Confirm labels are applied correctly.
    Confirm ADF description renders properly in Jira.
```

---

### Prompt 7.2 — Demo Data Seed Script

```
Create /api/prisma/seed.ts — a Prisma seed script to populate the database with 
realistic demo data for the Week 1 demo.

Seed the following:

1. UserRoles (5 users):
   - demo-manager-001: TEST_MANAGER
   - demo-author-001: TEST_AUTHOR  
   - demo-author-002: TEST_AUTHOR
   - demo-operator-001: FIELD_OPERATOR
   - demo-admin-001: SUPER_ADMIN
   (Use placeholder Atlassian account IDs — replace with real ones before live demo)

2. Folders (realistic Everstory structure):
   - Plotbox (PBX)
     - Plot Inventory
       - Plot Transfer Regression Suite
       - Plot Sale Regression Suite
     - Mapping & GIS
   - Lawson (LWS)
     - Finance
       - AP Regression Suite
   - Coupa (CPA)
     - Purchase Orders

3. Test Cases (15 total, spread across folders):
   Mix of statuses (ACTIVE, DRAFT), priorities, types.
   Include 3 linked to Jira story keys: "DS-100", "DS-101", "DS-102"
   
   Example cases:
   - "Verify plot status changes to SOLD after transfer is completed" (PBX, CRITICAL, REGRESSION)
   - "Confirm map marker updates to reflect new plot owner within 30 seconds" (PBX, HIGH, REGRESSION)
   - "Validate AP invoice approval workflow routes correctly to manager tier 2" (LWS, HIGH, UAT)
   - "Verify purchase order status reflects APPROVED after two-party sign-off" (CPA, MEDIUM, MANUAL_FUNCTIONAL)
   
   Each test case: 3-5 realistic steps with actions, test data, and expected results.

4. One TestPlan:
   - Name: "Plotbox v4.2 — Q3 2026 Regression"
   - Type: REGRESSION, Vendor: PBX, Environment: TEST
   - Status: ACTIVE
   One TestCycle: "Cycle 1 — Initial Run"
   Assignments: assign 5 test cases to demo-operator-001

5. One VendorChange:
   - Vendor: PBX, Version: v4.2.1
   - Severity: ENHANCEMENT
   - Affected Modules: ["Plot Inventory", "Plot Transfer"]
   - Summary: "Updated plot transfer workflow to require dual confirmation for transfers 
     involving plots with active payment plans. Added audit trail for all transfer approvals."
   - Status: PUBLISHED

Add seed script to package.json: "db:seed": "ts-node prisma/seed.ts"
Run: npx prisma db seed
```

---

## APPENDIX A — Environment Variables Reference

```bash
# /api/.env.example — copy to .env.local for development

# Database
DATABASE_URL="postgresql://testforge_user:PASSWORD@testforge-db.postgres.database.azure.com:5432/testforge?sslmode=require"

# Anthropic
ANTHROPIC_API_KEY="sk-ant-..."

# Jira
JIRA_BASE_URL="https://everstory.atlassian.net"
JIRA_SERVICE_ACCOUNT_EMAIL="testforge-bot@everstory.com"
JIRA_SERVICE_ACCOUNT_TOKEN="ATATT..."
JIRA_DEFAULT_PROJECT_KEY="DS"
JIRA_PROBLEM_ISSUE_TYPE="Problem"

# Atlassian Auth
ATLASSIAN_JWKS_URI="https://everstory.atlassian.net/.well-known/jwks.json"
ALLOWED_FORGE_APP_ID="ari:cloud:ecosystem::app/..."

# Teams
TEAMS_WEBHOOK_IT_APPLICATIONS="https://everstory.webhook.office.com/webhookb2/..."
TEAMS_WEBHOOK_REPORTING="https://everstory.webhook.office.com/webhookb2/..."

# Internal
TESTFORGE_INTERNAL_SECRET="generate-a-strong-random-string-here"

# AI Budget
AI_MONTHLY_BUDGET_USD="150"

# App
NODE_ENV="development"
PORT="3001"
JIRA_BASE_URL_FOR_LINKS="https://everstory.atlassian.net"
FORGE_APP_ROUTE_BASE="https://everstory.atlassian.net/jira/apps"
```

---

## APPENDIX B — Demo Day Script

**Estimated run time: 12 minutes**

1. **(2 min) Open Jira — show DS-100 issue**
   "Here's a story in our Parking Lot backlog. Notice the TestForge panel on the right — it shows 3 linked test cases, 2 passing, 1 not yet run. No Excel, no context switching."

2. **(2 min) Open TestForge Project Page → Repository tab**
   "This is our test library. Organized by vendor — PBX for Plotbox, LWS for Lawson. Everything versioned, searchable, linked to Jira."
   Open "Plot Transfer Regression Suite" → show test case with steps.

3. **(2 min) Open Test Plans → Plotbox v4.2 Regression**
   "Here's our regression plan tied to Plotbox's Q3 release. Cycle 1 is running — 5 cases assigned to our field operator."
   Execute one test case: mark step 2 as FAIL → AI duplicate detection fires → show top match → "Link Existing" 

4. **(2 min) Switch to Field Operator mode**
   "Here's what our field team sees — just their assignments, one step at a time. No Jira noise."
   Show My Assignments page → start an execution → Pass two steps.

5. **(3 min) Vendor Change Tracker** ← THE DEMO CENTERPIECE
   "Now the big one. Plotbox just dropped v4.2.1. I log the change here."
   Show the published VendorChange for PBX v4.2.1 → click "Analyze Impact"
   "Claude is now reading the change summary and scanning every Plotbox test case..."
   Show results: ranked list of impacted test cases with reasoning.
   "In the old world, this was a manual exercise. Someone had to read the release notes and hunt through Excel. Now it's 8 seconds."
   Confirm 3 cases → "These are now flagged for revalidation and can be added to a new test cycle."

6. **(1 min) Dashboard**
   "Leadership sees this. Pass rate, open problems by vendor, coverage by story. All real-time."

**End demo.**

---

*End of Claude Code Implementation Brief — TestForge v1.0*  
*All open questions resolved. Azure subscription: Everstory-owned. Ready for Day 1.*

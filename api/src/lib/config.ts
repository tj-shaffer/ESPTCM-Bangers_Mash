/**
 * Typed configuration loader.
 *
 * Required vars are validated on boot — `loadConfig()` throws with a single
 * message listing every missing var, so misconfiguration fails fast at startup
 * (Express index.ts catches the throw and exits 1).
 *
 * Optional vars are surfaced as `undefined` so call sites must handle absence
 * deliberately (e.g. the Anthropic cheap-tier model falls back to the primary).
 *
 * See CLAUDE.md / DECISIONS.md ADR-003 for the model-selection rationale.
 */

import 'dotenv/config';

const REQUIRED = [
  'DATABASE_URL',
  'ANTHROPIC_API_KEY',
  'JIRA_BASE_URL',
  'JIRA_SERVICE_ACCOUNT_EMAIL',
  'JIRA_SERVICE_ACCOUNT_TOKEN',
  'JIRA_DEFAULT_PROJECT_KEY',
  'JIRA_PROBLEM_ISSUE_TYPE',
  'TESTFORGE_INTERNAL_SECRET',
  'TEAMS_WEBHOOK_IT_APPLICATIONS',
  'TEAMS_WEBHOOK_REPORTING',
] as const;

type RequiredKey = (typeof REQUIRED)[number];

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;

  databaseUrl: string;

  anthropic: {
    apiKey: string;
    /** Primary model — used unless a feature routes to the cheap tier. */
    model: string;
    /** Optional Haiku-class model for high-frequency, low-cost calls. */
    cheapModel: string | undefined;
    monthlyBudgetUsd: number;
  };

  jira: {
    baseUrl: string;
    serviceAccountEmail: string;
    serviceAccountToken: string;
    defaultProjectKey: string;
    problemIssueType: string;
    /** Public base used to build deep links surfaced in Teams cards / panels. */
    publicBaseUrl: string;
  };

  /** v1 trust boundary (DECISIONS.md ADR-002). */
  internalSecret: string;
  /** Set after first `forge deploy`; absent during early local dev. */
  allowedForgeAppId: string | undefined;

  teams: {
    itApplicationsWebhook: string;
    reportingWebhook: string;
  };

  /** Used to build "View in TestForge" links from notifications. */
  forgeAppRouteBase: string | undefined;
}

function requireEnv(key: RequiredKey, missing: string[]): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    missing.push(key);
    return '';
  }
  return value;
}

function optionalEnv(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim() !== '' ? value : undefined;
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const missing: string[] = [];

  const databaseUrl = requireEnv('DATABASE_URL', missing);
  const anthropicApiKey = requireEnv('ANTHROPIC_API_KEY', missing);
  const jiraBaseUrl = requireEnv('JIRA_BASE_URL', missing);
  const jiraEmail = requireEnv('JIRA_SERVICE_ACCOUNT_EMAIL', missing);
  const jiraToken = requireEnv('JIRA_SERVICE_ACCOUNT_TOKEN', missing);
  const jiraProject = requireEnv('JIRA_DEFAULT_PROJECT_KEY', missing);
  const jiraProblemType = requireEnv('JIRA_PROBLEM_ISSUE_TYPE', missing);
  const internalSecret = requireEnv('TESTFORGE_INTERNAL_SECRET', missing);
  const teamsIt = requireEnv('TEAMS_WEBHOOK_IT_APPLICATIONS', missing);
  const teamsReporting = requireEnv('TEAMS_WEBHOOK_REPORTING', missing);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `See api/.env.example.`,
    );
  }

  const nodeEnvRaw = process.env.NODE_ENV ?? 'development';
  const nodeEnv: AppConfig['nodeEnv'] =
    nodeEnvRaw === 'production' || nodeEnvRaw === 'test' ? nodeEnvRaw : 'development';

  cached = {
    nodeEnv,
    port: Number.parseInt(process.env.PORT ?? '3001', 10),
    databaseUrl,
    anthropic: {
      apiKey: anthropicApiKey,
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      cheapModel: optionalEnv('ANTHROPIC_MODEL_CHEAP'),
      monthlyBudgetUsd: Number.parseInt(process.env.AI_MONTHLY_BUDGET_USD ?? '150', 10),
    },
    jira: {
      baseUrl: jiraBaseUrl,
      serviceAccountEmail: jiraEmail,
      serviceAccountToken: jiraToken,
      defaultProjectKey: jiraProject,
      problemIssueType: jiraProblemType,
      publicBaseUrl: optionalEnv('JIRA_PUBLIC_BASE_URL') ?? jiraBaseUrl,
    },
    internalSecret,
    allowedForgeAppId: optionalEnv('ALLOWED_FORGE_APP_ID'),
    teams: {
      itApplicationsWebhook: teamsIt,
      reportingWebhook: teamsReporting,
    },
    forgeAppRouteBase: optionalEnv('FORGE_APP_ROUTE_BASE'),
  };

  return cached;
}

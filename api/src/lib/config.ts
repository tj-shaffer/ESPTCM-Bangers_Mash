/**
 * Typed configuration loader (pilot / standalone web-app mode).
 *
 * The pilot ships as a standalone web app on Neon + Vercel (see DECISIONS.md
 * ADR-006 / memory "pilot-stack-neon-vercel"), gated by a shared password — it
 * does NOT need Jira / Anthropic / Teams to boot, so only DATABASE_URL and
 * TESTFORGE_PASSWORD are required. Integration creds remain OPTIONAL here so the
 * production build can light them up later without a schema change.
 *
 * Required vars are validated on boot — `loadConfig()` throws with a single
 * message listing every missing var.
 */

import dotenv from 'dotenv';

// Local dev: prefer .env.local, fall back to .env. On Vercel there are no env
// files — variables are injected into process.env directly, so these no-op.
dotenv.config({ path: '.env.local' });
dotenv.config();

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;

  databaseUrl: string;

  /** Shared password for the app's login gate. */
  password: string;
  /** HMAC secret used to sign session tokens. */
  authSecret: string;

  /** Optional integrations — undefined until provisioned. */
  anthropic: { apiKey: string; model: string; cheapModel: string | undefined } | undefined;
  jira:
    | {
        baseUrl: string;
        serviceAccountEmail: string;
        serviceAccountToken: string;
        defaultProjectKey: string;
        problemIssueType: string;
        issueTypes: string[];
      }
    | undefined;
}

function optionalEnv(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim() !== '' ? value : undefined;
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const missing: string[] = [];
  const databaseUrl = optionalEnv('DATABASE_URL');
  if (!databaseUrl) missing.push('DATABASE_URL');
  const password = optionalEnv('TESTFORGE_PASSWORD');
  if (!password) missing.push('TESTFORGE_PASSWORD');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. See api/.env.example.`,
    );
  }

  const nodeEnvRaw = process.env.NODE_ENV ?? 'development';
  const nodeEnv: AppConfig['nodeEnv'] =
    nodeEnvRaw === 'production' || nodeEnvRaw === 'test' ? nodeEnvRaw : 'development';

  // Prefer an explicit signing secret; fall back to a password-derived one in
  // dev so the app still boots. Always set TESTFORGE_INTERNAL_SECRET in prod.
  const authSecret = optionalEnv('TESTFORGE_INTERNAL_SECRET') ?? `dev-insecure-${password}`;

  const anthropicApiKey = optionalEnv('ANTHROPIC_API_KEY');
  const jiraBaseUrl = optionalEnv('JIRA_BASE_URL');
  // JIRA_PROBLEM_ISSUE_TYPE may be a comma-separated list (e.g. "Task,Story") —
  // the offered types; the first is the default.
  const jiraIssueTypes = (optionalEnv('JIRA_PROBLEM_ISSUE_TYPE') ?? 'Task')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  cached = {
    nodeEnv,
    port: Number.parseInt(process.env.PORT ?? '3001', 10),
    databaseUrl: databaseUrl!,
    password: password!,
    authSecret,
    anthropic: anthropicApiKey
      ? {
          apiKey: anthropicApiKey,
          model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
          cheapModel: optionalEnv('ANTHROPIC_MODEL_CHEAP'),
        }
      : undefined,
    jira: jiraBaseUrl
      ? {
          baseUrl: jiraBaseUrl,
          serviceAccountEmail: optionalEnv('JIRA_SERVICE_ACCOUNT_EMAIL') ?? '',
          serviceAccountToken: optionalEnv('JIRA_SERVICE_ACCOUNT_TOKEN') ?? '',
          defaultProjectKey: optionalEnv('JIRA_DEFAULT_PROJECT_KEY') ?? 'DS',
          problemIssueType: jiraIssueTypes[0] ?? 'Task',
          issueTypes: jiraIssueTypes,
        }
      : undefined,
  };

  return cached;
}

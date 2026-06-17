/**
 * Typed configuration loader (pilot / standalone web-app mode).
 *
 * The pilot ships as a standalone web app on Neon + Vercel (see DECISIONS.md
 * ADR-006 / memory "pilot-stack-neon-vercel"), with app-managed email+password
 * accounts (ADR-008) — it does NOT need Jira / Anthropic / Teams to boot, so
 * only DATABASE_URL is required. Integration creds remain OPTIONAL here so the
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

  /** HMAC secret used to sign session tokens. */
  authSecret: string;

  /**
   * Seed credentials for the first SUPER_ADMIN, applied idempotently on boot so
   * the role panel is reachable on a fresh database. Undefined if unset (e.g.
   * once a real admin exists you can drop these). See DECISIONS.md ADR-008.
   */
  bootstrapAdmin: { email: string; password: string } | undefined;

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

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. See api/.env.example.`,
    );
  }

  const nodeEnvRaw = process.env.NODE_ENV ?? 'development';
  const nodeEnv: AppConfig['nodeEnv'] =
    nodeEnvRaw === 'production' || nodeEnvRaw === 'test' ? nodeEnvRaw : 'development';

  // Prefer an explicit signing secret; fall back to an insecure constant in dev
  // so the app still boots. Always set TESTFORGE_INTERNAL_SECRET in prod.
  const authSecret = optionalEnv('TESTFORGE_INTERNAL_SECRET') ?? 'dev-insecure-secret';

  const bootstrapEmail = optionalEnv('BOOTSTRAP_ADMIN_EMAIL');
  const bootstrapPassword = optionalEnv('BOOTSTRAP_ADMIN_PASSWORD');

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
    authSecret,
    bootstrapAdmin:
      bootstrapEmail && bootstrapPassword
        ? { email: bootstrapEmail, password: bootstrapPassword }
        : undefined,
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

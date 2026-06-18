/**
 * Jira REST v3 client (personal API token, Basic auth). Node 20 global fetch.
 *
 * `check()` is read-only (auth + project metadata) for verification.
 * `createProblem()` creates an issue — wired into dispatch only when we're
 * ready to write.
 */

import { loadConfig } from '../lib/config';

export interface JiraCheckResult {
  configured: boolean;
  ok: boolean;
  status: number;
  displayName?: string;
  email?: string;
  projectKey: string;
  projectFound: boolean;
  issueTypes: string[];
  configuredIssueType: string;
  issueTypeExists: boolean;
  requiredFields: { key: string; name: string }[];
  message: string;
}

function jiraCfg() {
  return loadConfig().jira;
}

function authHeaders(): Record<string, string> {
  const cfg = jiraCfg()!;
  const basic = Buffer.from(`${cfg.serviceAccountEmail}:${cfg.serviceAccountToken}`).toString('base64');
  return { Authorization: `Basic ${basic}`, Accept: 'application/json' };
}

export function jiraConfigured(): boolean {
  return !!jiraCfg();
}

/** Browse URL for an issue key, or undefined if Jira isn't configured. No network call. */
export function jiraBrowseUrl(key: string): string | undefined {
  const cfg = jiraCfg();
  if (!cfg) return undefined;
  return `${cfg.baseUrl.replace(/\/$/, '')}/browse/${key.trim()}`;
}

/** The issue types offered for filing (from JIRA_PROBLEM_ISSUE_TYPE). No network call.
 *  Sub-tasks are excluded — they require a parent and can't be created standalone. */
export function jiraOptions(): { configured: boolean; issueTypes: string[] } {
  const cfg = jiraCfg();
  const types = (cfg?.issueTypes ?? []).filter((t) => t.toLowerCase().replace(/[-\s]/g, '') !== 'subtask');
  return { configured: !!cfg, issueTypes: types };
}

export interface JiraIssueSummary {
  key: string;
  summary: string;
  url: string;
  issueType?: string;
  status?: string;
}

/**
 * Search Jira issues to link to a test case. A query that looks like an issue
 * key (e.g. `PLOT-1234`) is matched exactly; anything else is a text search on
 * summary. Uses the non-deprecated `/rest/api/3/search/jql` endpoint.
 */
export async function jiraSearch(query: string): Promise<JiraIssueSummary[]> {
  const cfg = jiraCfg();
  const q = query.trim();
  if (!cfg || !q) return [];
  const root = cfg.baseUrl.replace(/\/$/, '');
  const headers = authHeaders();

  const escaped = q.replace(/["\\]/g, '\\$&');
  const jql = /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(q)
    ? `key = "${q.toUpperCase()}"`
    : `summary ~ "${escaped}*" ORDER BY updated DESC`;

  const url = `${root}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=10&fields=summary,issuetype,status`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira search failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    issues?: { key: string; fields?: { summary?: string; issuetype?: { name?: string }; status?: { name?: string } } }[];
  };
  return (data.issues ?? []).map((i) => ({
    key: i.key,
    summary: i.fields?.summary ?? '',
    issueType: i.fields?.issuetype?.name,
    status: i.fields?.status?.name,
    url: `${root}/browse/${i.key}`,
  }));
}

export async function jiraCheck(): Promise<JiraCheckResult> {
  const cfg = jiraCfg();
  const base = { projectKey: cfg?.defaultProjectKey ?? '', configuredIssueType: cfg?.problemIssueType ?? '' };
  if (!cfg) {
    return {
      configured: false,
      ok: false,
      status: 0,
      projectFound: false,
      issueTypes: [],
      issueTypeExists: false,
      requiredFields: [],
      message: 'Jira is not configured (JIRA_BASE_URL missing).',
      ...base,
    };
  }

  const root = cfg.baseUrl.replace(/\/$/, '');
  const headers = authHeaders();

  const me = await fetch(`${root}/rest/api/3/myself`, { headers });
  if (!me.ok) {
    return {
      configured: true,
      ok: false,
      status: me.status,
      projectFound: false,
      issueTypes: [],
      issueTypeExists: false,
      requiredFields: [],
      message:
        me.status === 401
          ? 'Auth rejected (401). Use a CLASSIC API token (~24 chars) and confirm the email matches the token’s account.'
          : `Jira returned HTTP ${me.status} for /myself.`,
      ...base,
    };
  }
  const meJson = (await me.json()) as { displayName?: string; emailAddress?: string };

  const cm = await fetch(
    `${root}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(cfg.defaultProjectKey)}&expand=projects.issuetypes.fields`,
    { headers },
  );
  let issueTypes: string[] = [];
  let requiredFields: { key: string; name: string }[] = [];
  let projectFound = false;
  let issueTypeExists = false;
  if (cm.ok) {
    const data = (await cm.json()) as {
      projects?: { issuetypes?: { name: string; fields?: Record<string, { required?: boolean; name?: string }> }[] }[];
    };
    const proj = data.projects?.[0];
    if (proj) {
      projectFound = true;
      issueTypes = (proj.issuetypes ?? []).map((i) => i.name);
      const match = (proj.issuetypes ?? []).find(
        (i) => i.name.toLowerCase() === cfg.problemIssueType.toLowerCase(),
      );
      if (match) {
        issueTypeExists = true;
        requiredFields = Object.entries(match.fields ?? {})
          .filter(([k, v]) => v.required && !['summary', 'issuetype', 'project'].includes(k))
          .map(([k, v]) => ({ key: k, name: v.name ?? k }));
      }
    }
  }

  return {
    configured: true,
    ok: true,
    status: 200,
    displayName: meJson.displayName,
    email: meJson.emailAddress,
    projectFound,
    issueTypes,
    issueTypeExists,
    requiredFields,
    message: projectFound
      ? `Connected as ${meJson.displayName}. Project ${cfg.defaultProjectKey} reachable.`
      : `Connected as ${meJson.displayName}, but project ${cfg.defaultProjectKey} not visible to this account.`,
    ...base,
  };
}

/** Create a Jira issue (e.g. a defect). Returns the new issue key + URL. */
export async function jiraCreateProblem(input: {
  summary: string;
  description?: string;
  severity?: string;
  issueType?: string;
}): Promise<{ key: string; url: string }> {
  const cfg = jiraCfg();
  if (!cfg) throw new Error('Jira is not configured');
  const root = cfg.baseUrl.replace(/\/$/, '');
  const headers = authHeaders();

  // Reporter is required on PLOT's issue types — use the token owner.
  const meRes = await fetch(`${root}/rest/api/3/myself`, { headers });
  if (!meRes.ok) throw new Error(`Jira auth failed (${meRes.status}) — check the token.`);
  const accountId = ((await meRes.json()) as { accountId?: string }).accountId;

  const descText = [input.description, input.severity ? `Severity: ${input.severity}` : '', 'Filed from Bangers & Mash.']
    .filter(Boolean)
    .join('\n\n');
  const adf = {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text: descText || input.summary }] }],
  };

  const res = await fetch(`${root}/rest/api/3/issue`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        project: { key: cfg.defaultProjectKey },
        issuetype: { name: input.issueType ?? cfg.problemIssueType },
        summary: input.summary.slice(0, 250),
        description: adf,
        ...(accountId ? { reporter: { id: accountId } } : {}),
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira create failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = (await res.json()) as { key: string };
  return { key: data.key, url: `${root}/browse/${data.key}` };
}

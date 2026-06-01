/**
 * Webtrigger handler — placeholder. Vendor webhooks (Plotbox/Lawson/Coupa/HG
 * push release events here) and Jira product events land here in later phases.
 *
 * Live wiring follows PRD §6.7 (Vendor Change Tracker) and §6.4.4 (Jira
 * Automation Triggers — Phase 2). For now: respond 200 so the webtrigger
 * binding is validated by `forge lint` and the deploy pipeline.
 */

interface WebtriggerRequest {
  body?: string;
  method?: string;
  headers?: Record<string, string | undefined>;
}

interface WebtriggerResponse {
  statusCode: number;
  body?: string;
  headers?: Record<string, string>;
}

export async function handler(req: WebtriggerRequest): Promise<WebtriggerResponse> {
  console.log(
    `[webtrigger] received ${req.method ?? 'POST'} body=${(req.body ?? '').slice(0, 200)}`,
  );
  return {
    statusCode: 202,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accepted: true }),
  };
}

import { SlackApiError } from "./errors";

/**
 * Shared Slack Web API request helper.
 *
 * Per docs/rules/project-structure-and-module-boundaries.md: provider HTTP
 * helpers live in `integrations/<p>/api/` and are consumed only by that
 * provider's action handlers. This helper centralizes:
 *
 *   - Base-URL resolution (SLACK_API_BASE env override for e2e mocks; defaults
 *     to https://slack.com in production).
 *   - POST + JSON body + Bearer auth header (Slack's `application/json`
 *     auth-header transport, not the legacy `token` form-body transport).
 *   - Slack's "ok: false even on HTTP 200" convention — throws
 *     SlackApiError with the Slack code on logical failure, and with
 *     `http_<status>` on non-2xx.
 *
 * Wrappers receive the parsed body when `ok === true` and do their own
 * defense-in-depth field-presence check (each wrapper knows which fields
 * Slack guarantees on success for its endpoint).
 *
 * Base URL is env-overridable for e2e testing only. Production leaves
 * SLACK_API_BASE unset; defaults to real Slack. The override is opt-in
 * via env and lives at the network boundary — handler logic, schema
 * validation, token decryption all run unchanged regardless.
 */
function slackApiBase(): string {
  return process.env.SLACK_API_BASE ?? "https://slack.com";
}

export interface SlackOkResponse {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export async function slackApiRequest<TResponse extends SlackOkResponse>(
  endpoint: string,
  botToken: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const response = await fetch(`${slackApiBase()}/api/${endpoint}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${botToken}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  // Non-2xx is typically a token / scope / rate-limit problem. Distinct
  // error code shape (http_<status>) lets callers and the humanizer
  // distinguish it from logical Slack errors.
  if (!response.ok) {
    throw new SlackApiError(`http_${response.status}`);
  }

  const data = (await response.json()) as TResponse;
  if (!data.ok) {
    throw new SlackApiError(data.error ?? "unknown_error");
  }
  return data;
}

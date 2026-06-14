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

  // Non-2xx is typically a token / scope / rate-limit problem. Slack OFTEN
  // still returns its JSON envelope ({ ok:false, error:"<code>" }) alongside a
  // 401/403/429 — that logical code is far more TRUTHFUL than the bare HTTP
  // status, and the option-source classifier (`isSlackAuthError`) needs it to
  // tell a revoked token (reconnect) apart from a transient/scope failure
  // (V2-READY-27). Prefer the logical code when the body carries one; fall back
  // to `http_<status>` only when the body is absent / not JSON / has no error
  // string (e.g. a 429 with a plain-text "rate limited" body).
  if (!response.ok) {
    const logicalCode = await readSlackLogicalErrorCode(response);
    throw new SlackApiError(logicalCode ?? `http_${response.status}`);
  }

  const data = (await response.json()) as TResponse;
  if (!data.ok) {
    throw new SlackApiError(data.error ?? "unknown_error");
  }
  return data;
}

/**
 * Best-effort extraction of Slack's logical error code from a NON-2xx response
 * body. Slack sometimes returns the JSON envelope `{ ok:false, error:"<code>" }`
 * alongside a 401/403/429. Returns the code when present + non-empty; null when
 * the body is missing, not JSON, or carries no error string (the caller then
 * falls back to `http_<status>`). Never throws — and never surfaces the raw body.
 */
async function readSlackLogicalErrorCode(
  response: Response,
): Promise<string | null> {
  try {
    const text = await response.text();
    if (!text) return null;
    const parsed = JSON.parse(text) as { error?: unknown };
    return typeof parsed.error === "string" && parsed.error.length > 0
      ? parsed.error
      : null;
  } catch {
    return null;
  }
}

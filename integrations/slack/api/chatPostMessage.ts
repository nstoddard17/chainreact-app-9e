import { SlackApiError } from "./errors";

/**
 * Minimal Slack chat.postMessage client.
 *
 * Per docs/rules/project-structure-and-module-boundaries.md: provider HTTP
 * helpers live next to the handler that uses them
 * (`integrations/<p>/api/`), not in a global `lib/` folder.
 *
 * Slack returns 200 even on logical errors with `{ ok: false, error: "..." }`
 * — we surface that as an exception with the Slack error code, which the
 * engine maps to a HANDLER_FAILED step.
 *
 * Re-exports SlackApiError from `./errors` for back-compat with the
 * existing slice-1 chatPostMessage test that imports it from here.
 */
export { SlackApiError } from "./errors";

/**
 * Base URL is env-overridable for e2e testing only. Production leaves
 * SLACK_API_BASE unset; defaults to real Slack. Override is opt-in via env
 * and lives at the network boundary — handler logic, schema validation,
 * token decryption all run unchanged regardless.
 */
function endpoint(): string {
  const base = process.env.SLACK_API_BASE ?? "https://slack.com";
  return `${base}/api/chat.postMessage`;
}

export interface ChatPostMessageInput {
  /** Slack bot OAuth token (xoxb-…). */
  botToken: string;
  /** Channel id (`C…`), DM id (`D…`), or `#name`. */
  channel: string;
  /** Message text. Slack supports up to 40k chars; we don't truncate. */
  text: string;
  /**
   * Optional. Post as a thread reply to the message with this Slack
   * timestamp. Slack ignores the parent message's channel — `channel`
   * above must point at the channel the thread parent lives in.
   * Slack 2.1 expansion (Commit 4) — bot-token only, no broadcast.
   */
  threadTs?: string;
}

export interface ChatPostMessageResult {
  /** Slack message timestamp ("1730000000.000123") — the message id. */
  ts: string;
  /** Resolved channel id Slack picked when caller used a name. */
  channel: string;
  /** Bot's posted message — Slack returns the resolved server-side payload. */
  message: Readonly<Record<string, unknown>>;
}

interface SlackResponseBody {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
  message?: Record<string, unknown>;
}

export async function chatPostMessage(
  input: ChatPostMessageInput,
): Promise<ChatPostMessageResult> {
  // Build the body conditionally — Slack rejects { thread_ts: undefined } as
  // an explicit null in some payload paths; keeping the key absent is safer
  // than passing undefined through JSON.stringify (which would drop it
  // anyway, but the explicit shape makes intent obvious).
  const body: Record<string, unknown> = {
    channel: input.channel,
    text: input.text,
  };
  if (input.threadTs !== undefined) {
    body.thread_ts = input.threadTs;
  }

  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.botToken}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  // Slack uses 200 for both success and most logical errors. A non-2xx is
  // typically a token or scope problem (or rate limit) — treat as transport
  // failure with the HTTP status as the error code so the engine sees a
  // distinct shape from logical errors.
  if (!response.ok) {
    throw new SlackApiError(`http_${response.status}`);
  }

  const responseBody = (await response.json()) as SlackResponseBody;
  if (!responseBody.ok) {
    throw new SlackApiError(responseBody.error ?? "unknown_error");
  }
  if (!responseBody.ts || !responseBody.channel || !responseBody.message) {
    // Defense-in-depth — Slack contract violation.
    throw new SlackApiError("malformed_response");
  }
  return {
    ts: responseBody.ts,
    channel: responseBody.channel,
    message: responseBody.message,
  };
}

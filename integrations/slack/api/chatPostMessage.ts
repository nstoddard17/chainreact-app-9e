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
  /**
   * Message text. Optional when `blocks` is provided (then `text` serves
   * as the notification preview / accessibility fallback). When neither
   * `text` nor `blocks` is provided, the wrapper throws before calling
   * Slack — never silently send an empty message. Slack supports up to
   * 40k chars; we don't truncate.
   */
  text?: string;
  /**
   * Optional Block Kit blocks payload. Slack 2.1 Commit 7
   * (post_interactive_blocks) consumes this for rich message rendering.
   * Each block must have at least a string `type` (validated at the
   * handler / schema layer; the wrapper passes the array through
   * verbatim).
   */
  blocks?: ReadonlyArray<Readonly<Record<string, unknown>>>;
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
  // Defense-in-depth: Slack rejects messages with neither text nor blocks
  // with a logical error. Throw locally with a clearer message so the
  // engine surfaces it as a config-shape problem, not as a Slack API
  // failure that looks like the bot misbehaved. Empty `blocks` array
  // also counts as absent.
  const hasText = input.text !== undefined && input.text.length > 0;
  const hasBlocks = input.blocks !== undefined && input.blocks.length > 0;
  if (!hasText && !hasBlocks) {
    throw new SlackApiError("missing_text_or_blocks");
  }

  // Build the body conditionally — keeping unset keys out of the body
  // makes the intent obvious and avoids accidentally sending
  // `{ text: undefined }` which JSON.stringify drops but reads
  // ambiguously.
  const body: Record<string, unknown> = {
    channel: input.channel,
  };
  if (input.text !== undefined) {
    body.text = input.text;
  }
  if (input.blocks !== undefined) {
    body.blocks = input.blocks;
  }
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

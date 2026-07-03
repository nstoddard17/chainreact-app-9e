import { slackApiRequestForm, type SlackOkResponse } from "./_request";
import { SlackApiError } from "./errors";

/**
 * Slack `conversations.info` client (Slack 2.3 Commit 2).
 *
 * Reads a single channel object by id. Returns Slack's `channel` object
 * verbatim (snake_case keys); the action handler projects useful flat
 * fields onto the output for convenient downstream access while keeping
 * the full raw object available.
 *
 * Slack docs: https://api.slack.com/methods/conversations.info
 *
 * TRANSPORT: form-encoded (`slackApiRequestForm`), NOT JSON. conversations.info rejects
 * the `application/json` body with `invalid_arguments` (verified live); its flat `channel`
 * param must be form-encoded. Response shape is unchanged.
 *
 * Scopes required vary by channel kind:
 *   - public channel (C…) → `channels:read`
 *   - private channel (C… or legacy G… with channel_type=group) → `groups:read`
 *   - DM (D…) → `im:read` (not used in 2.3)
 *   - mpim (G…) → `mpim:read` (not used in 2.3)
 *
 * Slack 2.3 grants public + private read. The wrapper does not enforce
 * scope — the manifest declares what's requested; the handler decides
 * what id to pass.
 */
export interface ConversationsInfoInput {
  botToken: string;
  /** Slack channel id (C… or G…). No name-resolution. */
  channel: string;
}

export interface ConversationsInfoResult {
  channel: Readonly<Record<string, unknown>>;
}

interface SlackResponseBody extends SlackOkResponse {
  channel?: Record<string, unknown>;
}

export async function conversationsInfo(
  input: ConversationsInfoInput,
): Promise<ConversationsInfoResult> {
  const response = await slackApiRequestForm<SlackResponseBody>(
    "conversations.info",
    input.botToken,
    { channel: input.channel },
  );

  // Slack documents `channel` as guaranteed on `ok: true`. Defense in
  // depth — a malformed-but-200 response shouldn't surface as a TypeError
  // downstream; convert to the same SlackApiError shape every other
  // wrapper raises on logical failure.
  if (!response.channel) {
    throw new SlackApiError("channel_not_found");
  }
  return { channel: response.channel };
}

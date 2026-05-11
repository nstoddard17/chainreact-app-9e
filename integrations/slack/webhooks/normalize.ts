import {
  TriggerEventSchema,
  type TriggerEvent,
} from "@/contracts/triggerEvent";

/**
 * Slack event payload → canonical TriggerEvent.
 *
 * Per docs/rules/webhook-receipt-routes.md §"V2 intended behavior":
 *   - Pure function. No I/O.
 *   - The output is validated against TriggerEventSchema; a parse failure
 *     means the Slack payload was unexpectedly shaped (drop & log
 *     upstream, do not throw silently).
 *
 * Slack Events API payload shape we consume:
 *   {
 *     type: "event_callback",
 *     team_id: "T0001",
 *     event_id: "Ev123",
 *     event_time: 1730000000,           // unix seconds
 *     event: { type: "message", channel: "C123", user: "U1", text: "hi", ... },
 *     ...
 *   }
 *
 * Canonical eventType naming (P-S2 / Slack 2.1, see
 * docs/slices/slack-2-1-messaging-reactions-plan.md §3):
 *
 *   message   → slack.message.channel | slack.message.im | slack.message.mpim
 *   reaction_added   → slack.reaction_added
 *   reaction_removed → slack.reaction_removed
 *   <other>          → slack.<event.type>            (forward-compatible
 *                                                     namespace; no filter
 *                                                     registered → dispatcher
 *                                                     drops with matched=0)
 *
 * For `message`, the channel kind is derived from `event.channel_type` when
 * present (Slack-authoritative) and from the channel-id prefix as fallback.
 * Mirrors V1 normalizer logic at
 *   c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e\lib\webhooks\normalizer.ts:170-189
 *
 * The inner Slack `event` object is passed through verbatim as `payload`.
 * Filters and action handlers index into it directly
 * (`event.payload.channel`, `event.payload.reaction`, `event.payload.user`,
 * `event.payload.ts`, `event.payload.thread_ts`, `event.payload.item`, …).
 */

export interface SlackEventCallbackPayload {
  type: "event_callback";
  team_id: string;
  event_id: string;
  event_time: number;
  event: {
    type: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function normalizeSlackEvent(
  payload: SlackEventCallbackPayload,
): TriggerEvent {
  const candidate: TriggerEvent = {
    provider: "slack",
    eventType: deriveCanonicalEventType(payload.event),
    eventId: payload.event_id,
    occurredAt: new Date(payload.event_time * 1000).toISOString(),
    accountId: payload.team_id,
    payload: payload.event,
  };
  // Defense-in-depth: validate the canonical shape so a malformed Slack
  // payload doesn't reach the dispatcher.
  return TriggerEventSchema.parse(candidate);
}

function deriveCanonicalEventType(event: SlackEventCallbackPayload["event"]): string {
  // Defense-in-depth: a Slack `event_callback` envelope must carry an
  // inner `event.type` string. Reject empty/missing here so the bad
  // payload never reaches the dispatcher with a meaningless `slack.`
  // canonical type. (TriggerEventSchema's min(1) wouldn't catch this
  // because we'd be appending the empty string to a non-empty prefix.)
  if (typeof event.type !== "string" || event.type.length === 0) {
    throw new Error("Slack event has no type — cannot derive canonical eventType.");
  }

  if (event.type === "message") {
    const kind = inferMessageChannelKind(event);
    return kind ? `slack.message.${kind}` : "slack.message";
  }
  return `slack.${event.type}`;
}

/**
 * Resolve the message's channel kind: "channel" (public), "im" (DM),
 * or "mpim" (group DM). Returns null only when neither `channel_type`
 * nor a recognizable channel-id prefix is present — caller emits a
 * generic `slack.message` (no filter registered → dispatcher drops).
 *
 * Slack's `channel_type` is authoritative when present. The id-prefix
 * fallback exists because some message subtypes (`message_changed`,
 * `bot_message`) and older payload shapes omit `channel_type`.
 */
function inferMessageChannelKind(
  event: SlackEventCallbackPayload["event"],
): "channel" | "im" | "mpim" | null {
  const channelType = event.channel_type;
  if (channelType === "channel") return "channel";
  if (channelType === "im") return "im";
  if (channelType === "mpim") return "mpim";

  const channel = event.channel;
  if (typeof channel === "string") {
    if (channel.startsWith("C")) return "channel";
    if (channel.startsWith("D")) return "im";
    if (channel.startsWith("G")) return "mpim";
  }

  return null;
}

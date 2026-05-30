import type { TriggerEvent } from "@/contracts/triggerEvent";
import { createHash } from "node:crypto";

/**
 * Convert a Mailchimp webhook delivery to V2's canonical `TriggerEvent`
 * shape — Slice 14 Commit 4.
 *
 * **Wire format: form-encoded with bracket-notation keys.** Per current
 * Mailchimp docs, list webhooks POST `application/x-www-form-urlencoded`
 * bodies with `type=...` at top level and event details under nested
 * `data[...]` keys. Example for a subscribe event:
 *
 *   type=subscribe
 *   fired_at=2025-05-10T12:34:56+00:00
 *   data[id]=abcdef0123
 *   data[list_id]=1a2b3c4d5e
 *   data[email]=urist@example.com
 *   data[email_type]=html
 *   data[merges][FNAME]=Urist
 *   data[merges][LNAME]=McVankab
 *   data[ip_opt]=192.0.2.1
 *
 * V2 parses the form body via `URLSearchParams` then flattens the
 * bracket-notation keys into a structured `parsed` object for
 * downstream convenience while preserving the raw form-key map at
 * `parsed.raw` so workflows that need exact wire-shape access can
 * still get it.
 *
 * **No signature.** Mailchimp doesn't sign webhook deliveries — see
 * `_shared/mailchimp/webhooks/signature.ts` for the explicit "no
 * scheme available" note. Authenticity model is URL secrecy + audience
 * id match + event-type allowlist + `sha256(rawBody)` dedup.
 *
 * **Dedup key.** Mailchimp re-sends the same body verbatim on retry,
 * so `sha256(rawBody)` is a stable cross-retry key. We expose the
 * helper so the route can pass it as the `TriggerEvent.eventId`
 * (which `dispatchTriggerEvent` uses with `webhook_event_dedup`).
 *
 * Canonical TriggerEvent fields:
 *   - `provider: "mailchimp"`.
 *   - `eventType: "audience_event"` — V2's consolidated trigger name.
 *     Workflows branch on `payload.type` for the actual Mailchimp event
 *     discriminator (subscribe / unsubscribe / profile / upemail /
 *     cleaned / campaign).
 *   - `eventId` — sha256(rawBody) hex digest.
 *   - `occurredAt` — ISO-8601. Prefers Mailchimp's `fired_at`; falls
 *     back to the receive timestamp.
 *   - `accountId` — Mailchimp `account_id` (stored at OAuth callback
 *     time as `integration.accountId`). NOT the audience id.
 *     Provided by the receive helper after the integration lookup.
 *   - `payload` carries `type` (Mailchimp event name) / `audienceId` /
 *     `email` / `subscriberHash` / `firedAt` / `parsed` (flattened
 *     fields) / `raw` (form-key map).
 */

export const MAILCHIMP_TRIGGER_EVENT_TYPE = "audience_event";

export type MailchimpEventName =
  | "subscribe"
  | "unsubscribe"
  | "profile"
  | "cleaned"
  | "upemail"
  | "campaign";

export interface MailchimpParsedPayload {
  /** Top-level `type` from the form body. */
  type: MailchimpEventName | string;
  /** Top-level `fired_at` from the form body (Mailchimp ISO-8601). */
  firedAt: string | null;
  /** Flattened `data[...]` fields. Bracket-notation paths preserved. */
  data: Record<string, string>;
  /** Subset: nested `data[merges][KEY]` merge fields extracted. */
  merges: Record<string, string>;
}

/**
 * Parse a Mailchimp form-encoded body string into a structured shape.
 *
 *   - `type` → `parsed.type`
 *   - `fired_at` → `parsed.firedAt` (null when absent)
 *   - `data[FIELD]` → `parsed.data.FIELD`
 *   - `data[merges][KEY]` → BOTH `parsed.data["merges][KEY"]` (raw key)
 *     AND `parsed.merges.KEY` (convenience)
 *
 * URLSearchParams handles URL-decoding; we just walk the entries and
 * sort the relevant keys into our buckets.
 *
 * Returns a parsed result even when the body has nothing useful —
 * callers (the receive helper) decide whether to dispatch.
 */
export function parseMailchimpFormBody(
  rawBody: string,
): MailchimpParsedPayload {
  const params = new URLSearchParams(rawBody);
  const data: Record<string, string> = {};
  const merges: Record<string, string> = {};
  let type = "";
  let firedAt: string | null = null;

  for (const [key, value] of params.entries()) {
    if (key === "type") {
      type = value;
      continue;
    }
    if (key === "fired_at") {
      firedAt = value;
      continue;
    }
    // Anything starting with `data[` is a data-field. We strip the
    // outer `data[...]` to keep the inner path readable.
    if (key.startsWith("data[") && key.endsWith("]")) {
      const inner = key.slice("data[".length, -1);
      data[inner] = value;

      // Extract nested merge fields. The wire-format for them is
      // `data[merges][FNAME]` which `URLSearchParams` reads as the
      // literal key `data[merges][FNAME]`. After stripping the outer
      // `data[` and trailing `]`, we get `merges][FNAME` — split on
      // `][` to recover the inner key.
      if (inner.startsWith("merges][")) {
        const mergeKey = inner.slice("merges][".length);
        merges[mergeKey] = value;
      }
    }
  }

  return { type, firedAt, data, merges };
}

/**
 * SHA-256 hex digest of the raw body — used as the dedup key for
 * `webhook_event_dedup`.
 */
export function mailchimpDedupKey(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export interface NormalizeMailchimpEventInput {
  rawBody: string;
  parsed: MailchimpParsedPayload;
  /**
   * Account id from the integration row's `providerAccountId`. The
   * receive helper looks up the trigger first; the trigger row carries
   * the `accountId` for the integration that owns the webhook.
   */
  accountId: string;
}

function bestOccurredAt(parsed: MailchimpParsedPayload): string {
  if (parsed.firedAt && parsed.firedAt.length > 0) {
    // Mailchimp's `fired_at` per docs: "YYYY-MM-DD HH:MM:SS" or
    // ISO-8601. Forward verbatim — workflows can normalize if
    // needed.
    return parsed.firedAt;
  }
  return new Date().toISOString();
}

export function normalizeMailchimpEvent(
  input: NormalizeMailchimpEventInput,
): TriggerEvent {
  const email = input.parsed.data.email ?? null;
  return {
    provider: "mailchimp",
    eventType: MAILCHIMP_TRIGGER_EVENT_TYPE,
    eventId: mailchimpDedupKey(input.rawBody),
    occurredAt: bestOccurredAt(input.parsed),
    providerAccountId: input.accountId,
    payload: {
      type: input.parsed.type,
      audienceId: input.parsed.data.list_id ?? null,
      email,
      // Mailchimp `data[id]` is the subscriber hash on
      // subscribe/unsubscribe/profile/cleaned/upemail events; for
      // `campaign` events it's the campaign id. Exposed as
      // `subscriberHash` for the subscriber-style events and as
      // `campaignId` for clarity in the payload.
      subscriberHash:
        input.parsed.type === "campaign" ? null : input.parsed.data.id ?? null,
      campaignId:
        input.parsed.type === "campaign" ? input.parsed.data.id ?? null : null,
      firedAt: input.parsed.firedAt,
      parsed: input.parsed,
    },
  };
}

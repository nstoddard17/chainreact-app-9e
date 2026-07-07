/**
 * Trigger-smoke — mailchimp:audience_event pure spec (Lane C direct-seed, on the
 * generic orchestrator in directSeedWebhookSmoke.ts).
 *
 * Mailchimp does NOT sign webhook deliveries — there is no signature scheme to
 * exercise. The production authenticity model is exactly what this smoke
 * drives: URL secrecy (`?workflowId=&nodeId=`), audience-id match against the
 * seeded row, the event-type allowlist (global AND activation-time selection),
 * and `sha256(rawBody)` dedup via dispatchTriggerEvent.
 *
 * DEDUP KEY IS A CONTENT HASH: the identity's `eventId` is sha256 of the exact
 * form-encoded body — so the body is built deterministically at mint time and
 * the SAME bytes are re-sent for the dedup proof (mirrors Mailchimp's retry
 * behavior of re-posting the identical body).
 *
 * The synthetic delivery is a `subscribe` event whose fields are all
 * smoke-minted: a crsmoke audience id and a `crsmoke-…@example.invalid` email
 * (RFC 2606 reserved TLD — never a deliverable address, no real subscriber, no
 * PII). Merge fields are omitted.
 *
 * HONEST SCOPE: V2 ingestion-path cert for the Mailchimp event shape (route →
 * form-body parse → audience gate → event-type allowlist → normalize →
 * dispatch → content-hash dedup → enqueue → terminal run). Does NOT certify
 * Mailchimp provider-side webhook activation, and does NOT claim Mailchimp
 * delivered the event.
 */
import { createHash } from "node:crypto";
import {
  buildDirectSeedSmokeWorkflow,
  type DirectSeedSmokeIdentity,
  type DirectSeedWebhookSpec,
} from "./directSeedWebhookSmoke";

export const MAILCHIMP_AUDIENCE_EVENT_EVENT_TYPE = "audience_event";
/** Allowlisted Mailchimp event type the synthetic delivery uses. */
export const MAILCHIMP_SMOKE_EVENT_NAME = "subscribe";

export interface MailchimpWebhookSmokeIdentity extends DirectSeedSmokeIdentity {
  /** sha256(rawBody) hex — TriggerEvent.eventId + the dedup key. */
  readonly eventId: string;
  /** Synthetic audience (list) id — seeded on the row AND sent in the body. */
  readonly audienceId: string;
  /** Smoke-minted subscriber email (reserved .invalid TLD; the marker). */
  readonly email: string;
  /** Synthetic subscriber hash (`data[id]` on subscriber-style events). */
  readonly subscriberHash: string;
  /** Synthetic provider account id seeded on the trigger row. */
  readonly providerAccountId: string;
  /** ISO timestamp stamped as `fired_at`. */
  readonly firedAt: string;
  /** The exact form-encoded body bytes (hash = eventId). */
  readonly rawBody: string;
}

export interface MailchimpSmokeSeed {
  readonly audienceId: string;
  readonly email: string;
  readonly subscriberHash: string;
  readonly firedAt: string;
}

/** Deterministic form-encoded body (Mailchimp's wire format). */
export function buildMailchimpSmokeBody(seed: MailchimpSmokeSeed): string {
  const params = new URLSearchParams();
  params.set("type", MAILCHIMP_SMOKE_EVENT_NAME);
  params.set("fired_at", seed.firedAt);
  params.set("data[id]", seed.subscriberHash);
  params.set("data[list_id]", seed.audienceId);
  params.set("data[email]", seed.email);
  params.set("data[email_type]", "html");
  return params.toString();
}

/** sha256 hex of the raw body — MUST equal production's mailchimpDedupKey. */
export function mailchimpSmokeDedupKey(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export const MAILCHIMP_AUDIENCE_EVENT_SPEC: DirectSeedWebhookSpec<MailchimpWebhookSmokeIdentity> = {
  label: "mailchimp:audience_event",
  provider: "mailchimp",
  expectedEventType: MAILCHIMP_AUDIENCE_EVENT_EVENT_TYPE,
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "mailchimp",
      MAILCHIMP_AUDIENCE_EVENT_EVENT_TYPE,
      // Both meta REQUIRED builder fields. The receive route reads the SEEDED
      // row's audienceId + eventTypes; the node config mirrors them so the
      // readiness gate passes. The audienceId here is a fixed placeholder —
      // the per-run minted audienceId lives on the seeded trigger row (the
      // node config is not read by the receive path).
      { audienceId: "crsmoke-audience", eventTypes: [MAILCHIMP_SMOKE_EVENT_NAME] },
      "mailchimp:audience_event",
    ),
  identityMatches: (run, identity) => {
    if (run.eventId !== identity.eventId) return false;
    if (run.eventType !== MAILCHIMP_AUDIENCE_EVENT_EVENT_TYPE) return false;
    const payload = run.triggerPayload;
    if (!payload || payload.type !== MAILCHIMP_SMOKE_EVENT_NAME) return false;
    if (payload.audienceId !== identity.audienceId) return false;
    // Marker proof: the normalized payload preserves the smoke-minted email
    // (crsmoke marker, reserved .invalid TLD) + subscriber hash verbatim.
    return (
      payload.email === identity.email &&
      payload.subscriberHash === identity.subscriberHash
    );
  },
};

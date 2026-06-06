import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for stripe_billing_events — the platform billing webhook dedup ledger
 * (Slice 4.BILLING-PLAN-METADATA-5 / CS-4).
 *
 * Service-role ONLY (the table grants authenticated/anon nothing + deny-all RLS). Written
 * only by the webhook handler AFTER a verified signature. Stores safe ids only — never
 * payload, email, amounts, or secrets.
 *
 * Dedup model is "check, process, then record": the handler checks `hasProcessed` before
 * doing idempotent work and `recordProcessed` only after success. A processing failure
 * therefore leaves the event UNrecorded so Stripe's retry reprocesses it. `recordProcessed`
 * uses INSERT … ON CONFLICT DO NOTHING so a rare simultaneous duplicate (both passed the
 * pre-check) does not error — the second insert is a no-op.
 */

/** True when this Stripe event id has already been processed. */
export async function hasProcessed(eventId: string): Promise<boolean> {
  const supabase = getServiceRoleClient(
    `stripe_billing_events: dedup check for ${eventId}`,
  );
  const { data, error } = await supabase
    .from("stripe_billing_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle<{ event_id: string }>();
  if (error) {
    throw new Error(`stripe_billing_events.hasProcessed failed: ${error.message}`);
  }
  return data !== null;
}

export interface RecordProcessedInput {
  eventId: string;
  eventType: string;
  /** Resolved from verified event metadata when present; null otherwise. */
  accountId?: string | null;
}

/**
 * Record an event as processed. Idempotent — ON CONFLICT DO NOTHING on the event_id PK,
 * so a concurrent duplicate write is a harmless no-op.
 */
export async function recordProcessed(input: RecordProcessedInput): Promise<void> {
  const supabase = getServiceRoleClient(
    `stripe_billing_events: record processed ${input.eventId}`,
  );
  const { error } = await supabase
    .from("stripe_billing_events")
    .upsert(
      {
        event_id: input.eventId,
        event_type: input.eventType,
        account_id: input.accountId ?? null,
      },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
  if (error) {
    throw new Error(`stripe_billing_events.recordProcessed failed: ${error.message}`);
  }
}

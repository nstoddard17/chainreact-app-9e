import {
  isPlanAllowedForType,
  isPlanTier,
  type PlanStatus,
} from "@/core/billing/planPolicy";
import { verifyStripeSignature } from "@/integrations/_shared/stripe/webhooks/signature";
import { getByIdServiceRole } from "@/repositories/accounts";
import {
  applyBillingSubscriptionSyncServiceRole,
  type BillingSubscriptionSync,
} from "@/repositories/accountBilling";
import { hasProcessed, recordProcessed } from "@/repositories/stripeBillingEvents";

/**
 * Platform billing Stripe webhook handler (Slice 4.BILLING-PLAN-METADATA-5 / CS-4).
 *
 * Makes checkout authoritative: a VERIFIED Stripe event is the ONLY thing that flips
 * account_billing plan/status/period/ids — never a client redirect or checkout success
 * URL. Reuses the provider-agnostic HMAC verifier (`verifyStripeSignature`) with the
 * SEPARATE platform secret (`STRIPE_BILLING_WEBHOOK_SECRET`) — it does NOT reuse the
 * workflow provider's per-trigger endpoint secret.
 *
 * Order (no processing before verification):
 *   1. secret missing            → fail closed (`not_configured`);
 *   2. signature invalid/expired → `invalid_signature` (route → 400);
 *   3. unparseable / no id|type  → `bad_request` (route → 400);
 *   4. already processed         → `deduped` (route → 200);
 *   5. resolve + idempotent sync → `processed`; record AFTER success (a throw leaves the
 *      event UNrecorded so Stripe's retry reprocesses);
 *   6. unknown type / missing metadata / unknown account → `ignored` (record + 200, no
 *      unsafe write — never guess a plan).
 *
 * SCOPE (CS-4): plan/status SYNC only. No limit enforcement, no freeze, no downgrade —
 * a canceled/deleted subscription sets plan_status='canceled' and LEAVES the plan
 * (revert/downgrade is CS-5). Account id + plan come only from trusted (signed) Stripe
 * metadata; plan is validated against plan policy before any write.
 */

export const STRIPE_BILLING_WEBHOOK_SECRET_ENV = "STRIPE_BILLING_WEBHOOK_SECRET";

export type WebhookHandlerResult =
  | { ok: true; outcome: "processed" | "deduped" | "ignored"; eventType: string }
  | { ok: false; reason: "not_configured" | "invalid_signature" | "bad_request" };

/**
 * Map a Stripe subscription `status` to our PlanStatus, or null when it has no safe
 * mapping (→ status is left untouched). Stripe statuses that aren't in our set collapse
 * to the nearest meaningful state: unpaid → past_due (dunning), incomplete_expired →
 * canceled (dead). Pure — exported for tests.
 */
export function mapStripeSubscriptionStatus(status: string | null): PlanStatus | null {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "canceled";
    default:
      return null;
  }
}

interface StripeEventEnvelope {
  id?: unknown;
  type?: unknown;
  data?: { object?: unknown };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function metadataAccountId(obj: Record<string, unknown>): string | null {
  return stringField(asRecord(obj.metadata).accountId);
}

function metadataPlan(obj: Record<string, unknown>): BillingSubscriptionSync["plan"] | null {
  const raw = stringField(asRecord(obj.metadata).plan);
  return raw && isPlanTier(raw) ? raw : null;
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

type EventResolution =
  | { kind: "sync"; accountId: string; fields: BillingSubscriptionSync }
  | { kind: "ignore"; accountId: string | null };

/**
 * Resolve a verified Stripe event into the billing fields to write, or an "ignore"
 * (with a best-effort account id for the dedup record). The account is re-read by id so
 * an event naming an unknown account is ignored, not written.
 */
async function resolveEvent(
  eventType: string,
  obj: Record<string, unknown>,
): Promise<EventResolution> {
  if (
    eventType !== "checkout.session.completed" &&
    eventType !== "customer.subscription.created" &&
    eventType !== "customer.subscription.updated" &&
    eventType !== "customer.subscription.deleted"
  ) {
    return { kind: "ignore", accountId: metadataAccountId(obj) };
  }

  const accountId = metadataAccountId(obj);
  if (!accountId) return { kind: "ignore", accountId: null };
  const account = await getByIdServiceRole(accountId);
  if (!account) return { kind: "ignore", accountId };

  const fields: BillingSubscriptionSync = {};

  if (eventType === "checkout.session.completed") {
    // A completed subscription checkout: attach ids + plan, mark active. Period/exact
    // status are refined by the subsequent customer.subscription.* events.
    const customer = stringField(obj.customer);
    if (customer) fields.stripeCustomerId = customer;
    const subscription = stringField(obj.subscription);
    if (subscription) fields.stripeSubscriptionId = subscription;
    fields.planStatus = "active";
    const plan = metadataPlan(obj);
    if (plan && isPlanAllowedForType(account.type, plan)) fields.plan = plan;
    return { kind: "sync", accountId, fields };
  }

  // customer.subscription.created | updated | deleted — `obj` is the Subscription.
  const subId = stringField(obj.id);
  if (subId) fields.stripeSubscriptionId = subId;
  const customer = stringField(obj.customer);
  if (customer) fields.stripeCustomerId = customer;
  if (typeof obj.cancel_at_period_end === "boolean") {
    fields.cancelAtPeriodEnd = obj.cancel_at_period_end;
  }
  const periodEnd = unixSecondsToIso(obj.current_period_end);
  if (periodEnd) fields.currentPeriodEnd = periodEnd;

  if (eventType === "customer.subscription.deleted") {
    // CS-4: mark canceled only. The plan is LEFT as the last paid plan — revert /
    // downgrade / limit changes belong to CS-5. No hard delete.
    fields.planStatus = "canceled";
    return { kind: "sync", accountId, fields };
  }

  const status = mapStripeSubscriptionStatus(stringField(obj.status));
  if (status) fields.planStatus = status;
  const plan = metadataPlan(obj);
  if (plan && isPlanAllowedForType(account.type, plan)) fields.plan = plan;
  return { kind: "sync", accountId, fields };
}

export async function handleStripeBillingWebhook(
  rawBody: string,
  signatureHeader: string | null,
  options: { nowSeconds?: number } = {},
): Promise<WebhookHandlerResult> {
  const secret = process.env[STRIPE_BILLING_WEBHOOK_SECRET_ENV]?.trim();
  if (!secret) return { ok: false, reason: "not_configured" }; // fail closed

  const verify = verifyStripeSignature(rawBody, signatureHeader, secret, {
    nowSeconds: options.nowSeconds,
  });
  if (!verify.valid) return { ok: false, reason: "invalid_signature" };

  let event: StripeEventEnvelope;
  try {
    event = JSON.parse(rawBody) as StripeEventEnvelope;
  } catch {
    return { ok: false, reason: "bad_request" };
  }
  const eventId = stringField(event.id);
  const eventType = stringField(event.type);
  if (!eventId || !eventType) return { ok: false, reason: "bad_request" };

  if (await hasProcessed(eventId)) {
    return { ok: true, outcome: "deduped", eventType };
  }

  const resolution = await resolveEvent(eventType, asRecord(event.data?.object));
  if (resolution.kind === "ignore") {
    await recordProcessed({ eventId, eventType, accountId: resolution.accountId });
    return { ok: true, outcome: "ignored", eventType };
  }

  // Sync FIRST, then record — a sync failure leaves the event unrecorded for retry.
  await applyBillingSubscriptionSyncServiceRole(resolution.accountId, resolution.fields);
  await recordProcessed({ eventId, eventType, accountId: resolution.accountId });
  return { ok: true, outcome: "processed", eventType };
}

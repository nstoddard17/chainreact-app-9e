import { NextResponse } from "next/server";
import { handleStripeBillingWebhook } from "@/services/billing/stripeBillingWebhook";

/**
 * POST /api/webhooks/stripe-billing (Slice 4.BILLING-PLAN-METADATA-5 / CS-4).
 *
 * PLATFORM billing webhook — verifies the Stripe signature with the dedicated platform
 * secret (STRIPE_BILLING_WEBHOOK_SECRET), dedups by event id, and syncs subscription
 * state into account_billing. Entirely separate from the WORKFLOW provider webhook at
 * /api/webhooks/stripe (per-trigger endpoint secret) — that route is untouched.
 *
 * PUBLIC + unauthenticated: there is no session / active-account state here. The request
 * is authenticated by the Stripe SIGNATURE alone. The raw body is read BEFORE any parse
 * (the signature is over those exact bytes). No ENABLE_PLATFORM_BILLING gate — the secret
 * being configured IS the enablement (and no subscriptions can exist until checkout,
 * which is flag-gated). Front-line protection against junk traffic is the cheap 400 on a
 * bad/absent signature; a global webhook rate-limit can layer on later if needed.
 *
 * Responses carry NO event payload, secret, customer email, or card data — only a minimal
 * ack. Mapping: not_configured → 500 (Stripe retries until configured), invalid_signature
 * / bad_request → 400, processed/deduped/ignored → 200, unexpected throw → 500 (event left
 * unrecorded so Stripe retries).
 */

export async function POST(request: Request): Promise<Response> {
  // Raw body BEFORE parse — the HMAC is computed over these exact bytes.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let result;
  try {
    result = await handleStripeBillingWebhook(rawBody, signature);
  } catch {
    // Processing failure (DB/sync). 500 → Stripe retries; the event was NOT recorded.
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  if (result.ok) {
    return NextResponse.json({ received: true, outcome: result.outcome }, { status: 200 });
  }

  switch (result.reason) {
    case "not_configured":
      // Fail closed — never silently accept unverifiable events.
      return NextResponse.json({ error: "Billing webhook is not configured." }, { status: 500 });
    case "invalid_signature":
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    case "bad_request":
      return NextResponse.json({ error: "Malformed event." }, { status: 400 });
  }
}

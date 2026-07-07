import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import {
  MissingSecretError,
  receiveQuickbooksWebhook,
} from "@/integrations/quickbooks/webhooks/receive";
import { processQuickbooksEvents } from "@/integrations/quickbooks/webhooks/enrich";
// Side-effect import: forces the QuickBooks trigger registrations
// (activation, deactivation, P-S2 realm filters) at module load. Without
// it a cold serverless invocation of this route would dispatch events
// with the filter registry empty — match-all — and misfire
// cross-company workflows.
import "@/integrations/_registry";

/**
 * POST /api/webhooks/quickbooks — QUICKBOOKS-1.
 *
 * **App-level, shared-infra** (Dropbox family): Intuit posts events for
 * EVERY company connected to the app to ONE URL configured once per
 * environment in the Intuit developer portal
 * (`${NEXT_PUBLIC_APP_URL}/api/webhooks/quickbooks`). There are NO
 * `?workflowId=&nodeId=` params — payloads carry `realmId` per
 * notification, and routing is receive (verify `intuit-signature` —
 * base64 HMAC-SHA256 over the raw body keyed with
 * `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`) → enrich (post-fetch each named
 * entity; derive invoice_paid from payment events with a verified
 * zero-balance check) → normalize → provider-agnostic dispatch (dedup +
 * paused/disabled drops + fail-closed realm filter).
 *
 *   - Missing verifier env → 503 (fail-closed; never accept unsigned).
 *   - Missing/malformed/mismatched signature → 401.
 *   - Any enrichment/dispatch error → 500 so Intuit retries; the
 *     dispatcher's dedup drops the already-dispatched subset on
 *     redelivery.
 *   - No-interest / unknown-realm / ignored-operation events → 200
 *     quiet ack with count-only logs.
 */
export async function POST(request: Request): Promise<Response> {
  // Capture raw body BEFORE parse — the HMAC is over these bytes.
  const rawBody = await request.text();

  let received: ReturnType<typeof receiveQuickbooksWebhook>;
  try {
    received = receiveQuickbooksWebhook({ request, rawBody });
  } catch (err) {
    if (err instanceof MissingSecretError) {
      console.error(
        JSON.stringify({
          event: "webhook.quickbooks.missing_secret",
          error: err.message,
        }),
      );
      return NextResponse.json(
        { error: "QuickBooks webhook verifier token is not configured." },
        { status: 503 },
      );
    }
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    console.error(
      JSON.stringify({
        event: "webhook.quickbooks.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  const summary = await processQuickbooksEvents(received.events);
  if (summary.errors > 0) {
    // 5xx → Intuit redelivers; dedup collapses the already-dispatched.
    return NextResponse.json(
      { error: "Webhook processing failed for some events.", ...summary },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    ...summary,
    malformedSkipped: received.malformedSkipped,
  });
}

/**
 * GET /api/webhooks/quickbooks
 *
 * Service-info endpoint. Intuit has no GET-time challenge (endpoint
 * verification is portal-driven). Returns a JSON description so
 * accidental GET requests don't 404.
 */
export async function GET() {
  return NextResponse.json({
    service: "quickbooks webhook",
    description:
      "POST Intuit eventNotifications here (app-level; configured once per environment in the Intuit developer portal). Signature verified via the intuit-signature header (base64 HMAC-SHA256 over the raw body, keyed with the app's webhook verifier token).",
  });
}

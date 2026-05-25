import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import {
  MissingSecretError,
  receiveDropboxWebhook,
} from "@/integrations/dropbox/triggers/newFile/receive";
import { reconcileDropboxAccounts } from "@/integrations/dropbox/triggers/newFile/reconcile";
// Side-effect import: forces the Dropbox new_file activation registration
// at module load so a fresh worker that only loads this route still has
// the trigger wired (parity with the Monday / HubSpot webhook routes).
import "@/integrations/_registry";

/**
 * Dropbox webhook — Slice 3.DROPBOX-5.
 *
 * **App-level, shared-infra.** Dropbox posts EVERY change for EVERY
 * connected account to ONE URL registered once in the Dropbox App Console
 * (`${NEXT_PUBLIC_APP_URL}/api/webhooks/dropbox`). There are NO
 * `?workflowId=&nodeId=` params — the notification body only says WHICH
 * accounts changed (`{ list_folder: { accounts: [account_id…] } }`), so
 * routing is by account → cursor reconciliation, not strict-direct lookup.
 *
 * GET — verification handshake: Dropbox calls `?challenge=<token>` once
 * when you register the URL. Echo the token verbatim as `text/plain` with
 * `X-Content-Type-Options: nosniff` (Dropbox's documented requirement).
 * NOT signature-gated — it's the ownership-verification step.
 *
 * POST — real notifications:
 *   - Capture the raw body BEFORE parse (the HMAC is over those bytes).
 *   - Verify `X-Dropbox-Signature` (HMAC-SHA256-hex keyed with
 *     `DROPBOX_CLIENT_SECRET`). Missing secret → 503 (fail-closed; closes
 *     the V1 dev-mode-accepted-unsigned gap). Missing header / malformed /
 *     mismatch → 401.
 *   - Reconcile each changed account's `new_file` trigger rows via
 *     `list_folder/continue` and dispatch one run per new file.
 *
 * 5xx on unexpected reconcile failure so Dropbox retries. Errors are
 * sanitized — never leak the app secret, tokens, raw body, file paths,
 * shared/temp links, or bytes.
 */

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const challenge = url.searchParams.get("challenge");
  if (challenge !== null) {
    // Dropbox verification handshake — echo the token verbatim.
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return NextResponse.json({
    service: "dropbox webhook",
    description:
      "GET ?challenge=<token> echoes the token (verification handshake). POST notifications are verified via X-Dropbox-Signature (HMAC-SHA256-hex over the raw body, keyed with DROPBOX_CLIENT_SECRET), then reconciled per changed account via list_folder/continue.",
  });
}

export async function POST(request: Request): Promise<Response> {
  // Capture raw body BEFORE parse — the HMAC is over these bytes.
  const rawBody = await request.text();

  let result: ReturnType<typeof receiveDropboxWebhook>;
  try {
    result = receiveDropboxWebhook({ request, rawBody });
  } catch (err) {
    if (err instanceof MissingSecretError) {
      console.error(
        JSON.stringify({
          event: "webhook.dropbox.missing_secret",
          error: err.message,
        }),
      );
      return NextResponse.json(
        { error: "Dropbox webhook secret is not configured." },
        { status: 503 },
      );
    }
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    console.error(
      JSON.stringify({
        event: "webhook.dropbox.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  try {
    const summary = await reconcileDropboxAccounts(result.accountIds);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "webhook.dropbox.reconcile_error",
        accountCount: result.accountIds.length,
        error: (err as Error).message,
      }),
    );
    return NextResponse.json({ error: "Reconcile failed." }, { status: 500 });
  }
}

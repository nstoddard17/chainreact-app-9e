import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { verifyFacebookChallenge } from "@/integrations/_shared/facebook/webhooks/verifyChallenge";
import {
  MissingSecretError,
  receiveFacebookWebhook,
} from "@/integrations/facebook/triggers/_shared/receive";
import { dispatchFacebookPagePayload } from "@/integrations/facebook/triggers/_shared/dispatch";
// Side-effect imports: register the Facebook trigger filters (+ activations)
// so a cold serverless invocation of THIS route has the filters populated
// before the dispatcher runs (parity with the Slack webhook route).
import "@/integrations/facebook/triggers/newPost";
import "@/integrations/facebook/triggers/newComment";

/**
 * Facebook webhook — Slice 3.FACEBOOK-5.
 *
 * **App-level, shared-infra.** ONE URL registered in the Meta App Dashboard
 * (`${NEXT_PUBLIC_APP_URL}/api/webhooks/facebook`) receives feed changes for
 * every subscribed Page. Routing to workflows is by `entry[].id` (pageId) →
 * the per-trigger filter, not URL params.
 *
 * GET — verification handshake: Facebook calls
 * `?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…` when the URL is
 * (re)registered. Echo `hub.challenge` as `text/plain` ONLY when the token
 * matches `FACEBOOK_WEBHOOK_VERIFY_TOKEN`. NOT signature-gated (no body yet).
 * Mismatch / not-configured → 403 (the supplied token is never echoed).
 *
 * POST — real notifications:
 *   - Capture the raw body BEFORE parse (the HMAC is over those bytes).
 *   - Verify `X-Hub-Signature-256` (HMAC-SHA256 keyed with
 *     `FACEBOOK_CLIENT_SECRET`). Missing secret → 503 (fail-closed; closes
 *     the V1 unsigned gap). Missing header / malformed / mismatch → 401.
 *   - Fan out each `feed` change (post/comment add) through the dispatcher.
 *   - Non-`page` objects → quiet 200 ack (ignored).
 *
 * 5xx on unexpected dispatch failure so Facebook retries. Errors are
 * sanitized — never leak the app secret, the verify token, tokens, the
 * appsecret_proof, the raw body, post/comment text, or media URLs.
 */

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");

  // A GET with no verification params is not a handshake — return service info.
  if (mode === null) {
    return NextResponse.json({
      service: "facebook webhook",
      description:
        "GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=… echoes the challenge when the verify token matches (verification handshake). POST notifications are verified via X-Hub-Signature-256 (HMAC-SHA256 over the raw body, keyed with FACEBOOK_CLIENT_SECRET), then dispatched per Page feed change.",
    });
  }

  const result = verifyFacebookChallenge({
    mode,
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    expectedToken: process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
  });
  if (result.ok) {
    return new Response(result.challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  // Do NOT leak whether the token was wrong vs unset.
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  // Capture raw body BEFORE parse — the HMAC is over these bytes.
  const rawBody = await request.text();

  let received: ReturnType<typeof receiveFacebookWebhook>;
  try {
    received = receiveFacebookWebhook({ request, rawBody });
  } catch (err) {
    if (err instanceof MissingSecretError) {
      console.error(
        JSON.stringify({
          event: "webhook.facebook.missing_secret",
          error: err.message,
        }),
      );
      return NextResponse.json(
        { error: "Facebook webhook secret is not configured." },
        { status: 503 },
      );
    }
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    console.error(
      JSON.stringify({
        event: "webhook.facebook.receive_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Webhook receive failed." },
      { status: 500 },
    );
  }

  try {
    const summary = await dispatchFacebookPagePayload(received.body);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "webhook.facebook.dispatch_error",
        error: (err as Error).message,
      }),
    );
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

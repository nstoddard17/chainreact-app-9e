import { NextResponse } from "next/server";

/**
 * POST /api/webhooks/microsoft-outlook/lifecycle
 *
 * Microsoft Graph posts lifecycle events (`reauthorizationRequired`,
 * `subscriptionRemoved`, `missed`) here when our subscription's
 * `lifecycleNotificationUrl` is set. Required for any subscription with
 * `expirationDateTime > 1h`.
 *
 * Slice 6 plan §"Trigger algorithm":
 *   > Slice 6 ships the route file but the lifecycle handler is a stub
 *   > that logs + 200s; Slice 7 or a follow-up wires real
 *   > reauthorization handling.
 *
 * Validation handshake support is identical to the main route — the
 * URL has `?validationToken=...` and we echo as `text/plain`. Reuse
 * the same 10s budget rule (no DB I/O).
 *
 * Lifecycle notifications also include a `?validationToken` on first
 * registration; subsequent lifecycle events arrive as a regular POST
 * body of `{ "value": [{...}] }` similar to notifications. Slice 6
 * does not yet act on those — we acknowledge with 200 so Microsoft
 * doesn't retry-storm.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const validationToken =
    url.searchParams.get("validationToken") ??
    url.searchParams.get("validationtoken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Slice 6 stub: log + ack. Slice 7+ may wire reauthorizationRequired
  // → set integration.requires_user_action, subscriptionRemoved → mark
  // trigger for re-registration, etc.
  let body = "";
  try {
    body = await request.text();
  } catch {
    // ignore — can't be more useful than the log we still emit
  }
  console.info(
    JSON.stringify({
      event: "webhook.microsoft_outlook.lifecycle_received",
      bodyPreview: body.slice(0, 256),
    }),
  );
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const validationToken =
    url.searchParams.get("validationToken") ??
    url.searchParams.get("validationtoken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({
    service: "microsoft-outlook webhook lifecycle",
    description: "Stub — Slice 6 acknowledges + logs. Slice 7+ will act.",
  });
}

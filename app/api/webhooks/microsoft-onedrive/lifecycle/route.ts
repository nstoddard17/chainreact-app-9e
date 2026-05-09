import { NextResponse } from "next/server";

/**
 * POST /api/webhooks/microsoft-onedrive/lifecycle
 *
 * Microsoft Graph posts lifecycle events (`reauthorizationRequired`,
 * `subscriptionRemoved`, `missed`) here when our subscription's
 * `lifecycleNotificationUrl` is set. Required for any subscription
 * with `expirationDateTime > 1h`.
 *
 * Slice 8 keeps the same Slice 6/7 stub treatment — log + 200. Real
 * reauthorizationRequired / subscriptionRemoved handling is a follow-
 * up slice (sets integration.requires_user_action; marks trigger for
 * re-registration; etc.).
 *
 * Validation handshake support is identical to the main route — the
 * URL has `?validationToken=...` and we echo as `text/plain`. Reuse
 * the same 10s budget rule (no DB I/O).
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

  let body = "";
  try {
    body = await request.text();
  } catch {
    // ignore
  }
  console.info(
    JSON.stringify({
      event: "webhook.microsoft_onedrive.lifecycle_received",
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
    service: "microsoft-onedrive webhook lifecycle",
    description: "Stub — Slice 8 acknowledges + logs. Future slices may act.",
  });
}

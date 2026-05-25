/**
 * Trello webhook callback URL — Slice 17 Commit 5.
 *
 * Shared by activation (which sends the URL to Trello on POST
 * /1/webhooks) AND receive (which feeds the URL into the signature
 * verifier — Trello's HMAC includes the callback URL as part of the
 * signed message).
 *
 * The URL MUST match BYTE-FOR-BYTE between activation and receive.
 * Differences in scheme (http vs https), trailing slash, or query
 * string ordering all break verification. Centralizing the
 * construction here keeps the two sides in lockstep.
 *
 * Strict-direct-lookup pattern (same as GitHub / Shopify / Mailchimp):
 * the URL carries `?workflowId=X&nodeId=Y` so the receive route can
 * look up the trigger row without parsing the body first.
 */

function webhookBaseUrl(): string {
  const explicit = process.env.TRELLO_WEBHOOK_URL?.trim();
  if (explicit) return stripWebhookPath(explicit);
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const idx = trimmed.toLowerCase().indexOf("/api/webhooks/trello");
  if (idx !== -1) return trimmed.slice(0, idx);
  return trimmed;
}

export function trelloNotificationUrl(
  workflowId: string,
  nodeId: string,
): string {
  const params = new URLSearchParams({ workflowId, nodeId });
  return `${webhookBaseUrl()}/api/webhooks/trello?${params.toString()}`;
}

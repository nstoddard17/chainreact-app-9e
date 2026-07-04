/**
 * Asana webhook notification URL — Slice 5.ASANA-1.
 *
 * Shared by activation (sent to Asana as the `target` of POST /webhooks)
 * and the URL Asana POSTs both the X-Hook-Secret handshake and event
 * deliveries back to. Strict-direct-lookup pattern (GitHub / Stripe /
 * Trello / Monday): `?workflowId=X&nodeId=Y` so the receive route
 * resolves the trigger row without parsing the body first — and, for
 * Asana specifically, so the HANDSHAKE can persist the per-webhook
 * secret onto the right row mid-activation.
 *
 * `ASANA_WEBHOOK_URL` overrides the base for e2e mocking (production
 * never sets it; defaults to `NEXT_PUBLIC_APP_URL`). If the override
 * already includes `/api/webhooks/asana`, the path is stripped so the
 * reconstruction never doubles it — mirrors the Monday helper.
 */

function webhookBaseUrl(): string {
  const explicit = process.env.ASANA_WEBHOOK_URL?.trim();
  if (explicit) return stripWebhookPath(explicit);
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const idx = trimmed.toLowerCase().indexOf("/api/webhooks/asana");
  if (idx !== -1) return trimmed.slice(0, idx);
  return trimmed;
}

export function asanaNotificationUrl(
  workflowId: string,
  nodeId: string,
): string {
  const params = new URLSearchParams({ workflowId, nodeId });
  return `${webhookBaseUrl()}/api/webhooks/asana?${params.toString()}`;
}

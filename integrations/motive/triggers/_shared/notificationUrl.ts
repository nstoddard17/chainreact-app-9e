/**
 * Motive webhook notification URL — MOTIVE-1.
 *
 * Sent to Motive as the `url` of `POST /v1/company_webhooks` and the URL Motive
 * POSTs event deliveries back to. Strict-direct-lookup (Asana / Stripe / Trello
 * pattern): `?workflowId=X&nodeId=Y` so the receive route resolves the trigger
 * row (and its per-webhook secret) without parsing the body first.
 *
 * `MOTIVE_WEBHOOK_URL` overrides the base for e2e mocking (production never sets
 * it; defaults to `NEXT_PUBLIC_APP_URL`). If the override already includes
 * `/api/webhooks/motive`, the path is stripped so reconstruction never doubles
 * it (mirrors the Asana/Monday helper).
 */

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const idx = trimmed.toLowerCase().indexOf("/api/webhooks/motive");
  if (idx !== -1) return trimmed.slice(0, idx);
  return trimmed;
}

function webhookBaseUrl(): string {
  const explicit = process.env.MOTIVE_WEBHOOK_URL?.trim();
  if (explicit) return stripWebhookPath(explicit);
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function motiveNotificationUrl(workflowId: string, nodeId: string): string {
  const params = new URLSearchParams({ workflowId, nodeId });
  return `${webhookBaseUrl()}/api/webhooks/motive?${params.toString()}`;
}

/**
 * Monday webhook notification URL — Slice 3.MONDAY-7.
 *
 * Shared by activation (sends the URL to Monday via `create_webhook`)
 * and is the URL Monday POSTs events back to. Strict-direct-lookup
 * pattern (same as GitHub / Shopify / Stripe / Trello): the URL carries
 * `?workflowId=X&nodeId=Y` so the receive route resolves the trigger row
 * without parsing the body first.
 *
 * `MONDAY_WEBHOOK_URL` overrides the base for e2e mocking (production
 * never sets it; defaults to `NEXT_PUBLIC_APP_URL`). If the override
 * already includes `/api/webhooks/monday`, the path is stripped so the
 * reconstruction never doubles it — mirrors the GitHub / Trello helpers.
 */

function webhookBaseUrl(): string {
  const explicit = process.env.MONDAY_WEBHOOK_URL?.trim();
  if (explicit) return stripWebhookPath(explicit);
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const idx = trimmed.toLowerCase().indexOf("/api/webhooks/monday");
  if (idx !== -1) return trimmed.slice(0, idx);
  return trimmed;
}

export function mondayNotificationUrl(
  workflowId: string,
  nodeId: string,
): string {
  const params = new URLSearchParams({ workflowId, nodeId });
  return `${webhookBaseUrl()}/api/webhooks/monday?${params.toString()}`;
}

/**
 * Typeform webhook notification URL — Slice 5.TYPEFORM-1.
 *
 * Sent to Typeform as the `url` of PUT /forms/{id}/webhooks/{tag}; event
 * deliveries POST back to it. Strict-direct-lookup pattern (GitHub /
 * Trello / Monday / Asana): `?workflowId=X&nodeId=Y` so the receive
 * route resolves the trigger row without parsing the body first.
 *
 * `TYPEFORM_WEBHOOK_URL` overrides the base for e2e mocking (production
 * never sets it; defaults to `NEXT_PUBLIC_APP_URL`). If the override
 * already includes `/api/webhooks/typeform`, the path is stripped so the
 * reconstruction never doubles it — mirrors the Asana/Monday helpers.
 *
 * Typeform requires HTTPS with a valid certificate for new webhook URLs;
 * that constraint is on the DEPLOYMENT, not this helper.
 */

function webhookBaseUrl(): string {
  const explicit = process.env.TYPEFORM_WEBHOOK_URL?.trim();
  if (explicit) return stripWebhookPath(explicit);
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const idx = trimmed.toLowerCase().indexOf("/api/webhooks/typeform");
  if (idx !== -1) return trimmed.slice(0, idx);
  return trimmed;
}

export function typeformNotificationUrl(
  workflowId: string,
  nodeId: string,
): string {
  const params = new URLSearchParams({ workflowId, nodeId });
  return `${webhookBaseUrl()}/api/webhooks/typeform?${params.toString()}`;
}

/**
 * Calendly webhook notification URL — Slice 5.CALENDLY-1.
 *
 * Sent to Calendly as the `url` of POST /webhook_subscriptions; event
 * deliveries POST back to it. Strict-direct-lookup pattern (GitHub /
 * Trello / Monday / Asana / Typeform): `?workflowId=X&nodeId=Y` so the
 * receive route resolves the trigger row without parsing the body first
 * — Calendly deliveries carry no subscription identifier in the body, so
 * the URL IS the routing (Stripe precedent).
 *
 * `CALENDLY_WEBHOOK_URL` overrides the base for e2e mocking (production
 * never sets it; defaults to `NEXT_PUBLIC_APP_URL`). If the override
 * already includes `/api/webhooks/calendly`, the path is stripped so the
 * reconstruction never doubles it — mirrors the Asana/Monday/Typeform
 * helpers.
 *
 * Calendly requires a public HTTPS URL for webhook subscriptions; that
 * constraint is on the DEPLOYMENT, not this helper.
 */

function webhookBaseUrl(): string {
  const explicit = process.env.CALENDLY_WEBHOOK_URL?.trim();
  if (explicit) return stripWebhookPath(explicit);
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function stripWebhookPath(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  const idx = trimmed.toLowerCase().indexOf("/api/webhooks/calendly");
  if (idx !== -1) return trimmed.slice(0, idx);
  return trimmed;
}

export function calendlyNotificationUrl(
  workflowId: string,
  nodeId: string,
): string {
  const params = new URLSearchParams({ workflowId, nodeId });
  return `${webhookBaseUrl()}/api/webhooks/calendly?${params.toString()}`;
}

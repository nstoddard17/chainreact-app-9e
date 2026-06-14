import * as notificationsRepo from "@/repositories/notifications";
import { getProvider } from "@/integrations/_registry";
import type { IntegrationRecord } from "@/repositories/integrations";

/**
 * V2-READY-28B — one-shot "reconnect needed" in-app notification.
 *
 * Called by `resolveOptionsSource` ONLY when `markNeedsReconnect` reports a TRUE
 * first-mark transition (`needs_reconnect_at` NULL → non-null), so a connection
 * that is already reconnect-needed never re-notifies on repeated option-source
 * failures (duplicate-prevention lives in the conditional UPDATE, not here).
 *
 * Recipient: the integration's `connected_by_user_id` — the connector. This is
 * correct for BOTH personal-credential providers (the connector owns it) AND
 * account/service providers like Slack (the connector is the responsible user
 * who completed the OAuth). When provenance is absent (`null`, e.g. the
 * connector's auth.users row was deleted → ON DELETE SET NULL), there is no safe
 * single recipient, so we skip rather than guess / broadcast — this slice does
 * NOT build account owner/admin escalation.
 *
 * No-leak: the copy uses only the provider DISPLAY name (the app's public label,
 * e.g. "Slack") + the static `/apps` link. NO provider account id, Slack team
 * id, account id, email, token, scope, or raw provider error body is read or
 * emitted; metadata is empty.
 *
 * Best-effort: notification failures are logged (safe, identifier-free) and
 * swallowed — they must NEVER break option loading. The caller additionally
 * wraps this in `.catch`.
 */
export async function notifyReconnectNeeded(
  integration: IntegrationRecord,
): Promise<void> {
  const recipient = integration.connectedByUserId;
  if (!recipient) return; // no safe single recipient — skip (no escalation here)

  const displayName =
    getProvider(integration.provider)?.displayName ?? integration.provider;

  try {
    await notificationsRepo.create({
      userId: recipient,
      type: "integration_reconnect_needed",
      severity: "warning",
      title: `Reconnect ${displayName}`,
      body: `${displayName} needs to be reconnected before ChainReact can use it.`,
      actionUrl: "/apps",
      metadata: {}, // timestamp/id-free — no provider account id / team id / token / scope
    });
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "integration.reconnect_notification.error",
        provider: integration.provider,
        message: (err as Error).message,
      }),
    );
  }
}

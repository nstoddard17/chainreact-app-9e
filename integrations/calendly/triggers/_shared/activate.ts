import { randomBytes } from "node:crypto";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import {
  InsufficientScopeError,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { encryptToken } from "@/core/encryption/tokens";
import { ConflictError } from "@/integrations/_shared/calendly/errors";
import { usersMe } from "@/integrations/_shared/calendly/api/users";
import { webhookSubscriptionCreate } from "@/integrations/_shared/calendly/api/webhookSubscriptions";
import { uuidFromUri } from "./project";
import {
  PROVIDER_EVENT_BY_TRIGGER,
  type CalendlyTriggerType,
} from "./eventMap";
import { calendlyNotificationUrl } from "./notificationUrl";

/**
 * Shared activation factory for the Calendly webhook triggers — Slice
 * 5.CALENDLY-1.
 *
 * Per-(workflow, node) lifecycle: each trigger node creates its own
 * Calendly webhook subscription via `POST /webhook_subscriptions` with
 * `scope: "user"` (the connecting human's own bookings — personal
 * credential class), `events` = exactly that trigger's provider event,
 * and its own `?workflowId=&nodeId=` URL (strict-direct-lookup — the
 * delivery body carries no subscription identifier, Stripe precedent).
 *
 * No creation handshake (Typeform posture): V2 mints the HMAC
 * `signing_key` itself (32 random bytes) and sends it in the POST body,
 * so there is no pre-upsert and no mid-creation round-trip — the
 * returned config patch is the whole story. A POST failure aborts
 * activation with nothing to clean up provider-side.
 *
 * Identity: subscription creation needs the user URI + organization URI.
 * Both are persisted in the integration's account metadata at connect
 * time (oauth.ts); rows connected before this slice — or metadata that
 * failed to persist — fall back to one `GET /users/me` call.
 *
 * Provider calls go through `refreshAndRetry` — Calendly access tokens
 * expire after 2 hours, so activation must tolerate a stale stored
 * token.
 *
 * `trigger_resources.config` after activation:
 *   - `webhookEnabled: true`
 *   - `eventTypeId` — the optional user-chosen event-type filter
 *     (passthrough from the builder config; P-S2 filter input).
 *   - `subscriptionUri` — Calendly's subscription URI, for deactivation.
 *   - `hookSecretEncrypted` — the V2-minted signing key (encrypted).
 *   - `notificationUrl` — the exact URL registered.
 *   - `calendlyUserId` / `calendlyUserUri` — the connected user's
 *     UUID/URI: the P-S2 filter's cross-account attribution AND part of
 *     the dedup key (collective events can deliver one booking to two
 *     users' subscriptions — see normalize).
 *   - `organizationUri` — informational (org the subscription rode on).
 *
 * **NO `type: "subscription-watch"` marker** — Calendly subscriptions
 * don't expire on a schedule, so the renewal cron never touches these
 * rows. (Calendly disables subscriptions itself after 24h of failed
 * deliveries — documented platform behavior; recovery is
 * deactivate/reactivate.)
 *
 * Humanized failure modes:
 *   - 403 (`InsufficientScopeError`) → Calendly plan-gates the webhook
 *     API (paid plans only), and the same status covers a missing
 *     `webhooks:write` grant — the error says both.
 *   - 409 (`ConflictError`) → an orphaned subscription already claims
 *     this URL (crashed lifecycle); deactivate/reactivate clears it.
 */
export function makeCalendlyActivate(
  triggerType: CalendlyTriggerType,
): ActivationFn {
  return async ({ node, integration, workflowId }) => {
    const eventTypeId =
      typeof node.config?.eventTypeId === "string" &&
      node.config.eventTypeId.length > 0
        ? node.config.eventTypeId
        : undefined;

    // ── Resolve the user/org URIs (metadata-first, /users/me fallback). ──
    const metadata = integration.accountMetadata as {
      calendlyUserUri?: unknown;
      organizationUri?: unknown;
    };
    let userUri =
      typeof metadata.calendlyUserUri === "string" &&
      metadata.calendlyUserUri.length > 0
        ? metadata.calendlyUserUri
        : null;
    let organizationUri =
      typeof metadata.organizationUri === "string" &&
      metadata.organizationUri.length > 0
        ? metadata.organizationUri
        : null;
    if (!userUri || !organizationUri) {
      const me = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "calendly",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => usersMe({ accessToken }),
      });
      userUri = userUri ?? me.uri ?? null;
      organizationUri = organizationUri ?? me.current_organization ?? null;
    }
    const calendlyUserId = uuidFromUri(userUri);
    if (!userUri || !organizationUri || !calendlyUserId) {
      throw new Error(
        `calendly ${triggerType} activate: could not resolve the connected user's Calendly user/organization URIs.`,
      );
    }

    const url = calendlyNotificationUrl(workflowId, node.id);
    // V2-minted per-subscription HMAC key. base64url keeps it body-safe.
    const signingKey = randomBytes(32).toString("base64url");

    let created;
    try {
      created = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "calendly",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          webhookSubscriptionCreate({
            accessToken,
            url,
            events: [PROVIDER_EVENT_BY_TRIGGER[triggerType]],
            organizationUri: organizationUri as string,
            userUri: userUri as string,
            signingKey,
          }),
      });
    } catch (err) {
      if (err instanceof InsufficientScopeError) {
        // Calendly returns 403 both for the paid-plan webhook gate and
        // for a missing webhooks:write grant — say both honestly.
        throw new Error(
          "Calendly rejected the webhook subscription (HTTP 403). Calendly webhooks require a paid Calendly plan (Standard or higher) on the connected account, or the connection is missing the webhooks:write permission — reconnect Calendly to re-grant it.",
        );
      }
      if (err instanceof ConflictError) {
        throw new Error(
          "Calendly reports a webhook subscription already exists for this trigger's URL (a previous activation may not have been cleaned up). Deactivate the workflow, then activate it again.",
        );
      }
      throw err;
    }

    // Config patch — the lifecycle's final upsert persists this.
    return {
      webhookEnabled: true,
      ...(eventTypeId ? { eventTypeId } : {}),
      subscriptionUri:
        typeof created.uri === "string" && created.uri.length > 0
          ? created.uri
          : undefined,
      hookSecretEncrypted: encryptToken(signingKey),
      notificationUrl: url,
      calendlyUserId,
      calendlyUserUri: userUri,
      organizationUri,
    };
  };
}

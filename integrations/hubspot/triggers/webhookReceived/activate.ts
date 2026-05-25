import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { decryptToken } from "@/core/encryption/tokens";
import { createWebhookSubscription } from "@/integrations/_shared/hubspot/api/webhookSubscriptions";
import * as appSubsRepo from "@/repositories/hubspotAppSubscriptions";
import * as refsRepo from "@/repositories/hubspotSubscriptionRefs";
import {
  HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES,
  isAllowedHubSpotSubscriptionType,
  isPropertyChangeSubscriptionType,
} from "./allowedSubscriptionTypes";

/**
 * HubSpot `webhook_received` activation hook — Slice 13 Commit 5.
 *
 * Reads `node.config.subscriptions` (REQUIRED, non-empty array of
 * `{ eventType, propertyName? }` items) and for each item:
 *   1. Validates `eventType` is in the Batch 1 allowlist.
 *   2. Validates `propertyName` shape (REQUIRED for `*.propertyChange`,
 *      MUST be null/absent otherwise).
 *   3. Calls `appSubsRepo.findOrCreate(...)` — if an app-level subscription
 *      already exists for `(appId, eventType, propertyName)`, it's
 *      reused; otherwise this issues `POST /webhooks/v3/{appId}/subscriptions`
 *      against HubSpot and persists the new row.
 *   4. Calls `refsRepo.upsert(...)` to bind this workflow node to the
 *      app subscription (idempotent on the
 *      `(app_subscription_id, workflow_id, node_id)` triple).
 *
 * Persists into `trigger_resources.config`:
 *   - `webhookEnabled: true` (parity with other V2 webhook triggers).
 *   - `appId` — the HubSpot app id (env-resolved; never user-supplied).
 *   - `hubId` — the customer's portal id (from
 *     `integration.providerAccountId`).
 *   - `subscriptions: [{ eventType, propertyName, appSubscriptionId,
 *     hubspotSubscriptionId }, ...]` — used by deactivate to walk
 *     refs.
 *
 * **NO `type: "subscription-watch"` field set.** HubSpot webhook
 * subscriptions don't expire — there's no renewal cron entry needed.
 * Same "permanent endpoint" pattern as Slice 11 Stripe / Slice 12 Shopify.
 *
 * **NO `targetUrl` per subscription** — HubSpot Public Apps use a
 * single global target URL configured in the developer-portal app
 * settings, NOT one URL per subscription. The receive route routes
 * inbound events by `portalId` (in payload) → `hubId` (denormalized on
 * the ref row), NOT by URL query params.
 *
 * Throws abort the activate transition (TRIGGER_REGISTRATION_FAILED).
 * Mid-list failure does NOT roll back already-created refs — the
 * deactivate path will walk and clean up whatever rows exist when the
 * workflow is disabled. (Shopify rolls back because each topic is a
 * separate provider-side webhook; HubSpot's subscriptions are shared,
 * and an already-created app-level subscription may still be needed by
 * OTHER workflows. The ref-row staying-around is harmless — no
 * workflow rows point at it without an active trigger_resources row.)
 */

function getAppId(): string {
  const appId = process.env.HUBSPOT_APP_ID?.trim();
  if (!appId) {
    throw new Error(
      "hubspot webhook_received activate: HUBSPOT_APP_ID env var is not set. " +
        "HubSpot Public App webhook subscriptions require the app id for the " +
        "/webhooks/v3/{appId}/subscriptions URL.",
    );
  }
  return appId;
}

interface SubscriptionItem {
  eventType: string;
  propertyName: string | null;
}

function parseSubscriptions(
  raw: unknown,
): readonly SubscriptionItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      "hubspot webhook_received activate: node.config.subscriptions is required (non-empty array of { eventType, propertyName? } items).",
    );
  }
  const items: SubscriptionItem[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "object" || v === null) {
      throw new Error(
        `hubspot webhook_received activate: subscription item must be an object, got ${typeof v}.`,
      );
    }
    const item = v as Record<string, unknown>;
    const eventType = item.eventType;
    if (typeof eventType !== "string" || !isAllowedHubSpotSubscriptionType(eventType)) {
      throw new Error(
        `hubspot webhook_received activate: '${String(eventType)}' is not in the Slice 13 Batch 1 allowlist. Allowed: ${HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES.join(", ")}.`,
      );
    }
    let propertyName: string | null = null;
    if (isPropertyChangeSubscriptionType(eventType)) {
      const pn = item.propertyName;
      if (typeof pn !== "string" || pn.trim().length === 0) {
        throw new Error(
          `hubspot webhook_received activate: '${eventType}' requires a non-empty propertyName.`,
        );
      }
      propertyName = pn.trim();
    } else {
      // Forbid propertyName on creation/deletion to avoid silently
      // creating an app subscription scoped to a property that the
      // event type doesn't honor (HubSpot would accept the field on
      // create but never narrow the event, leading to surprising
      // delivery shapes).
      if (
        item.propertyName !== undefined &&
        item.propertyName !== null &&
        item.propertyName !== ""
      ) {
        throw new Error(
          `hubspot webhook_received activate: '${eventType}' must not carry a propertyName (only *.propertyChange types support per-property scoping).`,
        );
      }
    }
    const key = `${eventType}:${propertyName ?? ""}`;
    if (seen.has(key)) {
      throw new Error(
        `hubspot webhook_received activate: duplicate subscription item ${key}.`,
      );
    }
    seen.add(key);
    items.push({ eventType, propertyName });
  }
  return items;
}

export const activate: ActivationFn = async ({
  node,
  integration,
  workflowId,
}) => {
  const subscriptions = parseSubscriptions(node.config?.subscriptions);
  const appId = getAppId();

  const hubId = integration.providerAccountId;
  if (!hubId) {
    throw new Error(
      "hubspot webhook_received activate: integration row missing providerAccountId (hubId). Reconnect the HubSpot integration.",
    );
  }
  const accessToken = decryptToken(integration.accessTokenEncrypted);

  // Walk each subscription type. Each iteration is independent of the
  // others — failures in iteration N leave iterations 0..N-1 persisted
  // (see file header on why we don't roll back).
  const provisioned: Array<{
    eventType: string;
    propertyName: string | null;
    appSubscriptionId: string;
    hubspotSubscriptionId: string;
  }> = [];
  for (const sub of subscriptions) {
    const appSub = await appSubsRepo.findOrCreate(
      {
        appId,
        eventType: sub.eventType,
        propertyName: sub.propertyName,
      },
      async () => {
        const created = await createWebhookSubscription({
          accessToken,
          appId,
          eventType: sub.eventType,
          propertyName: sub.propertyName,
        });
        return { hubspotSubscriptionId: created.id };
      },
    );
    await refsRepo.upsert({
      appSubscriptionId: appSub.id,
      workflowId,
      userId: integration.userId,
      nodeId: node.id,
      hubId,
      config: {
        eventType: sub.eventType,
        propertyName: sub.propertyName,
      },
    });
    provisioned.push({
      eventType: sub.eventType,
      propertyName: sub.propertyName,
      appSubscriptionId: appSub.id,
      hubspotSubscriptionId: appSub.hubspotSubscriptionId,
    });
  }

  return {
    webhookEnabled: true,
    appId,
    hubId,
    subscriptions: provisioned,
  };
};

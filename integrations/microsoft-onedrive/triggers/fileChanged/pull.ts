import type { TriggerEvent } from "@/contracts/triggerEvent";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { driveItemsGet } from "../../api/driveItemsGet";
import { driveRootDelta } from "../../api/driveRootDelta";
import {
  isDeletedDeltaItem,
  normalize,
  normalizeDeleted,
  type NormalizeContext,
} from "./normalize";

/**
 * Pull events for a single inbound notification.
 *
 * Two branches:
 *   - **id-fetch** (primary): notification carries
 *     `resourceData.id` AND it's not the literal "root". GET
 *     /me/drive/items/{id}; on 404 emit a deleted-minimal payload.
 *   - **delta-fallback**: notification has no usable id (notifications
 *     on /me/drive/root sometimes arrive with `resourceData.id ===
 *     "root"` or empty). Fetch the persisted delta cursor's next
 *     page; emit one event per returned item; persist the new
 *     `deltaLink`.
 *
 * The branch decision is made by the caller (webhooks/receive.ts) and
 * passed in via `mode`. This split keeps the receive route's branching
 * logic readable and lets unit tests exercise each path independently.
 *
 * Slice 8 plan §"file_changed trigger algorithm" — Webhook receive.
 *
 * `delta-fallback` cursor maintenance: persist the new `deltaLink`
 * back to `trigger_resources.config.deltaToken` after a successful
 * fetch. If Graph returns 410 Gone (delta token expired after extended
 * inactivity), the wrapper surfaces a generic Error mentioning
 * `resyncRequired`; this handler catches and re-baselines via a fresh
 * `driveRootDelta()` walk, persists the new cursor, returns zero
 * events for this notification, and lets the next notification surface
 * real changes.
 */

export type PullMode =
  | { kind: "id-fetch"; itemId: string }
  | { kind: "delta-fallback" };

export interface PullResult {
  events: TriggerEvent[];
}

export async function pull(
  trigger: TriggerResourceRecord,
  mode: PullMode,
  notificationOccurredAt: string,
): Promise<PullResult> {
  const integration = await getActiveForExecution(trigger.workflowAccountId!,
    trigger.provider,
    trigger.providerAccountId,
  );
  if (!integration) {
    return { events: [] };
  }

  const config = trigger.config as {
    subscriptionId?: string;
    deltaToken?: string;
    [k: string]: unknown;
  };

  if (!config.subscriptionId) {
    return { events: [] };
  }

  const baseContext = {
    subscriptionId: config.subscriptionId,
    notificationOccurredAt,
    providerAccountId: integration.providerAccountId,
  };

  if (mode.kind === "id-fetch") {
    const ctx: NormalizeContext = { ...baseContext, source: "id-fetch" };
    try {
      const item = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-onedrive",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          driveItemsGet({ accessToken, itemId: mode.itemId }),
      });
      return { events: [normalize(item, ctx)] };
    } catch (err) {
      if (err instanceof NotFoundError) {
        // Item deleted between notification and fetch — emit minimal
        // payload so workflows can react. Slice 8 plan §"file_changed
        // trigger algorithm" — id-bearing branch 404 handling.
        return { events: [normalizeDeleted(mode.itemId, ctx)] };
      }
      throw err;
    }
  }

  // delta-fallback branch
  const ctx: NormalizeContext = { ...baseContext, source: "delta-fallback" };
  if (!config.deltaToken) {
    // No baseline cursor — should never happen post-activate, but if
    // it does, re-baseline silently and emit zero events. The next
    // notification with a valid cursor will surface real changes.
    return await reBaselineAndReturnEmpty(trigger, integration, config);
  }

  let result;
  try {
    result = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "microsoft-onedrive",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        driveRootDelta({ accessToken, nextLink: config.deltaToken! }),
    });
  } catch (err) {
    // Graph signals expired delta tokens with HTTP 410 + code
    // `resyncRequired`. The wrapper surfaces this as a generic Error
    // whose message contains "resyncRequired". Catch + re-baseline.
    if (err instanceof Error && /resyncRequired/i.test(err.message)) {
      console.warn(
        JSON.stringify({
          event: "webhook.onedrive.delta_token_expired",
          subscriptionId: config.subscriptionId,
        }),
      );
      return await reBaselineAndReturnEmpty(trigger, integration, config);
    }
    throw err;
  }

  // Persist new deltaLink before emitting events so a downstream
  // dispatch failure doesn't replay the same delta on the next call.
  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    deltaToken: result.deltaLink,
  });

  const events: TriggerEvent[] = [];
  for (const item of result.items) {
    if (isDeletedDeltaItem(item)) {
      events.push(normalizeDeleted(item.id, ctx));
      continue;
    }
    events.push(normalize(item, ctx));
  }
  return { events };
}

/**
 * Re-baseline the delta cursor and persist; return zero events. Shared
 * between the missing-cursor and 410-resyncRequired paths.
 */
async function reBaselineAndReturnEmpty(
  trigger: TriggerResourceRecord,
  integration: { accountId: string; providerAccountId: string },
  config: Record<string, unknown>,
): Promise<PullResult> {
  try {
    const baseline = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "microsoft-onedrive",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => driveRootDelta({ accessToken }),
    });
    await triggerResourcesRepo.updateConfig(trigger.id, {
      ...config,
      deltaToken: baseline.deltaLink,
    });
  } catch (err) {
    // Re-baseline failure is not fatal — log and continue with zero
    // events; the next renewal cycle / poll will retry.
    console.warn(
      JSON.stringify({
        event: "webhook.onedrive.delta_rebaseline_failed",
        triggerId: trigger.id,
        error: (err as Error).message,
      }),
    );
  }
  return { events: [] };
}

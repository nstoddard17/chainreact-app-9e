import type { TriggerEvent } from "@/contracts/triggerEvent";
import { webhooksListPayloads } from "@/integrations/_shared/airtable/api/webhooks";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { normalizePayloads } from "./normalize";

/**
 * Pull events for a single inbound Airtable webhook ping.
 *
 * Algorithm (Slice 10 plan §"Webhook trigger model" #5):
 *   1. GET `/v0/bases/{baseId}/webhooks/{webhookId}/payloads?cursor=N`
 *      via `webhooksListPayloads`. Wraps in `refreshAndRetry`.
 *   2. **Persist the new `cursor` in `trigger_resources.config.lastCursor`
 *      BEFORE returning** so a downstream dispatch failure doesn't
 *      replay the same payloads on the next ping.
 *   3. Walk each payload via `normalizePayloads`; emit one TriggerEvent
 *      per record per change-class.
 *   4. Loop while `mightHaveMore` — Airtable caps responses; the
 *      receive call may need multiple page fetches to drain a large
 *      delta. Loop bounded at 50 iterations as a safety belt.
 *
 * Cursor advancement happens before normalization+return — if Airtable
 * returns the next-cursor + payloads but normalize throws on a malformed
 * payload, the cursor is already saved (we don't want to replay
 * malformed events; they're skipped).
 *
 * Slice 10 deliberately does NOT introduce a delta-token-style
 * resync flow. Airtable's cursor is monotonic; if the persisted cursor
 * gets ahead of Airtable's feed (impossible in practice — cursors are
 * issued by the server), Airtable returns an empty payload list with
 * the same cursor unchanged.
 */

export interface PullResult {
  events: TriggerEvent[];
  /** True iff the cursor advanced. Useful for diagnostic logs. */
  cursorAdvanced: boolean;
}

const MAX_PAGE_FETCHES = 50;

export async function pull(
  trigger: TriggerResourceRecord,
  notificationOccurredAt: string,
): Promise<PullResult> {
  const integration = await getActiveForExecution(
    trigger.userId,
    trigger.provider,
    trigger.accountId,
  );
  if (!integration) {
    return { events: [], cursorAdvanced: false };
  }

  const config = trigger.config as {
    baseId?: string;
    webhookId?: string;
    macSecretBase64?: string;
    lastCursor?: number | null;
    [k: string]: unknown;
  };
  if (!config.baseId || !config.webhookId) {
    return { events: [], cursorAdvanced: false };
  }

  const initialCursor: number | undefined =
    typeof config.lastCursor === "number" ? config.lastCursor : undefined;
  let cursor = initialCursor;
  let cursorAdvanced = false;
  const events: TriggerEvent[] = [];

  for (let i = 0; i < MAX_PAGE_FETCHES; i++) {
    const result = await refreshAndRetry({
      userId: integration.userId,
      provider: "airtable",
      accountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        webhooksListPayloads({
          accessToken,
          baseId: config.baseId!,
          webhookId: config.webhookId!,
          cursor,
        }),
    });

    // Persist BEFORE emitting events so a downstream dispatch failure
    // doesn't replay this batch on the next ping. Note: persists
    // every page even when there are zero events (a no-op batch
    // simply rolls the cursor forward).
    if (result.cursor !== cursor) {
      await triggerResourcesRepo.updateConfig(trigger.id, {
        ...config,
        lastCursor: result.cursor,
      });
      cursorAdvanced = true;
      cursor = result.cursor;
      // Update local config snapshot so subsequent `updateConfig`
      // writes inside the loop preserve the advance.
      config.lastCursor = result.cursor;
    }

    if (result.payloads.length > 0) {
      const normalized = normalizePayloads(result.payloads, {
        webhookId: config.webhookId,
        baseId: config.baseId,
        accountId: integration.providerAccountId,
        notificationOccurredAt,
      });
      for (const e of normalized.events) events.push(e);
    }

    if (!result.mightHaveMore) break;
  }

  return { events, cursorAdvanced };
}

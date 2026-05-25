import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { enqueueRun } from "@/services/execution/enqueue";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { pagesList } from "../../api/pagesList";
import { checkAndMarkSeen } from "./dedup";
import { normalizeNewNote } from "./normalize";
import { NewNoteConfigSchema } from "./schema";

/**
 * OneNote `new_note` polling handler — Slice 3.ONENOTE-5.
 *
 * V2-native section-scoped polling. NOT a Microsoft Graph webhook
 * subscription (Graph deprecated OneNote subscriptions in May 2023 —
 * `manifest.capabilities.webhookTrigger` is permanently false).
 *
 * Per-tick flow:
 *   1. Parse the row's config through `NewNoteConfigSchema`. Missing
 *      snapshot → defensive warn + skip (activate should have
 *      populated it).
 *   2. Verify the user has a connected OneNote integration. Missing
 *      → warn + skip (no access; the workflow is effectively broken
 *      until reconnect).
 *   3. GET `/me/onenote/sections/{sectionId}/pages?$orderby=
 *      createdDateTime desc&$top=100`. Graph returns newest-first.
 *   4. Client-side filter: keep pages where `createdDateTime >
 *      snapshot.lastSeenCreatedDateTime` (lexicographic ISO 8601
 *      comparison matches chronological order).
 *   5. **Snapshot advances to max(previous, newest fetched) BEFORE
 *      dispatch.** Even if every fetched page was already seen, the
 *      snapshot moves forward to the newest fetched id so we never
 *      re-poll the same batch. Same invariant as Discord new_message.
 *   6. For each new page: dedup via `webhook_event_dedup` (cross-tick
 *      safe), normalize → enqueueRun. One bad page does not abort
 *      the tick.
 *   7. Persist updated config — snapshot advanced + `polling
 *      .lastPolledAt` set to `now`.
 *
 * Provider error handling (mirrors Discord's pattern adapted for the
 * Microsoft Graph error taxonomy):
 *   - **404 NotFoundError (section deleted / access lost)** — log
 *     structured warn + return. Do NOT advance the snapshot. The
 *     workflow is effectively broken until reconfigured.
 *   - **401 (token expired)** — handled transparently by
 *     `refreshAndRetry`; this code path only sees non-401 errors.
 *   - **Other errors** — propagate per Gmail's pattern; the cron's
 *     outer catch logs them.
 *
 * Bound: 100 pages per tick. At the 5-minute default cadence this
 * means we lose pages only at >20 pages/minute sustained in a single
 * section — extreme; user-action recovery via re-activation (re-seeds
 * the snapshot) is acceptable for V2-v1.
 */

const HANDLER_ID = "microsoft-onenote/new_note";
const PAGE_BATCH = 100;

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = NewNoteConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "microsoft-onenote.new_note.poll.no_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
      }),
    );
    return;
  }

  const integration = await getActiveForExecution(
    trigger.userId,
    "microsoft-onenote",
    null,
  );
  if (!integration) {
    console.warn(
      JSON.stringify({
        event: "microsoft-onenote.new_note.poll.no_integration",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        userId: trigger.userId,
      }),
    );
    return;
  }
  const accountId = integration.providerAccountId;

  const previousSnapshot = config.snapshot.lastSeenCreatedDateTime;

  let result;
  try {
    result = await refreshAndRetry({
      userId: trigger.userId,
      provider: "microsoft-onenote",
      accountId,
      apiCall: (accessToken) =>
        pagesList({
          accessToken,
          sectionId: config.sectionId,
          orderBy: "createdDateTime desc",
          top: PAGE_BATCH,
        }),
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      console.warn(
        JSON.stringify({
          event: "microsoft-onenote.new_note.poll.section_unavailable",
          triggerId: trigger.id,
          workflowId: trigger.workflowId,
          sectionId: config.sectionId,
          error: err.message,
        }),
      );
      return;
    }
    throw err;
  }

  // Advance snapshot to max(previous, any fetched createdDateTime) —
  // even when every fetched page was already seen we never re-poll the
  // same batch. ISO 8601 string ordering matches chronological order.
  let newSnapshot = previousSnapshot;
  for (const page of result.pages) {
    if (
      typeof page.createdDateTime === "string" &&
      page.createdDateTime > newSnapshot
    ) {
      newSnapshot = page.createdDateTime;
    }
  }

  // Filter to pages strictly after the previous cursor, then sort
  // chronologically (oldest → newest) so downstream workflows see
  // events in creation order. Graph returned newest-first.
  const fresh = result.pages.filter(
    (p) =>
      typeof p.createdDateTime === "string" &&
      p.createdDateTime > previousSnapshot &&
      typeof p.id === "string" &&
      p.id.length > 0,
  );
  const chronological = [...fresh].sort((a, b) =>
    a.createdDateTime! < b.createdDateTime!
      ? -1
      : a.createdDateTime! > b.createdDateTime!
        ? 1
        : 0,
  );

  for (const page of chronological) {
    try {
      const dedupOutcome = await checkAndMarkSeen(page.id);
      if (dedupOutcome.outage) continue; // fail-closed
      if (!dedupOutcome.fresh) continue; // already processed in a prior tick

      const event = normalizeNewNote({
        page,
        accountId,
        notebookId: config.notebookId,
        sectionId: config.sectionId,
      });

      await enqueueRun({
        workflowId: trigger.workflowId,
        triggerNodeId: trigger.nodeId,
        event,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "microsoft-onenote.new_note.poll.page_failed",
          triggerId: trigger.id,
          pageId: page.id,
          error: (err as Error).message,
        }),
      );
    }
  }

  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    snapshot: {
      lastSeenCreatedDateTime: newSnapshot,
      capturedAt: config.snapshot.capturedAt,
    },
    polling: {
      lastPolledAt: new Date(input.now).toISOString(),
    },
  });
}

export const microsoftOneNoteNewNotePollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "microsoft-onenote" &&
    trigger.eventType === "new_note",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};

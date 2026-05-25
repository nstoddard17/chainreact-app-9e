import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { enqueueRun } from "@/services/execution/enqueue";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { pagesList } from "../../api/pagesList";
import { checkAndMarkSeen } from "./dedup";
import { normalizeUpdatedNote } from "./normalize";
import { UpdatedNoteConfigSchema } from "./schema";

/**
 * OneNote `updated_note` polling handler — Slice 3.ONENOTE-5.
 *
 * Same V2-native section-scoped polling architecture as `new_note`
 * — see that file's header for the full design rationale (Graph
 * deprecated subscriptions May 2023; client-side filter; bounded at
 * 100 pages per tick).
 *
 * Per-tick flow:
 *   1. Parse + validate config; require non-null snapshot.
 *   2. Resolve integration (access gate).
 *   3. GET pages with `$orderby=lastModifiedDateTime desc&$top=100`.
 *   4. Client-side filter: keep pages where
 *      `lastModifiedDateTime > snapshot.lastSeenModifiedDateTime`.
 *   5. **Exclude brand-new pages** (`createdDateTime ===
 *      lastModifiedDateTime`) — `new_note` covers them; this trigger
 *      fires ONLY for real updates.
 *   6. **Apply optional pageId filter** when `config.pageId !== null`
 *      — only that page's updates fire.
 *   7. **Snapshot advances to max(previous, newest fetched) BEFORE
 *      dispatch.** Same invariant as new_note.
 *   8. For each surviving page: dedup via
 *      `${pageId}:${lastModifiedDateTime}` composite key (so multiple
 *      updates of the same page over time fire correctly), normalize,
 *      enqueue.
 *   9. Persist updated config (snapshot + lastPolledAt).
 *
 * 404 NotFoundError handling: same as new_note — do NOT advance the
 * snapshot, log structured warn, return.
 */

const HANDLER_ID = "microsoft-onenote/updated_note";
const PAGE_BATCH = 100;

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = UpdatedNoteConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "microsoft-onenote.updated_note.poll.no_snapshot",
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
        event: "microsoft-onenote.updated_note.poll.no_integration",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        userId: trigger.userId,
      }),
    );
    return;
  }
  const accountId = integration.providerAccountId;

  const previousSnapshot = config.snapshot.lastSeenModifiedDateTime;

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
          orderBy: "lastModifiedDateTime desc",
          top: PAGE_BATCH,
        }),
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      console.warn(
        JSON.stringify({
          event:
            "microsoft-onenote.updated_note.poll.section_unavailable",
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

  // Advance snapshot to max(previous, any fetched lastModifiedDateTime)
  // — even when every fetched page is filtered out (new pages, wrong
  // pageId, dedup hits) we never re-poll the same batch.
  let newSnapshot = previousSnapshot;
  for (const page of result.pages) {
    if (
      typeof page.lastModifiedDateTime === "string" &&
      page.lastModifiedDateTime > newSnapshot
    ) {
      newSnapshot = page.lastModifiedDateTime;
    }
  }

  // Filter pipeline:
  //   - newer than snapshot
  //   - non-empty id
  //   - non-empty lastModifiedDateTime (required for eventId)
  //   - EXCLUDE brand-new pages (createdDateTime === lastModifiedDateTime
  //     → new_note covers them; preventing double-fire is a contract
  //     decision the slice spec required)
  //   - optional pageId filter
  const candidates = result.pages.filter((p) => {
    if (typeof p.id !== "string" || p.id.length === 0) return false;
    if (
      typeof p.lastModifiedDateTime !== "string" ||
      p.lastModifiedDateTime.length === 0
    ) {
      return false;
    }
    if (p.lastModifiedDateTime <= previousSnapshot) return false;
    if (
      typeof p.createdDateTime === "string" &&
      p.createdDateTime === p.lastModifiedDateTime
    ) {
      return false;
    }
    if (config.pageId !== null && p.id !== config.pageId) return false;
    return true;
  });

  // Sort chronologically (oldest update → newest update). Graph returned
  // newest-first; flip so downstream sees updates in temporal order.
  const chronological = [...candidates].sort((a, b) =>
    a.lastModifiedDateTime! < b.lastModifiedDateTime!
      ? -1
      : a.lastModifiedDateTime! > b.lastModifiedDateTime!
        ? 1
        : 0,
  );

  for (const page of chronological) {
    try {
      const dedupOutcome = await checkAndMarkSeen(
        page.id,
        page.lastModifiedDateTime!,
      );
      if (dedupOutcome.outage) continue; // fail-closed
      if (!dedupOutcome.fresh) continue; // already processed (same page + same mtime)

      const event = normalizeUpdatedNote({
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
          event: "microsoft-onenote.updated_note.poll.page_failed",
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
      lastSeenModifiedDateTime: newSnapshot,
      capturedAt: config.snapshot.capturedAt,
    },
    polling: {
      lastPolledAt: new Date(input.now).toISOString(),
    },
  });
}

export const microsoftOneNoteUpdatedNotePollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "microsoft-onenote" &&
    trigger.eventType === "updated_note",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};

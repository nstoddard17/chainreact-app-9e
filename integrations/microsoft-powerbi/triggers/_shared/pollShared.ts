import { enqueueRun } from "@/services/execution/enqueue";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Cross-domain plumbing shared by every Power BI poll module.
 *
 * This module is deliberately domain-free: it owns the poll-input shape and
 * the three side effects every Power BI trigger performs — emit a run,
 * persist the snapshot, and log a missing snapshot. Fetching, status
 * matching, diffing, and payload construction belong to the per-domain poll
 * modules (`pollSemanticModelRefreshes.ts`, `pollDax.ts`, `pollWorkspace.ts`,
 * …), which import from here.
 *
 * Keeping it separate is what lets each domain module stay under the
 * 400-line cap and lets all 16 triggers emit + persist through ONE code
 * path, so the dedup and snapshot contracts can't drift per trigger.
 */

export interface PowerBiPollInput {
  trigger: TriggerResourceRecord;
  providerAccountId: string;
  now: number;
}

/**
 * Case-insensitive status compare — provider status casing is not
 * contractual, so a casing change on the provider side must not silently
 * break a trigger. Shared by every status-matching predicate.
 */
export function statusEquals(actual: string | null, target: string): boolean {
  return (
    typeof actual === "string" && actual.toLowerCase() === target.toLowerCase()
  );
}

/**
 * Enqueue one run for a trigger match.
 *
 * The event id is synthetic and TIMESTAMP-FREE:
 * `microsoft-powerbi:<workflowId>:<nodeId>:<eventType>:<key>` where `key`
 * is a durable provider entity id. Two identical ticks therefore produce
 * the identical event id and dedup at the engine boundary — even if the
 * snapshot regressed (e.g. the workflow was reactivated and pre-existing
 * entries momentarily look new).
 *
 * Shared by every Power BI poll module so all 16 triggers emit through one
 * code path.
 */
export async function emitEvent(input: {
  trigger: TriggerResourceRecord;
  providerAccountId: string;
  eventType: string;
  key: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { trigger, providerAccountId, eventType, key, payload } = input;

  const eventId = `microsoft-powerbi:${trigger.workflowId}:${trigger.nodeId}:${eventType}:${key}`;

  const event: TriggerEvent = {
    provider: "microsoft-powerbi",
    eventType,
    eventId,
    occurredAt: new Date().toISOString(),
    providerAccountId,
    payload,
  };

  try {
    await enqueueRun({
      workflowId: trigger.workflowId,
      triggerNodeId: trigger.nodeId,
      event,
    });
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "microsoft-powerbi.poll.enqueue_failed",
        triggerId: trigger.id,
        eventId,
        error: (err as Error).message,
      }),
    );
  }
}

/**
 * Persist the advanced snapshot + `polling.lastPolledAt` back to
 * `trigger_resources.config`. Shared by every Power BI poll module.
 */
export async function persistSnapshot(input: {
  triggerId: string;
  config: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  now: number;
}): Promise<void> {
  await triggerResourcesRepo.updateConfig(input.triggerId, {
    ...input.config,
    snapshot: input.snapshot,
    polling: {
      lastPolledAt: new Date(input.now).toISOString(),
    },
  });
}

/** Defensive log for a trigger row whose activation snapshot is absent. */
export function warnMissingSnapshot(
  trigger: TriggerResourceRecord,
  eventType: string,
): void {
  console.warn(
    JSON.stringify({
      event: "microsoft-powerbi.poll.no_snapshot",
      triggerId: trigger.id,
      workflowId: trigger.workflowId,
      eventType,
    }),
  );
}

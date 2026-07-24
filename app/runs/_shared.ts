import type { RunListItem } from "@/contracts/workflow";
import { filterVehicleLinksCta } from "@/services/resourceLinks/flags";
import type { WorkflowRunDisplayRecord } from "@/repositories/workflowRuns";

/**
 * Server-side mapper from the safe repository projection
 * (`WorkflowRunDisplayRecord`) to the route-safe `RunListItem`
 * (Slice 4.RUNS-PAGE-1).
 *
 * Resolution rules:
 *   - `workflowName`: looked up from the (id → name) map populated by
 *     `workflowsRepo.listNamesByIds(...)`. Falls back to `"Untitled
 *     workflow"` when the workflow row was hard-deleted before the
 *     name could be joined (rare; soft-delete is the normal path).
 *   - `durationMs`: `finishedAt − startedAt` in milliseconds. NULL
 *     when `finishedAt` is missing (a swept stale-running row or a
 *     pre-COST-15B legacy row).
 *
 * Underscore-prefixed module: not a route. Imported only from sibling
 * route + page files in `app/runs/`.
 */

export function toRunListItem(
  record: WorkflowRunDisplayRecord,
  workflowNameById: ReadonlyMap<string, string>,
): RunListItem {
  return {
    id: record.id,
    workflowId: record.workflowId,
    workflowName: workflowNameById.get(record.workflowId) ?? "Untitled workflow",
    status: record.status,
    isTest: record.isTest,
    triggeredBy: record.triggeredBy,
    triggeredByApiKeyPrefix: record.triggeredByApiKeyPrefix,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: computeDurationMs(record.startedAt, record.finishedAt),
    errorClassification: record.errorClassification
      ? {
          title: record.errorClassification.title,
          description: record.errorClassification.description,
          // Both optional fields are passed through ONLY when present —
          // the schema treats them as `optional()`, not `nullable()`, so
          // mapping `undefined` rather than `null` keeps the wire shape
          // matching `HumanizedErrorSchema`.
          ...(record.errorClassification.hint !== undefined && {
            hint: record.errorClassification.hint,
          }),
          // CS-6 — a `link_vehicles` CTA is stripped when the Vehicle Links
          // surface is disabled, so the runs list never renders a button
          // pointing at a 404. Every other action passes through unchanged.
          ...(filterVehicleLinksCta(record.errorClassification.action) !== undefined && {
            action: filterVehicleLinksCta(record.errorClassification.action),
          }),
          severity: record.errorClassification.severity,
        }
      : null,
  };
}

function computeDurationMs(
  startedAt: string,
  finishedAt: string | null,
): number | null {
  if (!finishedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const diff = end - start;
  return diff < 0 ? 0 : diff;
}

/**
 * Default page size for the run-history list. Server-cap (200) is
 * enforced inside `repositories/workflowRuns.ts:listByUserForDisplay`.
 * Stays in sync with `NOTIFICATION_BELL_PREVIEW_LIMIT`'s sibling
 * pattern (a single source of truth between the API + the page +
 * tests).
 */
export const RUN_LIST_DEFAULT_LIMIT = 50;

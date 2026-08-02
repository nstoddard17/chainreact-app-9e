import {
  MobileRunListResponseSchema,
  MobileRunDetailSchema,
  type MobileRunListResponse,
  type MobileRunDetail,
  type MobileRunStatus,
} from "@chainreact/mobile-contracts";
import {
  clampMobilePageLimit,
  decodeMobileCursor,
  encodeMobileCursor,
} from "@/core/mobile/cursor";
import {
  listPageByAccountForMobileServiceRole,
  getRunForMobileDetailServiceRole,
  type MobileRunListRecord,
} from "@/repositories/mobile/workflowRuns";
import {
  listNamesByIdsForAccountServiceRole,
} from "@/repositories/mobile/workflows";
import { getByIdServiceRole } from "@/repositories/workflows";
import { InvalidMobileCursorError } from "./workflows";

/**
 * Mobile run read models (MOBILE-COMPANION-M1-MOBILE-READ-API-1).
 *
 * Both lists and the detail INCLUDE non-terminal (`queued`/`running`) runs —
 * the signature-journey fix: a run id returned by a future run-now is
 * fetchable immediately. The repository layer already reduced rows to the
 * mobile-safe columns (no trigger_event / fatal_error at SQL; step outputs
 * dropped at the row boundary), and these mappers are allow-list only. The
 * persisted humanized `errorClassification` is the ONLY failure surface;
 * `durationMs` is computed server-side like the web list.
 */

const RUN_PAGE_DEFAULT = 25;
const RUN_PAGE_MAX = 100;

function durationMs(startedAt: string, finishedAt: string | null): number | null {
  if (finishedAt === null) return null;
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(ms) ? ms : null;
}

function toMobileRunSummary(record: MobileRunListRecord, workflowName: string) {
  return {
    id: record.id,
    workflowId: record.workflowId,
    workflowName,
    status: record.status,
    isTest: record.isTest,
    triggeredBy: record.triggeredBy,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: durationMs(record.startedAt, record.finishedAt),
    errorClassification: record.errorClassification,
  };
}

export interface ListMobileRunsOptions {
  limit?: number;
  cursor?: string;
  /** Optional scope to one workflow (already ownership-verified by caller). */
  workflowId?: string;
  status?: MobileRunStatus;
}

export async function listMobileRuns(
  accountId: string,
  opts: ListMobileRunsOptions,
): Promise<MobileRunListResponse> {
  const limit = clampMobilePageLimit(opts.limit, {
    fallback: RUN_PAGE_DEFAULT,
    max: RUN_PAGE_MAX,
  });
  let before: { sortTs: string; id: string } | undefined;
  if (opts.cursor !== undefined) {
    const decoded = decodeMobileCursor(opts.cursor);
    if (decoded === null) throw new InvalidMobileCursorError();
    before = decoded;
  }

  const records = await listPageByAccountForMobileServiceRole(accountId, {
    limit: limit + 1,
    before,
    workflowId: opts.workflowId,
    status: opts.status,
  });
  const hasMore = records.length > limit;
  const page = hasMore ? records.slice(0, limit) : records;

  const nameById = await listNamesByIdsForAccountServiceRole(
    accountId,
    [...new Set(page.map((r) => r.workflowId))],
  );
  const last = page[page.length - 1];
  return MobileRunListResponseSchema.parse({
    runs: page.map((r) =>
      toMobileRunSummary(r, nameById.get(r.workflowId) ?? "Workflow"),
    ),
    pageInfo: {
      nextCursor:
        hasMore && last !== undefined
          ? encodeMobileCursor({ sortTs: last.startedAt, id: last.id })
          : null,
      hasMore,
    },
  });
}

export interface MobileWorkflowRef {
  id: string;
  name: string;
  /** nodeId → user-facing step label (user rename, else humanized type). */
  stepLabelByNodeId: ReadonlyMap<string, string>;
}

/** "send_channel_message" → "Send channel message". Presentation only. */
function humanizeNodeType(type: string): string {
  const words = type.replace(/[_-]+/g, " ").trim();
  return words.length === 0
    ? type
    : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Verify `workflowId` belongs to `accountId` (not deleted). Shared by the
 * per-workflow list + run-detail routes; null → 404 (no existence leak).
 * Returns LABELING data only — the graph never leaves this function.
 */
export async function verifyWorkflowInAccount(
  accountId: string,
  workflowId: string,
): Promise<MobileWorkflowRef | null> {
  const record = await getByIdServiceRole(workflowId);
  if (!record || record.accountId !== accountId || record.state === "deleted") {
    return null;
  }
  return {
    id: record.id,
    name: record.name,
    stepLabelByNodeId: new Map(
      record.draftDefinition.nodes.map((n) => [
        n.id,
        n.displayName ?? humanizeNodeType(n.type),
      ]),
    ),
  };
}

/**
 * ANY-status redacted run detail. Null → 404 for: missing run, run not owned
 * by the verified account, or run not belonging to the named workflow — all
 * indistinguishable to the caller.
 */
export async function getMobileRunDetail(
  accountId: string,
  workflow: MobileWorkflowRef,
  runId: string,
): Promise<MobileRunDetail | null> {
  const record = await getRunForMobileDetailServiceRole(runId);
  if (
    !record ||
    record.accountId !== accountId ||
    record.workflowId !== workflow.id
  ) {
    return null;
  }
  return MobileRunDetailSchema.parse({
    id: record.id,
    workflowId: record.workflowId,
    workflowName: workflow.name,
    status: record.status,
    isTest: record.isTest,
    triggeredBy: record.triggeredBy,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: durationMs(record.startedAt, record.finishedAt),
    errorClassification: record.errorClassification,
    steps: record.steps.map((s) => ({
      nodeId: s.nodeId,
      // Resolved from the OWNING workflow's node labels (a run of an older
      // revision may reference a since-removed node → null, rendered by id).
      displayName: workflow.stepLabelByNodeId.get(s.nodeId) ?? null,
      status: s.status,
      error: s.error,
    })),
  });
}

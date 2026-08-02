import {
  MobileWorkflowListResponseSchema,
  MobileWorkflowDetailSchema,
  type MobileWorkflowListResponse,
  type MobileWorkflowDetail,
  type MobileWorkflowSummary,
} from "@chainreact/mobile-contracts";
import type { WorkflowState } from "@/contracts/workflow";
import { summarizeDefinition } from "@/core/workflows/definitionSummary";
import {
  clampMobilePageLimit,
  decodeMobileCursor,
  encodeMobileCursor,
} from "@/core/mobile/cursor";
import { getProvider, providerIconUrl } from "@/integrations/_registry";
import { listPageByAccountServiceRole } from "@/repositories/mobile/workflows";
import { getByIdServiceRole } from "@/repositories/workflows";
import { getStatsForAccount } from "@/repositories/workflowRunStats";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowRunStats } from "@/contracts/workflow";

/**
 * Mobile workflow read models (MOBILE-COMPANION-M1-MOBILE-READ-API-1).
 *
 * ALLOW-LIST mappers only: a `WorkflowRecord` (which carries the full
 * `draftDefinition`) never crosses this module's return boundary — summaries
 * carry derived chips/counts/stats, and the detail adds LABELING node data
 * (id / kind / capability / provider / user display name; never config,
 * never edges). `disabledContext` is deliberately dropped everywhere — it is
 * free-form ops text that may reference provider internals; the typed
 * `disabledReason` enum is the mobile surface.
 */

const WORKFLOW_PAGE_DEFAULT = 25;
const WORKFLOW_PAGE_MAX = 50;

export class InvalidMobileCursorError extends Error {}

function toMobileWorkflowSummary(
  record: WorkflowRecord,
  statsByWorkflow: ReadonlyMap<string, WorkflowRunStats>,
): MobileWorkflowSummary {
  const summary = summarizeDefinition(record.draftDefinition);
  return {
    id: record.id,
    name: record.name,
    state: record.state,
    disabledReason: record.disabledReason,
    providers: summary.providerIds.map((id) => ({
      id,
      label: getProvider(id)?.displayName ?? id,
      iconUrl: providerIconUrl(id) ?? null,
    })),
    triggerCount: summary.triggerCount,
    actionCount: summary.actionCount,
    runStats: statsByWorkflow.get(record.id) ?? {
      total: 0,
      succeeded: 0,
      successRate: 0,
      lastRunAt: null,
      lastRunStatus: null,
    },
    updatedAt: record.updatedAt,
  };
}

export async function listMobileWorkflows(
  accountId: string,
  opts: { limit?: number; cursor?: string; state?: WorkflowState },
): Promise<MobileWorkflowListResponse> {
  const limit = clampMobilePageLimit(opts.limit, {
    fallback: WORKFLOW_PAGE_DEFAULT,
    max: WORKFLOW_PAGE_MAX,
  });
  let before: { sortTs: string; id: string } | undefined;
  if (opts.cursor !== undefined) {
    const decoded = decodeMobileCursor(opts.cursor);
    if (decoded === null) throw new InvalidMobileCursorError();
    before = decoded;
  }

  const [records, statsByWorkflow] = await Promise.all([
    listPageByAccountServiceRole(accountId, {
      limit: limit + 1,
      before,
      state: opts.state,
    }),
    getStatsForAccount(accountId),
  ]);

  const hasMore = records.length > limit;
  const page = hasMore ? records.slice(0, limit) : records;
  const last = page[page.length - 1];
  return MobileWorkflowListResponseSchema.parse({
    workflows: page.map((r) => toMobileWorkflowSummary(r, statsByWorkflow)),
    pageInfo: {
      nextCursor:
        hasMore && last !== undefined
          ? encodeMobileCursor({ sortTs: last.updatedAt, id: last.id })
          : null,
      hasMore,
    },
  });
}

/**
 * Lightweight detail: summary + node labeling data. Returns null (→ 404) for
 * a missing, deleted, or CROSS-ACCOUNT workflow — the caller's verified
 * `accountId` is the authority and mismatches collapse to not-found.
 */
export async function getMobileWorkflowDetail(
  accountId: string,
  workflowId: string,
): Promise<MobileWorkflowDetail | null> {
  const record = await getByIdServiceRole(workflowId);
  if (!record || record.accountId !== accountId || record.state === "deleted") {
    return null;
  }
  const statsByWorkflow = await getStatsForAccount(accountId);
  const summary = toMobileWorkflowSummary(record, statsByWorkflow);
  return MobileWorkflowDetailSchema.parse({
    id: summary.id,
    name: summary.name,
    state: summary.state,
    disabledReason: summary.disabledReason,
    providers: summary.providers,
    triggerCount: summary.triggerCount,
    actionCount: summary.actionCount,
    runStats: summary.runStats,
    updatedAt: summary.updatedAt,
    nodes: record.draftDefinition.nodes.map((node) => ({
      nodeId: node.id,
      kind: node.kind,
      capability: `${node.provider}:${node.type}`,
      provider: node.provider,
      displayName: node.displayName ?? null,
    })),
  });
}

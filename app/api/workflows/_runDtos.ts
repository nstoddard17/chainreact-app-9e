import { redactOutput } from "@/core/security/redactOutput";
import {
  humanizeActionError,
  GENERIC_ACTION_ERROR_TITLE,
} from "@/core/errors/humanizeActionError";
import { getActionMeta } from "@/services/discovery/_registry";
import type { WorkflowRunRecord } from "@/repositories/workflowRuns";
import type { WorkflowRunDetail, WorkflowRunSummary } from "@/contracts/workflow";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

/**
 * Run-record → safe DTO serialization for the /api/workflows routes (extracted
 * from `_shared.ts` to keep that file under the size cap — no behavior change).
 *
 * Owns the run-summary / run-detail mappers and the per-step output redaction +
 * error sanitization they depend on. Re-exported from `_shared.ts`, so route
 * files importing `toWorkflowRunSummary` / `toWorkflowRunDetail` from `_shared`
 * are unchanged.
 *
 * Underscore-prefixed file: not a route. Importable from sibling route.ts files
 * (directly or via the `_shared` re-export).
 */

export function toWorkflowRunSummary(
  record: WorkflowRunRecord,
): WorkflowRunSummary {
  return {
    id: record.id,
    workflowId: record.workflowId,
    status: record.status,
    triggerNodeId: record.triggerNodeId,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    errorClassification: record.errorClassification,
    // Slice 4.BUILDER-RUNS-TAB-1 — safe source/test provenance for the
    // workflow-scoped Runs tab. Non-secret operational metadata, identical
    // provenance to the account-wide `RunListItem`; no raw payload exposure.
    triggeredBy: record.triggeredBy,
    isTest: record.isTest,
  };
}

/**
 * V2-READY-51 (Option C) — the run-detail DTO exposes SAFE operational fields
 * only. It drops the raw `triggerEvent` (upstream payload) and the raw
 * `fatalError` (engine-internal code/message); the humanized `errorClassification`
 * (from the summary) is the user-facing error surface. Each step always carries
 * `nodeId` + `status` and a sanitized `error`.
 *
 * Per-step OUTPUT is exposed ONLY when the caller is the run's own author
 * (`record.triggeredByUserId === callerUserId`) viewing a TEST run
 * (`record.isTest`). That is the single legitimate execution-output surface —
 * an author inspecting their own test run in the builder. A real (non-test) run,
 * or ANY other member (including owner/admin), receives status-only steps; raw
 * outputs stay server-internal. (Note: a test run is always started by a human
 * in the builder, so `triggeredByUserId` IS the author for `isTest` rows.)
 *
 * Slice 3.SEC-7 — when output IS exposed and `workflowNodes` is supplied, the
 * serializer additionally redacts `steps[].output` per the action's
 * `OutputMeta.sensitive` flags before returning. The DB row stays unmodified.
 *
 * Edge case — workflow edited since run: if a `step.nodeId` is no longer present
 * in `workflowNodes` (node deleted post-run), the redactor sees no meta and
 * returns that step's output unchanged (fail-open at the redactor layer, see
 * `core/security/redactOutput.ts`). The author-test gate already bounds whether
 * any output is shown at all, and only the author of their own test run reaches
 * this branch.
 */
export function toWorkflowRunDetail(
  record: WorkflowRunRecord,
  callerUserId: string,
  workflowNodes?: readonly WorkflowNode[],
): WorkflowRunDetail {
  const includeOutput =
    record.isTest &&
    record.triggeredByUserId !== null &&
    record.triggeredByUserId === callerUserId;
  const nodeMetaLookup = buildNodeMetaLookup(
    includeOutput ? workflowNodes : undefined,
  );
  return {
    ...toWorkflowRunSummary(record),
    steps: record.steps.map((s) => ({
      nodeId: s.nodeId,
      status: s.status,
      ...(includeOutput && s.output !== undefined
        ? { output: redactStepOutput(s.output, s.nodeId, nodeMetaLookup) }
        : {}),
      ...(s.error !== undefined ? { error: toSafeStepError(s.error) } : {}),
    })),
  };
}

/**
 * Build `nodeId → OutputMeta[]` lookup once per detail-response. The
 * map is small (≤ ~50 nodes per workflow) and built only when the
 * route opted into redaction by supplying `workflowNodes`.
 */
function buildNodeMetaLookup(
  workflowNodes: readonly WorkflowNode[] | undefined,
): Map<string, readonly import("@/contracts/actionMeta").OutputMeta[]> {
  const out = new Map<string, readonly import("@/contracts/actionMeta").OutputMeta[]>();
  if (!workflowNodes) return out;
  for (const node of workflowNodes) {
    if (node.kind !== "action") continue;
    if (!node.provider || !node.type) continue;
    const meta = getActionMeta(`${node.provider}:${node.type}`);
    if (!meta) continue;
    out.set(node.id, meta.outputs);
  }
  return out;
}

/**
 * V2-READY-2 — sanitize a persisted step error for the CLIENT. The stored step
 * error message is the RAW thrown text (the engine builds `HANDLER_FAILED` from
 * `(err as Error).message`), which can carry provider account ids, emails,
 * tokens, integration ids, account ids, scopes, or raw provider error bodies.
 * The run-detail endpoint feeds the builder's RunResultsPanel, so we surface only
 * the stable `code` + a HUMANIZED, identifier-free message — the same humanizer
 * the run-summary `errorClassification` uses. The raw message stays in the DB
 * `steps` jsonb for server-side diagnostics and is never returned to the client.
 * Mirrors the `redactStepOutput` boundary directly below; `details` is dropped
 * because the only useful detail (MISSING_VARIABLE's `{{path}}`) is already
 * folded into the humanized description, and details is the other free-form
 * vector that could carry raw provider data.
 *
 * The generic humanizer fallback (`title === GENERIC_ACTION_ERROR_TITLE`) is the
 * ONE branch whose description echoes the raw message — for it we emit the safe
 * generic title instead. Every other branch's description is code/details-derived.
 */
function toSafeStepError(error: {
  code: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}): { code: string; message: string } {
  const humanized = humanizeActionError({
    code: error.code,
    message: error.message,
    ...(error.details !== undefined ? { details: error.details } : {}),
  });
  const message =
    humanized.title === GENERIC_ACTION_ERROR_TITLE
      ? humanized.title
      : humanized.description;
  return { code: error.code, message };
}

function redactStepOutput(
  output: Readonly<Record<string, unknown>>,
  nodeId: string,
  nodeMetaLookup: Map<string, readonly import("@/contracts/actionMeta").OutputMeta[]>,
): Record<string, unknown> {
  const outputs = nodeMetaLookup.get(nodeId);
  if (!outputs) return output as Record<string, unknown>;
  // redactOutput preserves the top-level object shape (input is an
  // object → output is an object); the `unknown` return type is for
  // the general nested case. Safe to coerce back here.
  return redactOutput(output, outputs) as Record<string, unknown>;
}

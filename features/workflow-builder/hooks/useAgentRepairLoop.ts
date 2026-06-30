"use client";

import { useEffect, useRef } from "react";
import type { WorkflowRunDetail } from "@/contracts/workflow";
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { useRunSlice } from "../state/runSlice";
import { useGraphSlice } from "../state/graphSlice";
import {
  useRepairLoopStore,
  type AgentRepairDiagnosis,
  type AgentRepairLoop,
} from "../state/repairLoopStore";

/**
 * REACT-AGENT-TEST-FIX-LOOP — advance the guided repair thread from the latest
 * run slice.
 *
 * Mounted at the STABLE builder root (the guided panel itself unmounts when the
 * drawer switches), this watcher maps run-slice terminal transitions onto the
 * repair-loop store:
 *
 *   - a test run reaches `failed`  → `recordFailure` (new thread, or
 *     `still_failing` + attemptCount++ when a thread is already active)
 *   - a retest is dispatched (`pending`) while an active failing thread exists
 *     → `markRetesting`
 *   - a run reaches `succeeded` while a thread is active → `recordPass`
 *     (a success with NO prior failure thread is ignored — the panel never
 *     claims "ready" out of nowhere)
 *
 * Fail-open: the whole subscriber body is guarded so a malformed run detail can
 * never throw into the builder. Idempotent per (runId, status).
 *
 * This hook does NOT open the config rail — auto-revealing would flip the right
 * drawer to `inspector` and hide the guided panel. Reveal is user-initiated from
 * the panel (`buildRepairReveal` below feeds `configSlice.revealNode`).
 */
export function useAgentRepairLoop(
  workflowId: string,
  opts: { enabled?: boolean } = {},
): void {
  const enabled = opts.enabled !== false;
  const handledTerminalRef = useRef<string | null>(null);
  const markedRetestRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    handledTerminalRef.current = null;
    markedRetestRef.current = null;
    const unsub = useRunSlice.subscribe((state) => {
      try {
        if (state.workflowId !== workflowId) return;
        const store = useRepairLoopStore.getState();
        const runId = state.runId;

        // A retest started — mark the active thread "retesting" once per run.
        if (state.status === "pending" && runId) {
          if (markedRetestRef.current !== runId) {
            markedRetestRef.current = runId;
            store.markRetesting({ workflowId, runId });
          }
          return;
        }

        if (state.status !== "succeeded" && state.status !== "failed") return;
        if (!runId) return;
        const key = `${runId}:${state.status}`;
        if (handledTerminalRef.current === key) return;
        handledTerminalRef.current = key;

        const lastTestedAt = state.detail?.finishedAt;
        if (state.status === "failed") {
          const nodes = useGraphSlice.getState().pendingNodes;
          const diagnosis = computeRepairDiagnosis(state.detail, nodes);
          store.recordFailure({
            workflowId,
            runId,
            diagnosis,
            ...(lastTestedAt !== undefined ? { lastTestedAt } : {}),
          });
        } else {
          // Succeeded — a pass only when a thread is already active for this
          // workflow. A first-ever success has no thread → nothing to claim.
          const loop = store.loop;
          if (loop && loop.workflowId === workflowId) {
            store.recordPass({
              workflowId,
              runId,
              ...(lastTestedAt !== undefined ? { lastTestedAt } : {}),
            });
          }
        }
      } catch {
        /* fail-open: the repair loop never crashes the builder */
      }
    });
    return unsub;
  }, [enabled, workflowId]);
}

const GENERIC_REASON = "This test run failed.";
const NODE_NEXT_STEP =
  "Open the failing step, review its configuration, then retest.";
const GRAPH_NEXT_STEP = "Review this workflow's configuration, then retest.";

/**
 * Derive a SAFE diagnosis from a failed run + the current graph. Pure; never
 * throws (the watcher relies on this for fail-open).
 *
 * No-leak: `safeReason` comes ONLY from the humanized `errorClassification`
 * (already sanitized server-side) or a fixed generic fallback — NEVER from
 * `step.error.message` (raw provider text). v1 is lean on field naming: the
 * failing NODE is always derivable from the failed step, but no config-field
 * key is proven from run detail, so `failingFieldPath` stays unset (node-level
 * focus only). Field-level highlight is plumbed for a future proven source and
 * is never guessed here.
 */
export function computeRepairDiagnosis(
  detail: WorkflowRunDetail | null,
  nodes: readonly WorkflowNode[],
): AgentRepairDiagnosis {
  const steps = Array.isArray(detail?.steps) ? detail.steps : [];
  const failedStep = steps.find((s) => s?.status === "failed");
  const node = failedStep
    ? nodes.find((n) => n.id === failedStep.nodeId)
    : undefined;

  const cls = detail?.errorClassification ?? null;
  const safeReason =
    (cls?.description?.trim() || cls?.title?.trim() || "") || GENERIC_REASON;

  const diagnosis: AgentRepairDiagnosis = {
    safeReason,
    nextStep: node ? NODE_NEXT_STEP : GRAPH_NEXT_STEP,
  };
  if (failedStep?.nodeId) diagnosis.failingNodeId = failedStep.nodeId;
  if (node) diagnosis.failingNodeLabel = getNodeDisplayName(node);
  return diagnosis;
}

/**
 * Build the `configSlice.revealNode` argument for the loop's failing target, or
 * null when there's no node to open (or it's no longer on the canvas). The
 * `fieldKey` is included ONLY when a field path is proven on the loop — never
 * guessed — so the config rail highlights a specific field only when the code
 * can prove it.
 */
export function buildRepairReveal(
  loop: AgentRepairLoop | null,
  nodes: readonly WorkflowNode[],
): { nodeId: string; initialValues: Record<string, unknown>; fieldKey?: string } | null {
  if (!loop?.failingNodeId) return null;
  const node = nodes.find((n) => n.id === loop.failingNodeId);
  if (!node) return null;
  return {
    nodeId: node.id,
    initialValues: node.config ?? {},
    ...(loop.failingFieldPath ? { fieldKey: loop.failingFieldPath } : {}),
  };
}

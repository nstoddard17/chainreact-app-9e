"use client";

import { useEffect, useRef } from "react";
import { recordAgentChange } from "@/lib/api/agentChangeHistory";
import { useRunSlice } from "../state/runSlice";
import { useRepairVerificationStore } from "../state/repairVerificationStore";

/**
 * AGENT-CHANGE-HISTORY-1 (test-fix) — verify a just-applied failed-run repair.
 *
 * Mounted at the STABLE builder root (the repair UI unmounts when the verifying
 * run starts). Watches the latest-run slice; when a run reaches a terminal
 * outcome (succeeded / failed) AFTER a repair was armed for this workflow — and
 * it isn't the original failed run — it records a `tested` / `test_failed`
 * transition on the repair's history item, then disarms + bumps the store so the
 * Agent-changes timeline refreshes.
 *
 * Fail-open: a failed record never throws into the builder. `handledRunIdRef`
 * makes it idempotent (one transition per terminal run).
 */
export function useRepairTestVerification(
  workflowId: string,
  opts: { enabled?: boolean } = {},
): void {
  const enabled = opts.enabled !== false;
  const handledRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    handledRunIdRef.current = null;
    const unsub = useRunSlice.subscribe((state) => {
      if (state.status !== "succeeded" && state.status !== "failed") return;
      const runId = state.runId;
      if (!runId || handledRunIdRef.current === runId) return;
      const pending = useRepairVerificationStore.getState().pending;
      if (!pending || pending.workflowId !== workflowId) return;
      // The original failed run is still terminal in the slice right after a repair — wait for the
      // NEXT run (the user re-running to verify the fix), not the run we just repaired.
      if (runId === pending.repairedRunId) return;
      handledRunIdRef.current = runId;
      const store = useRepairVerificationStore.getState();
      store.disarm();
      void recordAgentChange(workflowId, {
        agentChangeId: pending.agentChangeId,
        status: state.status === "succeeded" ? "tested" : "test_failed",
        runId,
      })
        .then(() => store.bump())
        .catch(() => {
          /* fail-open: verification telemetry never breaks the builder */
        });
    });
    return unsub;
  }, [enabled, workflowId]);
}

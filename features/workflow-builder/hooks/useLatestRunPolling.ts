"use client";

import { useEffect } from "react";
import { useRunSlice } from "../state/runSlice";

/**
 * Slice 3.8 — one active poller per tracked run.
 *
 * Owns the interval timer (1s cadence) for the latest-run preview.
 * Per the slice plan, polling is intentionally NOT inside runSlice so
 * the slice stays pure / trivially testable. The hook is the only
 * surface that creates `setInterval`.
 *
 * Invariants:
 *   - One active interval per (workflowId, runId). Re-keying the deps
 *     tears down the old interval before installing the new one.
 *   - Cleanup on unmount.
 *   - Cleanup on terminal status (`succeeded` / `failed` / `lost`) so a
 *     finished run doesn't burn timer ticks until the user navigates.
 *   - Cleanup on `idle` (no run is being tracked).
 *
 * The slice's `pollOnce` also self-guards against stale callbacks (the
 * pointer may have changed mid-fetch), so the hook only needs to handle
 * timer lifecycle.
 */

const POLL_INTERVAL_MS = 1000;

export function useLatestRunPolling(): void {
  const workflowId = useRunSlice((s) => s.workflowId);
  const runId = useRunSlice((s) => s.runId);
  const status = useRunSlice((s) => s.status);

  useEffect(() => {
    if (!workflowId || !runId) return;
    if (status === "succeeded" || status === "failed" || status === "lost") {
      return;
    }
    // Read pollOnce from the store at tick time rather than closing
    // over a stale reference. zustand actions are stable, but this
    // keeps the dep array minimal and avoids re-installing the timer
    // whenever the slice's exported actions reference changes (it
    // doesn't in practice, but the pattern is forgiving).
    const id = setInterval(() => {
      void useRunSlice.getState().pollOnce();
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
    };
  }, [workflowId, runId, status]);
}

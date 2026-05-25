import { create } from "zustand";
import type { WorkflowRunDetail } from "@/contracts/workflow";
import { getWorkflowRun, WorkflowApiError } from "@/lib/api/workflows";

/**
 * Builder latest-run slice — Slice 3.8 test-run output preview.
 *
 * Per docs/rules/workflow-state-store.md (Resolved Decisions):
 *   - Each slice owns one cohesive responsibility. graphSlice + configSlice
 *     stay free of run-tracking concerns.
 *   - In-memory only. The latest-run pointer is session-only and resets on
 *     workflow change / unmount — never persisted across reloads. The
 *     workflow_runs table is the durable surface.
 *   - Slice does not import from repositories/ or services/. It calls the
 *     typed client API (`getWorkflowRun`) only.
 *
 * Polling caveat (per the plan):
 *   - The slice owns *state* (status, detail, error, pollCount,
 *     workflowId/runId pointers). The interval timer itself lives in
 *     `hooks/useLatestRunPolling.ts` so the slice stays pure /
 *     trivially testable. The slice exposes a `pollOnce()` action the
 *     hook calls on its tick; one active poller per tracked run is the
 *     hook's invariant, not the slice's.
 */

/**
 * Pending = the run was started client-side; the engine hasn't persisted
 *   `workflow_runs` yet (or the row exists but the user has just opened
 *   the panel and hasn't loaded it). Polling reads `null` or 404 here.
 * Succeeded / Failed = terminal; polling stops.
 * Lost = exceeded the poll-count ceiling without ever seeing a row.
 *   Treated as a soft failure in the UI (the engine may still finish, but
 *   the panel stops pinging the server).
 */
export type LatestRunStatus =
  | "idle"
  | "pending"
  | "succeeded"
  | "failed"
  | "lost";

export interface RunSliceState {
  /** The workflow this latest-run pointer belongs to. Reset on workflow change. */
  workflowId: string | null;
  /** The runId returned by Run Now (or any future "start tracking" surface). */
  runId: string | null;
  status: LatestRunStatus;
  /** Hydrated detail once the row exists. Null until first 200. */
  detail: WorkflowRunDetail | null;
  /**
   * Non-404 fetch errors (e.g. 401/500). Surfaced in the panel; does NOT
   * count toward terminal state because the engine may still be writing
   * the row. The hook still keeps polling so a transient blip doesn't
   * permanently brick the preview.
   */
  fetchError: string | null;
  /** How many poll ticks have run for the current runId. Capped at 60. */
  pollCount: number;
}

export interface RunSliceActions {
  /**
   * Begin tracking a new run. Resets pollCount / detail / error / status.
   * Called by RunNowPanel on a successful runNowWorkflow response. Calling
   * with the same (workflowId, runId) pair as the current tracking target
   * is a no-op so a re-render doesn't reset the count.
   */
  startTracking(input: { workflowId: string; runId: string }): void;
  /**
   * Stop tracking the current run. Does NOT clear the last-loaded detail
   * — terminal runs stay visible until the user navigates away or starts
   * a new run.
   */
  stopTracking(): void;
  /**
   * Reset everything. Called on workflow change (graphSlice's hydrate
   * triggers WorkflowBuilder's reset effect, which calls this).
   */
  reset(): void;
  /**
   * Perform exactly one poll cycle. The hook owns the timer; this action
   * is what the timer calls on tick. Bumps pollCount, calls the typed
   * client, and writes the new state. Idempotent enough that a stray
   * double-call doesn't corrupt state (the second call sees the same
   * runId and either updates with newer data or moves toward "lost").
   */
  pollOnce(): Promise<void>;
}

export type RunSlice = RunSliceState & RunSliceActions;

const INITIAL_STATE: RunSliceState = Object.freeze({
  workflowId: null,
  runId: null,
  status: "idle",
  detail: null,
  fetchError: null,
  pollCount: 0,
});

/** Per the plan: 60-poll ceiling (≈ 60 seconds at 1s cadence). */
export const POLL_COUNT_CEILING = 60;

function isTerminalStatus(s: LatestRunStatus): boolean {
  return s === "succeeded" || s === "failed" || s === "lost";
}

export const useRunSlice = create<RunSlice>((set, get) => ({
  ...INITIAL_STATE,

  startTracking({ workflowId, runId }) {
    const current = get();
    if (current.workflowId === workflowId && current.runId === runId) {
      return; // already tracking this run — keep state.
    }
    set({
      workflowId,
      runId,
      status: "pending",
      detail: null,
      fetchError: null,
      pollCount: 0,
    });
  },

  stopTracking() {
    // Leave detail in place so the panel keeps showing the most recent
    // result; just signal "no more polling" via terminal-or-idle status.
    const current = get();
    if (isTerminalStatus(current.status)) return;
    set({ status: current.status === "idle" ? "idle" : "lost" });
  },

  reset() {
    set({ ...INITIAL_STATE });
  },

  async pollOnce() {
    const { workflowId, runId, status, pollCount } = get();
    if (!workflowId || !runId) return;
    if (isTerminalStatus(status)) return;
    if (pollCount >= POLL_COUNT_CEILING) {
      set({ status: "lost" });
      return;
    }
    const nextPollCount = pollCount + 1;
    try {
      const detail = await getWorkflowRun(workflowId, runId);
      // The pointer may have changed mid-flight (workflow change /
      // new run started). Don't write stale data into a fresh slot.
      const after = get();
      if (after.workflowId !== workflowId || after.runId !== runId) return;
      set({
        detail,
        status: detail.status === "succeeded" ? "succeeded" : "failed",
        fetchError: null,
        pollCount: nextPollCount,
      });
    } catch (err) {
      const after = get();
      if (after.workflowId !== workflowId || after.runId !== runId) return;
      if (err instanceof WorkflowApiError && err.status === 404) {
        // Row not written yet — bump counter, keep polling. Hit the
        // ceiling → "lost".
        if (nextPollCount >= POLL_COUNT_CEILING) {
          set({ status: "lost", pollCount: nextPollCount });
        } else {
          set({ pollCount: nextPollCount, fetchError: null });
        }
        return;
      }
      const message =
        err instanceof WorkflowApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to fetch run.";
      set({ pollCount: nextPollCount, fetchError: message });
    }
  },
}));

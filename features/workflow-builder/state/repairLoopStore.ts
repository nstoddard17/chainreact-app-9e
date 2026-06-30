import { create } from "zustand";

/**
 * REACT-AGENT-TEST-FIX-LOOP — the user-visible guided "test → fix → retest"
 * thread for a builder test run that failed.
 *
 * Why a store and not component state: the guided narrative lives in the
 * RunResultsPanel (right drawer, `results` mode), but the thread must survive
 * across MULTIPLE runs — the original failed run, the retest, and any further
 * retests — without losing context (attempt count, the running diagnosis). The
 * watcher that advances the thread (`useAgentRepairLoop`) is mounted at the
 * STABLE builder root and writes here; the panel reads it.
 *
 * Boundary: this is a pure state container. It does NOT import other slices, the
 * config rail, or the run slice (per docs/rules/workflow-state-store.md). The
 * root watcher orchestrates run-slice → repair-loop transitions; the panel
 * orchestrates repair-loop → config-rail reveals. Cross-slice work never lives
 * inside a slice.
 *
 * No-leak: this store holds a HUMANIZED `safeReason` (from the run's
 * `errorClassification`, already sanitized) + safe display labels + ids only.
 * It NEVER holds raw provider error text, tokens, request bodies, or config
 * values.
 */

export type AgentRepairLoopStatus =
  | "idle"
  | "test_failed"
  | "field_opened"
  | "retesting"
  | "test_passed"
  | "still_failing"
  | "retest_failed_to_start";

/**
 * The diagnosis derived from a failed run. `safeReason` + `nextStep` are always
 * present (with safe generic fallbacks). The node/field fields are present only
 * when proven from the run + current graph — never guessed.
 */
export interface AgentRepairDiagnosis {
  failingNodeId?: string;
  failingNodeLabel?: string;
  /** A proven config FieldMeta.name to highlight. Omitted unless proven. */
  failingFieldPath?: string;
  failingFieldLabel?: string;
  safeReason: string;
  nextStep: string;
}

export interface AgentRepairLoop {
  workflowId: string;
  /** The most recent run this thread is reflecting (failed or retest). */
  runId?: string;
  status: AgentRepairLoopStatus;
  failingNodeId?: string;
  failingNodeLabel?: string;
  failingFieldPath?: string;
  failingFieldLabel?: string;
  safeReason: string;
  nextStep: string;
  /** How many failing test runs this thread has seen (1 on first failure). */
  attemptCount: number;
  /** ISO timestamp of the last terminal test in this thread. */
  lastTestedAt?: string;
}

export interface RepairLoopState {
  /** At most one active thread (the current workflow's). Null = idle. */
  loop: AgentRepairLoop | null;
  /**
   * A test run failed. Starts a NEW thread for this workflow, OR — when an
   * active failing/retesting thread already exists for the same workflow —
   * CONTINUES it as `still_failing` with `attemptCount + 1` and the updated
   * diagnosis (so a repeated failure never starts over).
   */
  recordFailure(input: {
    workflowId: string;
    runId: string;
    diagnosis: AgentRepairDiagnosis;
    lastTestedAt?: string;
  }): void;
  /** A retest was dispatched while an active failing thread exists. */
  markRetesting(input: { workflowId: string; runId: string }): void;
  /** The retest succeeded — only meaningful while a thread is active. */
  recordPass(input: { workflowId: string; runId?: string; lastTestedAt?: string }): void;
  /** The failing node/field was opened in the config rail. */
  markFieldOpened(input: { workflowId: string }): void;
  /** The retest dispatch threw before a run could start. */
  markRetestFailedToStart(input: { workflowId: string }): void;
  /** Clear the thread (workflow change / unmount). */
  reset(): void;
}

/** Statuses where the thread is mid-repair (a retest continues it, not restarts it). */
function isActiveFailingThread(status: AgentRepairLoopStatus): boolean {
  return (
    status === "test_failed" ||
    status === "field_opened" ||
    status === "retesting" ||
    status === "still_failing"
  );
}

/** Spread only the DEFINED optional diagnosis fields (exactOptionalPropertyTypes-safe). */
function diagnosisFields(
  d: AgentRepairDiagnosis,
): { safeReason: string; nextStep: string } & Partial<
  Pick<AgentRepairLoop, "failingNodeId" | "failingNodeLabel" | "failingFieldPath" | "failingFieldLabel">
> {
  return {
    safeReason: d.safeReason,
    nextStep: d.nextStep,
    ...(d.failingNodeId !== undefined ? { failingNodeId: d.failingNodeId } : {}),
    ...(d.failingNodeLabel !== undefined ? { failingNodeLabel: d.failingNodeLabel } : {}),
    ...(d.failingFieldPath !== undefined ? { failingFieldPath: d.failingFieldPath } : {}),
    ...(d.failingFieldLabel !== undefined ? { failingFieldLabel: d.failingFieldLabel } : {}),
  };
}

export const useRepairLoopStore = create<RepairLoopState>((set, get) => ({
  loop: null,

  recordFailure({ workflowId, runId, diagnosis, lastTestedAt }) {
    const prev = get().loop;
    const continues =
      prev !== null &&
      prev.workflowId === workflowId &&
      isActiveFailingThread(prev.status);
    const attemptCount = continues ? prev.attemptCount + 1 : 1;
    set({
      loop: {
        workflowId,
        runId,
        status: continues ? "still_failing" : "test_failed",
        attemptCount,
        ...diagnosisFields(diagnosis),
        ...(lastTestedAt !== undefined ? { lastTestedAt } : {}),
      },
    });
  },

  markRetesting({ workflowId, runId }) {
    const prev = get().loop;
    if (!prev || prev.workflowId !== workflowId) return;
    if (!isActiveFailingThread(prev.status)) return;
    set({ loop: { ...prev, status: "retesting", runId } });
  },

  recordPass({ workflowId, runId, lastTestedAt }) {
    const prev = get().loop;
    if (!prev || prev.workflowId !== workflowId) return;
    set({
      loop: {
        ...prev,
        status: "test_passed",
        ...(runId !== undefined ? { runId } : {}),
        ...(lastTestedAt !== undefined ? { lastTestedAt } : {}),
      },
    });
  },

  markFieldOpened({ workflowId }) {
    const prev = get().loop;
    if (!prev || prev.workflowId !== workflowId) return;
    if (prev.status !== "test_failed" && prev.status !== "still_failing") return;
    set({ loop: { ...prev, status: "field_opened" } });
  },

  markRetestFailedToStart({ workflowId }) {
    const prev = get().loop;
    if (!prev || prev.workflowId !== workflowId) return;
    set({ loop: { ...prev, status: "retest_failed_to_start" } });
  },

  reset() {
    set({ loop: null });
  },
}));

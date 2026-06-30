import { create } from "zustand";

/**
 * AGENT-CHANGE-HISTORY-1 (test-fix) — shared correlation between "a failed-run
 * repair was just applied" and "the next run that verifies it".
 *
 * Why a store and not component state: the repair UI (`RunResultsRepairBlock`)
 * UNMOUNTS the moment the verifying run starts (it only renders while the latest
 * run is `failed`). The verification watcher therefore lives at a stable level
 * (the builder root) and reads the pending correlation from here.
 *
 * `version` is bumped whenever a repair history row is written (arm or verify) so
 * the Agent-changes timeline can refresh without a reload. This store holds NO
 * config / values / secrets — only ids.
 */

export interface RepairVerificationPending {
  readonly workflowId: string;
  /** The agent_change_history row (preview_applied) this repair created. */
  readonly agentChangeId: string;
  /** The FAILED run being repaired — the verifier ignores it and waits for the NEXT run. */
  readonly repairedRunId: string;
}

export interface RepairVerificationState {
  pending: RepairVerificationPending | null;
  /** Incremented on every repair-history write so the timeline can refresh. */
  version: number;
  arm(pending: RepairVerificationPending): void;
  disarm(): void;
  bump(): void;
}

export const useRepairVerificationStore = create<RepairVerificationState>((set) => ({
  pending: null,
  version: 0,
  arm: (pending) => set((s) => ({ pending, version: s.version + 1 })),
  disarm: () => set({ pending: null }),
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

"use client";

import { useCallback, useState } from "react";

/**
 * Modes the builder right-drawer can mount (BUILDER-INSPECTOR-1,
 * narrowed in BUILDER-LEFT-AGENT-1):
 *
 *   - `inspector`  → node configuration form (BUILDER-INSPECTOR-1).
 *   - `results`    → RunResultsPanel (BUILDER-RUN-PANEL-1).
 *   - `validation` → ValidationSummary list (BUILDER-VALIDATION-1).
 *
 * **The right drawer is node-contextual only.** AI does NOT mount here
 * — the React Agent lives in the persistent left rail
 * (`BuilderLeftAgentRail`). This decision is locked in
 * docs/slices/phase-4/builder-ui-v1-port-plan.md §0 (Correction
 * history) and §4 (decision text). The previously-reserved `"ai"` mode
 * was removed in Slice 4.BUILDER-LEFT-AGENT-1; any future reintroduction
 * must update the typed-union test in
 * `tests/unit/features/workflow-builder/hooks/useRightDrawer.test.tsx`
 * and explain why.
 *
 * Mutual exclusion is enforced by the hook: a single `mode` field, so
 * opening any mode closes whichever was previously open. This is the
 * "one right panel at a time" decision from §4 of the port plan.
 */
export type RightDrawerMode = "inspector" | "results" | "validation";

export interface UseRightDrawerResult {
  mode: RightDrawerMode | null;
  isOpen: boolean;
  openDrawer(mode: RightDrawerMode): void;
  closeDrawer(): void;
  toggleDrawer(mode: RightDrawerMode): void;
}

/**
 * Local UI state machine for the builder's right drawer.
 *
 * Slice 4.BUILDER-INSPECTOR-1: only the `inspector` mode has a real
 * payload today; the other modes are reserved so later slices can wire
 * them without rewiring callers.
 *
 * Pure local state — no Zustand store, no persistence. Each WorkflowBuilder
 * mount has its own instance. The hook does NOT subscribe to any slice;
 * the parent (WorkflowBuilder) is responsible for any sync to configSlice
 * / runSlice / etc. so this hook stays trivially testable and reusable.
 *
 * Callbacks are wrapped in `useCallback` so consumers can safely list
 * them in effect deps without triggering re-runs.
 */
export function useRightDrawer(): UseRightDrawerResult {
  const [mode, setMode] = useState<RightDrawerMode | null>(null);

  const openDrawer = useCallback((next: RightDrawerMode) => {
    setMode(next);
  }, []);

  const closeDrawer = useCallback(() => {
    setMode(null);
  }, []);

  const toggleDrawer = useCallback((next: RightDrawerMode) => {
    setMode((current) => (current === next ? null : next));
  }, []);

  return {
    mode,
    isOpen: mode !== null,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };
}

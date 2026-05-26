"use client";

import { useCallback, useState } from "react";

/**
 * Modes the builder right-drawer can mount today (BUILDER-INSPECTOR-1)
 * and in upcoming slices:
 *
 *   - `inspector`  → node configuration form (this slice).
 *   - `ai`         → BuilderAiPanel (BUILDER-AI-PANEL-1).
 *   - `results`    → RunResultsPanel (BUILDER-RUN-PANEL-1).
 *   - `validation` → ValidationSummary list (BUILDER-VALIDATION-1).
 *
 * Mutual exclusion is enforced by the hook: a single `mode` field, so
 * opening any mode closes whichever was previously open. This is the
 * "one right panel at a time" decision from
 * docs/slices/phase-4/builder-ui-v1-port-plan.md §4.
 */
export type RightDrawerMode = "inspector" | "ai" | "results" | "validation";

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

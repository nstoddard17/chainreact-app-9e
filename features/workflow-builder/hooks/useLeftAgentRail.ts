"use client";

import { useCallback, useState } from "react";

/**
 * Left-rail collapse/expand state (Slice 4.BUILDER-LEFT-AGENT-1).
 *
 * The React Agent left rail is the workflow-builder-scoped AI assistant
 * surface — visible by default on desktop, collapsible via the rail's own
 * ✕ or the header toggle. Collapsed state persists per-user across reloads
 * so a user who explicitly hid the rail doesn't see it return on every
 * navigation.
 *
 * Pure local state — no Zustand slice, no global broadcast. Each
 * WorkflowBuilder mount instantiates its own copy. Persistence reads /
 * writes localStorage on the same browser tab; cross-tab sync is out of
 * scope.
 *
 * SSR / test safety: `window` and `localStorage` access is guarded — the
 * hook resolves to "expanded" when storage is unavailable (private mode,
 * quota errors, jsdom without a window).
 */
const STORAGE_KEY = "chainreact:builder:leftAgentRail:collapsed";

export interface UseLeftAgentRailResult {
  /** True when the rail is currently collapsed (canvas should recover full width). */
  readonly isCollapsed: boolean;
  /** Force expand. */
  expand(): void;
  /** Force collapse. */
  collapse(): void;
  /** Flip between collapsed and expanded. */
  toggle(): void;
}

function readInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
  } catch {
    // localStorage may be unavailable (private mode, quota, etc.); the UI
    // state still works for the current session — we just don't persist.
  }
}

export function useLeftAgentRail(): UseLeftAgentRailResult {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(readInitialCollapsed);

  const collapse = useCallback(() => {
    setIsCollapsed(true);
    writeCollapsed(true);
  }, []);

  const expand = useCallback(() => {
    setIsCollapsed(false);
    writeCollapsed(false);
  }, []);

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  }, []);

  return { isCollapsed, expand, collapse, toggle };
}

/** Exposed for tests that need to clear persisted state between runs. */
export const __LEFT_AGENT_RAIL_STORAGE_KEY__ = STORAGE_KEY;

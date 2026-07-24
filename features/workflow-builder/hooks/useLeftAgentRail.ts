"use client";

import { useCallback, useRef, useState } from "react";
import type { BuilderViewMode } from "../document/documentViewPref";

/**
 * Left-rail collapse/expand state (Slice 4.BUILDER-LEFT-AGENT-1; builder-mode
 * aware since 5.DUAL-BUILDER-1 DOC-RAIL-LAYOUT-1).
 *
 * The React Agent left rail is the workflow-builder-scoped AI assistant
 * surface. Its collapse state is now tracked PER BUILDER VIEW:
 *
 *   - **Visual** — unchanged: visible by default on desktop, collapsible via
 *     the rail's own ✕ or the header toggle, persisted per-device in
 *     localStorage so a user who explicitly hid the rail doesn't see it
 *     return on every navigation.
 *   - **Document** — collapsed by default so the Document surface gets the
 *     full workspace (it carries its own Ask React bar; a permanently open
 *     rail would be a duplicate AI entry). An explicit open (Ask React /
 *     header toggle / spine) lasts until the user closes it or switches
 *     modes; EVERY entry into Document mode resets to collapsed.
 *     Session-only — deliberately NOT persisted (no second storage key),
 *     and Document-mode toggling never overwrites the persisted Visual
 *     preference.
 *
 * Pure local state — no Zustand slice, no global broadcast. Each
 * WorkflowBuilder mount instantiates its own copy. Persistence reads /
 * writes localStorage on the same browser tab; cross-tab sync is out of
 * scope.
 *
 * SSR / test safety: `window` and `localStorage` access is guarded — the
 * hook resolves to "expanded" (Visual) when storage is unavailable (private
 * mode, quota errors, jsdom without a window).
 */
const STORAGE_KEY = "chainreact:builder:leftAgentRail:collapsed";

export interface UseLeftAgentRailResult {
  /** True when the rail is currently collapsed (workspace should recover full width). */
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

export function useLeftAgentRail(
  view: BuilderViewMode = "visual",
): UseLeftAgentRailResult {
  const [visualCollapsed, setVisualCollapsed] = useState<boolean>(readInitialCollapsed);
  // Document rail starts collapsed (full-width Document is the default).
  const [documentCollapsed, setDocumentCollapsed] = useState<boolean>(true);

  // Re-collapse on every entry into Document mode (render-phase derived-state
  // adjustment, so the first Document frame never flashes an open rail). An
  // explicit open therefore lasts exactly until close or a mode switch.
  const [prevView, setPrevView] = useState<BuilderViewMode>(view);
  if (prevView !== view) {
    setPrevView(view);
    if (view === "document" && !documentCollapsed) setDocumentCollapsed(true);
  }

  // Callbacks stay referentially stable across view switches (consumers list
  // them in effect deps); the ref routes each call to the active view's state.
  const viewRef = useRef(view);
  viewRef.current = view;

  const collapse = useCallback(() => {
    if (viewRef.current === "document") {
      setDocumentCollapsed(true);
      return;
    }
    setVisualCollapsed(true);
    writeCollapsed(true);
  }, []);

  const expand = useCallback(() => {
    if (viewRef.current === "document") {
      setDocumentCollapsed(false);
      return;
    }
    setVisualCollapsed(false);
    writeCollapsed(false);
  }, []);

  const toggle = useCallback(() => {
    if (viewRef.current === "document") {
      setDocumentCollapsed((prev) => !prev);
      return;
    }
    setVisualCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  }, []);

  return {
    isCollapsed: view === "document" ? documentCollapsed : visualCollapsed,
    expand,
    collapse,
    toggle,
  };
}

/** Exposed for tests that need to clear persisted state between runs. */
export const __LEFT_AGENT_RAIL_STORAGE_KEY__ = STORAGE_KEY;

"use client";

import { useEffect } from "react";
import { undoWithConfigSync, redoWithConfigSync } from "../state/historyNav";

/**
 * BUILDER-TOPBAR-UNDO-REDO (keyboard) — builder-scoped undo/redo shortcuts.
 *
 * Mounted from WorkflowBuilder, so the listener only exists while the builder page is open (never
 * app-global). Each shortcut calls the SAME `historyNav` orchestrators as the toolbar Undo/Redo
 * buttons — so dirty/validation/canvas state and the open config-panel resync all behave identically,
 * with NO duplicated history logic. Pure-local: it never saves/activates/runs/tests/publishes, calls no
 * route/LLM, and doesn't touch run history or the React Agent transcript (it only restores graph
 * snapshots). No-ops automatically when a stack is empty (the orchestrators guard that).
 *
 * Shortcuts:
 *   - Ctrl+Z / Cmd+Z            → undo
 *   - Ctrl+Y                    → redo
 *   - Ctrl+Shift+Z / Cmd+Shift+Z → redo
 *
 * Editable-field safety: when focus is inside a text input / textarea / select / contenteditable /
 * combobox/textbox (node config fields, Agent-rail setup fields, the chat composer, code/text editors),
 * the shortcut is IGNORED so the field's NATIVE text undo/redo keeps working. The builder-level history
 * only fires from the canvas / builder chrome / other non-editing elements.
 */

/** True when the event target is (or sits inside) a field that owns native text undo/redo. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // Role-based editors / pickers (e.g. shadcn combobox, rich-text/code editors) that aren't a bare
  // input/textarea but still own their own undo.
  if (target.closest('[contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"]')) {
    return true;
  }
  return false;
}

export function useBuilderHistoryShortcuts(): void {
  useEffect(() => {
    function handler(event: KeyboardEvent): void {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.altKey) return;
      const key = event.key.toLowerCase();

      let action: "undo" | "redo" | null = null;
      if (key === "z") action = event.shiftKey ? "redo" : "undo"; // Z = undo; Shift+Z = redo
      else if (key === "y" && !event.shiftKey) action = "redo"; // Ctrl+Y = redo
      if (action === null) return;

      // Never steal Ctrl/Cmd+Z from an editable field — let its native undo/redo run.
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      if (action === "undo") undoWithConfigSync();
      else redoWithConfigSync();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
}

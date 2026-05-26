"use client";

import { useEffect } from "react";

interface Options {
  /**
   * Invoked when the user presses Cmd/Ctrl+S anywhere in the document while
   * the builder is mounted. The callback is responsible for guarding on
   * dirty / saving state — this hook never inspects slice state itself.
   * If omitted, the hook still cancels the browser default ("save page")
   * so users don't accidentally save the HTML.
   */
  onSave?: () => void;
}

/**
 * Builder-scoped keyboard shortcuts (Slice 4.BUILDER-UI-SHELL-1).
 *
 * Currently wires Cmd/Ctrl+S to a save callback and always cancels the
 * browser default. Plain key, no shift/alt — so Cmd+Shift+S, Ctrl+Alt+S
 * etc. fall through to the browser (matches V1's behavior).
 *
 * Future slices (BUILDER-INSPECTOR-1 onwards) may extend this hook with
 * drawer-close (Esc) and undo/redo (Cmd+Z, Cmd+Shift+Z) once the right
 * drawer + undo stack land.
 */
export function useBuilderShortcuts({ onSave }: Options): void {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      if (event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "s") return;
      event.preventDefault();
      onSave?.();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onSave]);
}

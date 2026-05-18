"use client";

import * as React from "react";
import { Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VariablePickerPopover } from "./VariablePickerPopover";
import type { VariableSource } from "../../hooks/useUpstreamVariables";

/**
 * Reusable picker trigger + popover combo.
 *
 * Slice 3.7 — TextField, TextareaField, and the RouterRoutesField
 * per-row text inputs all share the same picker affordance. Putting
 * the trigger + popover wiring in one component keeps the renderers
 * thin and prevents per-renderer popover-state drift.
 *
 * Behavior:
 *   - Hidden when `sources` is empty (no upstream variables to
 *     surface). Renders nothing — the parent input stays full width.
 *   - Click toggles the popover.
 *   - On insert: calls `onInsertAtCursor(token)`. The parent renderer
 *     handles cursor-position insertion against its own input ref;
 *     the picker doesn't know whether the target is `<input>` or
 *     `<textarea>`.
 *   - Closes on outside click (via a `mousedown` listener anchored
 *     to the picker root).
 *
 * What this DOES NOT do:
 *   - Pre-validate or format the inserted token — that's the picker's
 *     `formatReference` already-applied output, passed through verbatim.
 *   - Manage focus restoration to the input after close. Authors who
 *     want to keep typing tab back; the trigger button keeps focus
 *     after a click otherwise. Visual polish later.
 */

export interface VariablePickerButtonProps {
  sources: readonly VariableSource[];
  onInsertAtCursor: (token: string) => void;
  /** Optional accessible label override; defaults to "Insert variable". */
  ariaLabel?: string;
  /** Optional testid root, useful when multiple buttons live in the same row. */
  testIdRoot?: string;
}

export function VariablePickerButton({
  sources,
  onInsertAtCursor,
  ariaLabel = "Insert variable",
  testIdRoot = "variable-picker",
}: VariablePickerButtonProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Close on outside click. Anchored at the picker root so clicks
  // inside the popover (including expand/collapse) don't close.
  React.useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent): void {
      if (!rootRef.current) return;
      const target = e.target as Node | null;
      if (target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [open]);

  if (sources.length === 0) return null;

  function handleInsert(token: string): void {
    onInsertAtCursor(token);
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className="relative inline-block"
      data-testid={`${testIdRoot}-root`}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        data-testid={`${testIdRoot}-trigger`}
        className="h-8 w-8"
      >
        <Braces className="h-3.5 w-3.5" />
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-20">
          <VariablePickerPopover
            sources={sources}
            onInsert={handleInsert}
            onClose={() => setOpen(false)}
            testId={`${testIdRoot}-popover`}
          />
        </div>
      ) : null}
    </div>
  );
}

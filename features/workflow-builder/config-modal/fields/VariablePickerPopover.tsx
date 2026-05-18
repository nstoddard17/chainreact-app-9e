"use client";

import * as React from "react";
import { Braces, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OutputMeta } from "@/contracts/actionMeta";
import { formatReference } from "@/core/workflows/variableReferences";
import type { VariableSource } from "../../hooks/useUpstreamVariables";

/**
 * Variable picker popover — Slice 3.7.
 *
 * Plain HTML popover (not Radix). Reasons:
 *   - jsdom test friendliness — Radix Popover uses Portals which
 *     don't render cleanly in test mode. The picker is the
 *     highest-leverage author affordance shipping this slice, so
 *     reliable tests matter more than visual polish.
 *   - Single owner of open/close state — the parent renderer
 *     controls visibility through React state.
 *   - No popper / positioning library needed. The popover renders
 *     inline below the trigger; visual polish is a later iteration.
 *
 * Behavior:
 *   - Renders nothing when `sources` is empty (no upstream variables
 *     available; the parent renderer hides the trigger button too).
 *   - Click on an output button calls `onInsert(token)` with the
 *     canonical `{{sourceId.path}}` string. Parent renderer is
 *     responsible for cursor-position insertion.
 *   - Expands / collapses per source section. Trigger sources start
 *     expanded; action sources start collapsed (typical workflow has
 *     ~1 trigger + several actions and the trigger payload is the
 *     most common pick).
 *
 * What this DOES NOT do (out of scope):
 *   - Search across the tree (later iteration).
 *   - Per-output test-run preview (Slice 3.8).
 *   - Clipboard copy / drag (later iteration).
 *   - AI_FIELD picker UI (agent construct, not author-pickable).
 *   - File / FileRef sub-picking (deferred slice).
 */

export interface VariablePickerPopoverProps {
  sources: readonly VariableSource[];
  /** Called with the canonical `{{sourceId.path}}` token to insert. */
  onInsert: (token: string) => void;
  /** Called on Escape / outside click; parent toggles its own open state. */
  onClose: () => void;
  /** Optional id surfacing as `data-testid` for scoped queries. */
  testId?: string;
}

export function VariablePickerPopover({
  sources,
  onInsert,
  onClose,
  testId = "variable-picker-popover",
}: VariablePickerPopoverProps) {
  // Expand the first source by default — the trigger source surfaces
  // first when present, and it's the most-likely pick.
  const initialExpanded = React.useMemo(() => {
    const set = new Set<string>();
    if (sources[0]) set.add(sources[0].sourceId);
    return set;
  }, [sources]);

  const [expanded, setExpanded] = React.useState<Set<string>>(initialExpanded);

  // Close on Escape — wired at the popover root so focus inside
  // child buttons still propagates the key event.
  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  function toggle(sourceId: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  }

  if (sources.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-label="Variable picker"
      data-testid={testId}
      // tabIndex={-1} so the dialog can receive programmatic focus
      // for keyboard handlers; keeps Tab order intact.
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded border border-input bg-popover p-2 shadow-md"
    >
      {sources.map((source) => {
        const isOpen = expanded.has(source.sourceId);
        return (
          <section
            key={source.sourceId}
            aria-label={`Variable source ${source.sourceId}`}
            className="mb-1"
          >
            <button
              type="button"
              onClick={() => toggle(source.sourceId)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-muted"
            >
              <span className="flex items-center gap-1.5">
                {isOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <Braces className="h-3 w-3 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {source.displayName}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {source.sourceId}
              </span>
            </button>
            {isOpen ? (
              <OutputList
                outputs={source.outputs}
                sourceId={source.sourceId}
                onInsert={onInsert}
                depth={0}
              />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

interface OutputListProps {
  outputs: readonly OutputMeta[];
  sourceId: string;
  /** Path prefix accumulated through recursion; empty at depth 0. */
  pathPrefix?: string;
  depth: number;
  onInsert: (token: string) => void;
}

function OutputList({
  outputs,
  sourceId,
  pathPrefix = "",
  depth,
  onInsert,
}: OutputListProps) {
  return (
    <ul className="ml-3 mt-0.5 flex flex-col gap-0.5">
      {outputs.map((output) => {
        const fullPath = pathPrefix
          ? `${pathPrefix}.${output.name}`
          : output.name;
        const token = formatReference({ nodeId: sourceId, path: fullPath });
        const hasChildren = output.fields && output.fields.length > 0;
        return (
          <li
            key={output.name}
            className="flex flex-col gap-0.5"
            data-testid={`variable-output-${sourceId}-${fullPath}`}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onInsert(token)}
              className="h-auto justify-between gap-2 px-2 py-1"
              aria-label={`Insert ${token}`}
            >
              <span className="flex flex-col items-start">
                <span className="text-xs font-medium">{output.name}</span>
                {output.description ? (
                  <span className="text-[10px] leading-tight text-muted-foreground line-clamp-2">
                    {output.description}
                  </span>
                ) : null}
              </span>
              <span
                className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide text-muted-foreground"
                aria-label={`Type ${output.type}`}
              >
                {output.type}
              </span>
            </Button>
            {hasChildren ? (
              <OutputList
                outputs={output.fields!}
                sourceId={sourceId}
                pathPrefix={fullPath}
                depth={depth + 1}
                onInsert={onInsert}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

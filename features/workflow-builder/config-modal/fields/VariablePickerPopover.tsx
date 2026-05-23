"use client";

import * as React from "react";
import { Braces, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OutputMeta } from "@/contracts/actionMeta";
import { formatLatestValuePreview } from "@/core/workflows/formatLatestValuePreview";
import { resolveValueAtPath } from "@/core/workflows/resolveValueAtPath";
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
 *   - Clipboard copy / drag (later iteration).
 *   - AI_FIELD picker UI (agent construct, not author-pickable).
 *   - File / FileRef sub-picking (deferred slice).
 *
 * Slice 3.9 — inline latest-run previews:
 *   - The optional `latestValuesBySource` prop carries a record keyed
 *     by the picker's `sourceId` (`"trigger"` alias or action node id).
 *     Values are opaque blobs the engine persisted into
 *     `workflow_runs.steps[].output`.
 *   - Each output button looks up its value via the pure
 *     `resolveValueAtPath` helper and renders the
 *     `formatLatestValuePreview` output:
 *       - scalar → text badge (`"42"`, `true`, `null`, `"hello…"`)
 *       - object / array → compact type chip
 *       - absent → nothing rendered
 *   - The preview is DECORATIVE. Clicking the output still inserts
 *     the canonical `{{sourceId.path}}` token verbatim — never the
 *     preview text. (Rejecting V1's SimpleVariablePicker pattern
 *     where the preview WAS the click target.)
 *   - The picker does not start a run, fetch, poll, or save — the
 *     prop is the only data surface.
 */

export interface VariablePickerPopoverProps {
  sources: readonly VariableSource[];
  /** Called with the canonical `{{sourceId.path}}` token to insert. */
  onInsert: (token: string) => void;
  /** Called on Escape / outside click; parent toggles its own open state. */
  onClose: () => void;
  /** Optional id surfacing as `data-testid` for scoped queries. */
  testId?: string;
  /**
   * Slice 3.9 — optional latest-run output per source. Keyed by
   * `sourceId`. Absent keys render no preview (the picker stays
   * compact for sources that haven't run yet). The shape is opaque
   * — the picker uses `resolveValueAtPath` to walk per-output paths.
   */
  latestValuesBySource?: Readonly<Record<string, unknown>>;
}

const EMPTY_LATEST_VALUES: Readonly<Record<string, unknown>> = Object.freeze({});

export function VariablePickerPopover({
  sources,
  onInsert,
  onClose,
  testId = "variable-picker-popover",
  latestValuesBySource = EMPTY_LATEST_VALUES,
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
                latestValue={latestValuesBySource[source.sourceId]}
                latestValueAvailable={Object.prototype.hasOwnProperty.call(
                  latestValuesBySource,
                  source.sourceId,
                )}
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
  /**
   * Slice 3.9 — the root opaque value for the source (passed through
   * unchanged on recursive calls; each row walks its own `fullPath`
   * against it). Undefined means the source has no recorded run.
   */
  latestValue: unknown;
  /**
   * True when the source actually appears in `latestValuesBySource`.
   * Distinguishes "source has no run yet" (skip preview wiring) from
   * "source ran but a specific path is absent" (render absent).
   */
  latestValueAvailable: boolean;
}

function OutputList({
  outputs,
  sourceId,
  pathPrefix = "",
  depth,
  onInsert,
  latestValue,
  latestValueAvailable,
}: OutputListProps) {
  return (
    <ul className="ml-3 mt-0.5 flex flex-col gap-0.5">
      {outputs.map((output) => {
        const fullPath = pathPrefix
          ? `${pathPrefix}.${output.name}`
          : output.name;
        const token = formatReference({ nodeId: sourceId, path: fullPath });
        const hasChildren = output.fields && output.fields.length > 0;
        const isSensitive = output.sensitive === true;
        // Slice 3.SEC-7 — for sensitive outputs we (a) skip the
        // latest-run resolver entirely so the raw value never enters
        // React state, and (b) render a fixed "Sensitive value hidden"
        // placeholder so the author still sees the output exists. The
        // variable token stays insertable.
        const preview = isSensitive
          ? { kind: "sensitive" as const, preview: "Sensitive value hidden" }
          : latestValueAvailable
            ? formatLatestValuePreview(resolveValueAtPath(latestValue, fullPath))
            : { kind: "absent" as const, preview: "" };
        return (
          <li
            key={output.name}
            className="flex flex-col gap-0.5"
            data-testid={`variable-output-${sourceId}-${fullPath}`}
            data-sensitive={isSensitive ? "true" : undefined}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onInsert(token)}
              className="h-auto justify-between gap-2 px-2 py-1"
              aria-label={`Insert ${token}${isSensitive ? " (sensitive value — preview is masked)" : ""}`}
            >
              <span className="flex flex-col items-start min-w-0">
                <span className="text-xs font-medium">{output.name}</span>
                {output.description ? (
                  <span className="text-[10px] leading-tight text-muted-foreground line-clamp-2">
                    {output.description}
                  </span>
                ) : null}
                {preview.kind !== "absent" ? (
                  <span
                    className="mt-0.5 max-w-full truncate font-mono text-[10px] leading-tight text-muted-foreground"
                    data-testid={`variable-output-${sourceId}-${fullPath}-preview`}
                    data-preview-kind={preview.kind}
                    title={preview.preview}
                  >
                    {preview.preview}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-1">
                {isSensitive ? (
                  <span
                    className="rounded bg-amber-100 px-1 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                    data-testid={`variable-output-${sourceId}-${fullPath}-sensitive-chip`}
                    aria-label="Sensitive output"
                  >
                    Sensitive
                  </span>
                ) : null}
                <span
                  className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide text-muted-foreground"
                  aria-label={`Type ${output.type}`}
                >
                  {output.type}
                </span>
              </span>
            </Button>
            {hasChildren ? (
              <OutputList
                outputs={output.fields!}
                sourceId={sourceId}
                pathPrefix={fullPath}
                depth={depth + 1}
                onInsert={onInsert}
                latestValue={latestValue}
                latestValueAvailable={latestValueAvailable}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

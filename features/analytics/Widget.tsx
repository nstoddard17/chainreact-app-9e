"use client";

import { useState, type ReactNode } from "react";
import type { AnalyticsWidget, AnalyticsWidgetSize } from "@/contracts/analytics";
import { AnalyticsIcon } from "@/components/analytics/icons";
import { isPointerInCommitZone } from "./dashboardHelpers";

/**
 * Widget chrome (Slice ANALYTICS-1) — header (icon + title + range pill) plus the
 * edit-mode controls (drag handle, configure, resize, remove) wrapping a body.
 * Drag-reorder is HTML5 drag/drop; the parent owns the reorder + persistence.
 */

export const SIZE_GRID_CLASS: Record<AnalyticsWidgetSize, string> = {
  s: "col-span-1 row-span-1",
  m: "col-span-2 row-span-1",
  l: "col-span-2 row-span-2",
  xl: "col-span-3 row-span-1",
  w: "col-span-4 row-span-1",
  tall: "col-span-1 row-span-2",
};

const SIZE_OPTIONS: { id: AnalyticsWidgetSize; label: string }[] = [
  { id: "s", label: "1×1" },
  { id: "m", label: "2×1" },
  { id: "l", label: "2×2" },
  { id: "xl", label: "3×1" },
  { id: "w", label: "4×1" },
  { id: "tall", label: "1×2" },
];

/** Same labels, keyed — the drop preview names the footprint it is reserving. */
const SIZE_LABEL: Record<AnalyticsWidgetSize, string> = SIZE_OPTIONS.reduce(
  (acc, s) => ({ ...acc, [s.id]: s.label }),
  {} as Record<AnalyticsWidgetSize, string>,
);

export interface WidgetProps {
  widget: AnalyticsWidget;
  isEditing: boolean;
  isDragging: boolean;
  rangeLabel?: string;
  onResize: (id: string, size: AnalyticsWidgetSize) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onConfigure: (id: string) => void;
  /**
   * "over" fires continuously while a drag hovers this widget — the parent uses
   * it to preview the drop, so it must be cheap and idempotent.
   */
  onMove: (phase: "start" | "end" | "over" | "drop", id: string) => void;
  /**
   * Offered only when the widget currently has exportable data on screen
   * (CD-5A). Absent for widget types that have no per-widget export.
   */
  onExportCsv?: (id: string) => void;
  children: ReactNode;
}

export function Widget({
  widget,
  isEditing,
  isDragging,
  rangeLabel,
  onResize,
  onDuplicate,
  onRemove,
  onRename,
  onConfigure,
  onMove,
  onExportCsv,
  children,
}: WidgetProps) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(widget.title);

  const commitRename = () => {
    setRenaming(false);
    const next = title.trim();
    if (next.length > 0 && next !== widget.title) onRename(widget.id, next);
    else setTitle(widget.title);
  };

  // While this widget is the one being dragged it renders IN its previewed slot
  // as the drop target itself: the card keeps its real column/row span, so the
  // blue outline shows exactly where it will land and how much space it takes.
  const dimmed = isDragging ? " opacity-25" : "";

  return (
    <div
      data-testid={`analytics-widget-${widget.id}`}
      data-widget-id={widget.id}
      {...(isDragging ? { "data-drop-preview": "true" } : {})}
      className={
        "relative flex min-h-[190px] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/20 " +
        SIZE_GRID_CLASS[widget.size]
      }
      draggable={isEditing}
      onDragStart={() => onMove("start", widget.id)}
      onDragEnd={() => onMove("end", widget.id)}
      onDragOver={(e) => {
        if (!isEditing) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // Only claim this slot once the pointer has actually reached the middle
        // of the card. Reacting to the whole box makes the grid oscillate: the
        // re-order slides cards out from under the pointer, which immediately
        // re-triggers on whatever lands there next.
        if (isPointerInCommitZone(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)) {
          onMove("over", widget.id);
        }
      }}
      onDrop={(e) => {
        if (isEditing) {
          e.preventDefault();
          // The grid also listens, so releasing over a gap still commits. Don't
          // let this drop reach it as well.
          e.stopPropagation();
          onMove("drop", widget.id);
        }
      }}
    >
      {isDragging && (
        <div
          data-testid={`analytics-drop-preview-${widget.id}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10"
        >
          <span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[11px] font-semibold text-primary-foreground">
            {SIZE_LABEL[widget.size]}
          </span>
        </div>
      )}
      <div className={"flex items-center justify-between border-b border-border px-3.5 py-2.5" + dimmed}>
        <div className="flex min-w-0 items-center gap-2">
          {isEditing && (
            <span className="cursor-grab p-0.5 text-muted-foreground" title="Drag to move">
              <AnalyticsIcon name="Drag" size={12} />
            </span>
          )}
          {renaming ? (
            <input
              className="rounded-md border border-primary bg-muted px-1.5 py-0.5 text-sm font-semibold text-foreground outline-none"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setRenaming(false);
                  setTitle(widget.title);
                }
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-semibold text-foreground hover:bg-muted disabled:hover:bg-transparent"
              onClick={() => isEditing && setRenaming(true)}
              disabled={!isEditing}
            >
              {widget.icon && (
                <span className="text-primary">
                  <AnalyticsIcon name={widget.icon} size={12} />
                </span>
              )}
              <span className="truncate">{widget.title}</span>
            </button>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {rangeLabel && !isEditing && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {rangeLabel}
            </span>
          )}
          {/* Export is a READ action over data already on screen, so it is not
              gated on edit mode or the manage role — matching the dashboard's
              own Export button, which every member can already use (CD-5A). */}
          {onExportCsv && !isEditing && (
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/15 hover:text-primary"
              onClick={() => onExportCsv(widget.id)}
              title="Download this widget's data as CSV"
              aria-label={`Export CSV: ${widget.title}`}
            >
              <AnalyticsIcon name="Database" size={11} />
            </button>
          )}
          {isEditing && (
            <>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/15 hover:text-primary"
                onClick={() => onConfigure(widget.id)}
                title="Data source"
                aria-label="Configure widget"
              >
                <AnalyticsIcon name="Settings" size={11} />
              </button>
              <select
                className="rounded-md border border-border bg-muted px-1.5 py-1 font-mono text-[10.5px] text-foreground/80 outline-none"
                value={widget.size}
                onChange={(e) => onResize(widget.id, e.target.value as AnalyticsWidgetSize)}
                title="Resize"
                aria-label="Resize widget"
              >
                {SIZE_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/15 hover:text-primary"
                onClick={() => onDuplicate(widget.id)}
                title="Duplicate"
                aria-label="Duplicate widget"
              >
                <AnalyticsIcon name="Layers" size={11} />
              </button>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                onClick={() => onRemove(widget.id)}
                title="Remove"
                aria-label="Remove widget"
              >
                <AnalyticsIcon name="X" size={11} />
              </button>
            </>
          )}
        </div>
      </div>
      <div className={"min-h-0 flex-1 overflow-hidden p-4" + dimmed}>{children}</div>
    </div>
  );
}

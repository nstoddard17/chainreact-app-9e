"use client";

import { useState, type ReactNode } from "react";
import type { AnalyticsWidget, AnalyticsWidgetSize } from "@/contracts/analytics";
import { AnalyticsIcon } from "@/components/analytics/icons";

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
  onMove: (phase: "start" | "end" | "drop", id: string) => void;
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

  return (
    <div
      data-testid={`analytics-widget-${widget.id}`}
      className={
        "flex min-h-[190px] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/20 " +
        SIZE_GRID_CLASS[widget.size] +
        (isDragging ? " opacity-40" : "")
      }
      draggable={isEditing}
      onDragStart={() => onMove("start", widget.id)}
      onDragEnd={() => onMove("end", widget.id)}
      onDragOver={(e) => {
        if (isEditing) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => {
        if (isEditing) {
          e.preventDefault();
          onMove("drop", widget.id);
        }
      }}
    >
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
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
      <div className="min-h-0 flex-1 overflow-hidden p-4">{children}</div>
    </div>
  );
}

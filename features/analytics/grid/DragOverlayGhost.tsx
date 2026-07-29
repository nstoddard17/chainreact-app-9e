"use client";

import type { RefObject } from "react";
import { AnalyticsIcon } from "@/components/analytics/icons";
import type { DragOverlayState } from "./useExplicitDragSession";

/**
 * The floating card that follows the pointer
 * (extracted from the ordered drag session in S4, behaviour unchanged).
 *
 * Rendered OUTSIDE the grid and `position: fixed`, so its coordinate space is
 * the viewport. The grid deliberately applies no transform, perspective or
 * filter — any of those would make `fixed` resolve against the grid instead and
 * silently break the one formula this overlay has: `pointer − grabOffset`.
 *
 * Deliberately a lightweight ghost (chrome + title, muted body): re-mounting a
 * live widget body here would re-run its data fetching mid-drag. No transition —
 * the held card must track the pointer exactly.
 */
export function DragOverlayGhost({
  overlay,
  overlayRef,
}: {
  overlay: DragOverlayState;
  overlayRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={overlayRef}
      data-testid="analytics-drag-overlay"
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-50 flex flex-col overflow-hidden rounded-xl border border-primary bg-card opacity-90 shadow-2xl"
      style={{ width: overlay.width, height: overlay.height }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        {overlay.widget.icon && (
          <span className="text-primary">
            <AnalyticsIcon name={overlay.widget.icon} size={12} />
          </span>
        )}
        <span className="truncate text-sm font-semibold text-foreground">
          {overlay.widget.title}
        </span>
      </div>
      <div className="flex-1 bg-muted/40" />
    </div>
  );
}

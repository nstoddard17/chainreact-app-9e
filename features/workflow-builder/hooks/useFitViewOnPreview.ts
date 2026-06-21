"use client";

import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";

/**
 * Fit the canvas viewport ONCE each time a new AI preview is shown (HERMES-AGENT-PREVIEW-CANVAS-STATE-
 * AND-FIT). Navigation only — it reads nothing from / writes nothing to graph state, never mutates the
 * draft, and never saves/activates/runs.
 *
 * `previewToken` is a per-show counter owned by `WorkflowBuilder`: `null` when no preview is active, and
 * a NEW number each time "Show on canvas" surfaces a (possibly superseding) preview. The effect fits
 * only when the token CHANGES to a non-null value, so:
 *   - it fits once per newly-shown preview (a superseding preview gets a fresh token → re-fits);
 *   - it never re-fits on unrelated re-renders (same token → no-op);
 *   - discarding the preview (`null`) resets the latch so the next show fits again.
 *
 * The fit is deferred one tick so the layer/canvas has settled before fitting (avoids a janky
 * pre-layout fit). On an empty workflow there are no real React Flow nodes to frame — `fitView` is a
 * safe no-op there, and the holographic overlay is already screen-centered; the fit is meaningful for
 * additive previews over an EXISTING graph (it frames the current nodes the preview will extend).
 *
 * MUST be called inside a `ReactFlowProvider` (i.e. from `WorkflowCanvasInner`).
 */

const FIT_PADDING = 0.25;
const FIT_DURATION_MS = 300;

export function useFitViewOnPreview(previewToken: number | null): void {
  const { fitView } = useReactFlow();
  const lastToken = useRef<number | null>(null);

  useEffect(() => {
    if (previewToken === null) {
      // Preview cleared (discard / switch) — reset the latch so the next show fits again.
      lastToken.current = null;
      return;
    }
    if (previewToken === lastToken.current) return; // already fit for this show
    lastToken.current = previewToken;
    const id = setTimeout(() => {
      void fitView({ padding: FIT_PADDING, duration: FIT_DURATION_MS });
    }, 0);
    return () => clearTimeout(id);
  }, [previewToken, fitView]);
}

"use client";

import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useConfigSlice } from "../state/configSlice";

/**
 * Slice 4.AI-REPAIR-2F — canvas pan/zoom-to-node consumer.
 *
 * Subscribes to the configSlice canvas-focus signal (`canvasFocusNodeId` +
 * `canvasFocusSeq`) and, whenever the sequence advances (a "Go to field" /
 * reveal request), centers the React Flow viewport on that node. The `seq`
 * counter — not the bare node id — drives the effect so revealing the SAME node
 * twice re-pans.
 *
 * NAVIGATION ONLY: it reads node geometry and calls `setCenter`. It never
 * mutates graph state, config, or runs anything. Best-effort — if the node
 * isn't on the canvas (stale) it no-ops. MUST be called inside a
 * `ReactFlowProvider` (i.e. from `WorkflowCanvasInner`).
 */

// Slice 4.AI-CONFIG-ASSIST CS-4 — "reveal" ("Go to field") zooms CLOSE so the focused
// node is large and easy to inspect. 1.75 fills the viewport with the single node
// without the disorienting jump a tighter zoom (>2) would cause.
const REVEAL_ZOOM = 1.75;
const REVEAL_DURATION_MS = 450;

// BUILDER-CANVAS-FOCUS-SELECTED-NODE-1 / -TUNE-1 — opening a node's config rail should feel
// like a gentle zoom-IN toward the node, never a zoom-OUT.
//
// `CONFIG_MIN_ZOOM` is a FLOOR, not a forced level. We zoom UP to it when the canvas is more
// zoomed-out, but PRESERVE a higher current zoom — clicking a node the user has already zoomed
// into must not zoom away from it (the original flat `CONFIG_ZOOM = 1.2` did exactly that and
// read as "zooming out"). 1.4 is clearly closer than the default fit view while staying gentler
// than the close 1.75 reveal, so context around the node is preserved.
const CONFIG_MIN_ZOOM = 1.4;
const CONFIG_DURATION_MS = 300;

const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 120;

export function useCanvasNodeFocus(): void {
  const { setCenter, getNode, getViewport } = useReactFlow();
  const canvasFocusNodeId = useConfigSlice((s) => s.canvasFocusNodeId);
  const canvasFocusSeq = useConfigSlice((s) => s.canvasFocusSeq);
  const canvasFocusMode = useConfigSlice((s) => s.canvasFocusMode);
  const lastSeq = useRef(0);

  useEffect(() => {
    // Only act on a genuine advance — ignore the initial mount (seq 0) and any
    // re-render that didn't bump the counter. (Drag / connection-handle interactions
    // never bump the signal, so they never focus.)
    if (canvasFocusSeq === lastSeq.current) return;
    lastSeq.current = canvasFocusSeq;
    if (canvasFocusSeq === 0 || !canvasFocusNodeId) return;

    const node = getNode(canvasFocusNodeId);
    if (!node) return; // stale target / node not on canvas → no-op.

    /**
     * BUILDER-CANVAS-ZOOM-FOCUS-1 — center in the VISIBLE canvas, and wait for it to exist.
     *
     * `setCenter` centers within React Flow's own container, and both rails (the React Agent rail
     * and the config drawer) are non-overlapping flex columns — so that container IS the visible
     * canvas and the centering is automatically correct for any combination of open rails. Nothing
     * needs to know the rails' widths.
     *
     * Two things were breaking that. First, a deliberate 60px left bias, which by definition put
     * the node off-center. Second — and this is what made it look wrong when the config panel
     * opened — the focus signal and the panel mount in the SAME commit, so `setCenter` ran against
     * the container's PRE-shrink width and centered on a canvas region that no longer existed by
     * the time the animation played. Deferring past layout lets React Flow's resize observer take
     * the new width first; two frames because the first lands after the DOM mutation and the
     * second after the observer has reported.
     */
    const width = node.measured?.width ?? DEFAULT_NODE_WIDTH;
    const height = node.measured?.height ?? DEFAULT_NODE_HEIGHT;
    const isReveal = canvasFocusMode === "reveal";
    const duration = isReveal ? REVEAL_DURATION_MS : CONFIG_DURATION_MS;
    const targetX = node.position.x + width / 2;
    const targetY = node.position.y + height / 2;

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        // Read the zoom HERE, after layout: reveal forces its close inspect zoom, config-open
        // zooms IN to at least the config floor but never below the CURRENT zoom, so opening
        // config on an already-zoomed-in node pans toward it without zooming away.
        const zoom = isReveal ? REVEAL_ZOOM : Math.max(getViewport().zoom, CONFIG_MIN_ZOOM);
        setCenter(targetX, targetY, { zoom, duration });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [canvasFocusSeq, canvasFocusNodeId, canvasFocusMode, getNode, getViewport, setCenter]);
}

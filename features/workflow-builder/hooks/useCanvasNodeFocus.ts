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
// Small left bias so the node sits just left of the canvas-region center. The right config
// drawer is a NON-overlapping flex column (it does not cover the canvas), so the previous 220px
// "clear the panel" offset over-corrected and read as the node being pushed away. A gentle nudge
// is enough. Screen px, scaled by zoom so the on-screen shift stays stable.
const CONFIG_LEFT_OFFSET_SCREEN_PX = 60;

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

    const width = node.measured?.width ?? DEFAULT_NODE_WIDTH;
    const height = node.measured?.height ?? DEFAULT_NODE_HEIGHT;
    const isReveal = canvasFocusMode === "reveal";
    const duration = isReveal ? REVEAL_DURATION_MS : CONFIG_DURATION_MS;
    // Reveal forces its close inspect zoom. Config-open zooms IN to at least the config
    // floor but never below the CURRENT zoom — so opening config on an already-zoomed-in
    // node pans toward it without zooming away.
    const zoom = isReveal
      ? REVEAL_ZOOM
      : Math.max(getViewport().zoom, CONFIG_MIN_ZOOM);
    // Reveal stays centered; config-open applies a gentle left bias (the config drawer is a
    // separate column, not an overlay) so the node sits just left of the canvas center.
    const offsetX = isReveal ? 0 : CONFIG_LEFT_OFFSET_SCREEN_PX / zoom;
    setCenter(node.position.x + width / 2 + offsetX, node.position.y + height / 2, {
      zoom,
      duration,
    });
  }, [canvasFocusSeq, canvasFocusNodeId, canvasFocusMode, getNode, getViewport, setCenter]);
}

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

// BUILDER-CANVAS-FOCUS-SELECTED-NODE-1 — opening a node's config rail uses a gentler,
// context-preserving zoom (not an extreme close-up) and a short, smooth animation. The
// node is offset LEFT of viewport center (we center on a point to its right) so the
// right-side config panel doesn't cover it. The offset is in flow coordinates, scaled
// by zoom so the on-screen shift stays stable.
const CONFIG_ZOOM = 1.2;
const CONFIG_DURATION_MS = 300;
const CONFIG_LEFT_OFFSET_SCREEN_PX = 220;

const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 120;

export function useCanvasNodeFocus(): void {
  const { setCenter, getNode } = useReactFlow();
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
    const zoom = isReveal ? REVEAL_ZOOM : CONFIG_ZOOM;
    const duration = isReveal ? REVEAL_DURATION_MS : CONFIG_DURATION_MS;
    // Reveal stays centered; config-open shifts the node left of center so the config
    // panel doesn't hide it (centering on a point to the node's right).
    const offsetX = isReveal ? 0 : CONFIG_LEFT_OFFSET_SCREEN_PX / zoom;
    setCenter(node.position.x + width / 2 + offsetX, node.position.y + height / 2, {
      zoom,
      duration,
    });
  }, [canvasFocusSeq, canvasFocusNodeId, canvasFocusMode, getNode, setCenter]);
}

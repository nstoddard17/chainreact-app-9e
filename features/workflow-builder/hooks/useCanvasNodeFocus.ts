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

const FOCUS_ZOOM = 1.2;
const FOCUS_DURATION_MS = 400;
const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 120;

export function useCanvasNodeFocus(): void {
  const { setCenter, getNode } = useReactFlow();
  const canvasFocusNodeId = useConfigSlice((s) => s.canvasFocusNodeId);
  const canvasFocusSeq = useConfigSlice((s) => s.canvasFocusSeq);
  const lastSeq = useRef(0);

  useEffect(() => {
    // Only act on a genuine advance — ignore the initial mount (seq 0) and any
    // re-render that didn't bump the counter.
    if (canvasFocusSeq === lastSeq.current) return;
    lastSeq.current = canvasFocusSeq;
    if (canvasFocusSeq === 0 || !canvasFocusNodeId) return;

    const node = getNode(canvasFocusNodeId);
    if (!node) return; // stale target / node not on canvas → no-op.

    const width = node.measured?.width ?? DEFAULT_NODE_WIDTH;
    const height = node.measured?.height ?? DEFAULT_NODE_HEIGHT;
    setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      zoom: FOCUS_ZOOM,
      duration: FOCUS_DURATION_MS,
    });
  }, [canvasFocusSeq, canvasFocusNodeId, getNode, setCenter]);
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";
import {
  collectBuilderValidationIssues,
  type RequiredFieldsByType,
} from "../validation/collectBuilderValidationIssues";

export type BuilderInitialFocus = "setup" | "test" | "activate";

const HEADER_PULSE_MS = 2600;

/**
 * 5.ONBOARD-1 Batch 3 — one-shot `?focus=` deep-link handling for the builder.
 *
 * STRICTLY NAVIGATION-ONLY, by construction:
 *   - `setup` computes the FIRST incomplete node via the EXISTING validation
 *     collector (same rule as the header pill / validation drawer — never a
 *     parallel validator) and calls `configSlice.revealNode` — which opens the
 *     inspector + highlights the field and never writes a value, saves, runs,
 *     or activates.
 *   - `test` / `activate` only set a transient header pulse so the user's eye
 *     lands on the existing run/lifecycle controls. Nothing is clicked.
 *
 * One-shot guarantees:
 *   - a ref guard means re-renders/unrelated state updates never replay it;
 *   - the `focus` query param is CONSUMED via history.replaceState right after
 *     firing, so reload / back / forward re-entry does not re-fire either;
 *   - it reads graph state fresh from the store inside the effect (the mount
 *     hydrate effect has already run synchronously by then), so it neither
 *     waits on nor fights hydration, and never moves the canvas again after
 *     the single reveal.
 */
export function useInitialBuilderFocus(input: {
  focus: BuilderInitialFocus | undefined;
  workflowId: string;
  requiredFieldsByType?: RequiredFieldsByType;
  /** Disabled in local-only (anonymous) mode — no deep-link entry exists there. */
  enabled?: boolean;
}): "test" | "activate" | null {
  const { focus, workflowId, requiredFieldsByType, enabled = true } = input;
  const revealNode = useConfigSlice((s) => s.revealNode);
  const firedRef = useRef(false);
  const [pulse, setPulse] = useState<"test" | "activate" | null>(null);

  useEffect(() => {
    if (!focus || !enabled || firedRef.current) return;
    firedRef.current = true;

    // Consume the param immediately so back/forward/reload never replays.
    try {
      window.history.replaceState(null, "", `/workflows/${workflowId}`);
    } catch {
      /* history unavailable (tests/SSR edge) — the ref guard still holds */
    }

    if (focus === "setup") {
      const { pendingNodes, pendingEdges } = useGraphSlice.getState();
      const issues = collectBuilderValidationIssues({
        pendingNodes,
        pendingEdges,
        requiredFieldsByType,
      });
      const target = issues.find((i) => i.nodeId !== undefined);
      if (target?.nodeId) {
        const node = pendingNodes.find((n) => n.id === target.nodeId);
        if (node) {
          revealNode({
            nodeId: target.nodeId,
            initialValues: node.config ?? {},
            ...(target.fieldName ? { fieldKey: target.fieldName } : {}),
          });
        }
      }
      return;
    }

    // test / activate — transient attention pulse on the header controls.
    setPulse(focus);
    const timer = setTimeout(() => setPulse(null), HEADER_PULSE_MS);
    return () => clearTimeout(timer);
  }, [focus, enabled, workflowId, requiredFieldsByType, revealNode]);

  return pulse;
}

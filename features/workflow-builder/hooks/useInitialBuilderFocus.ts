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

    // Applied on a deferred tick rather than inline. The builder resets
    // configSlice in an effect cleanup keyed on the workflow id; under React's
    // dev double-invoke (and any remount) that cleanup runs AFTER this effect's
    // first pass and would wipe a reveal made inline, while the one-shot ref
    // would block the second pass from re-applying it — the config panel then
    // never opens. Scheduling here means the cancelled first pass leaves no
    // mark (the ref is set inside the callback) and the surviving pass applies
    // the reveal once the mount cycle has settled.
    const apply = setTimeout(() => {
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
    }, 0);
    return () => clearTimeout(apply);
  }, [focus, enabled, workflowId, requiredFieldsByType, revealNode]);

  // Auto-clear in its own effect keyed on `pulse` — same reasoning as
  // features/apps/useProviderHighlight: a timer created inside the ref-guarded
  // one-shot effect gets cleared by that effect's cleanup on a re-run while the
  // guard blocks a replacement, so the pulse would never turn off.
  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulse(null), HEADER_PULSE_MS);
    return () => clearTimeout(timer);
  }, [pulse]);

  return pulse;
}

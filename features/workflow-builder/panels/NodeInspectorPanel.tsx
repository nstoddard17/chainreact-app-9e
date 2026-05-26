"use client";

import { ConfigModalShell } from "../config-modal/ConfigModalShell";

/**
 * Inspector payload for the builder right drawer (Slice 4.BUILDER-INSPECTOR-1).
 *
 * Thin wrapper around the existing `ConfigModalShell`. The shell itself
 * stays untouched — its schema-driven form, validation, Save / Cancel,
 * and metadata-lookup logic continue exactly as before. The drawer
 * provides the surrounding chrome (title, close button, Esc-to-close)
 * while this panel handles the "what to render when no node is active"
 * empty branch.
 *
 * Why a separate file rather than mounting ConfigModalShell directly
 * inside the drawer:
 *   - Lets later slices add inspector-specific affordances (e.g. tab
 *     strip for Setup / Advanced / Results) here without expanding
 *     ConfigModalShell or BuilderRightDrawer.
 *   - Keeps "no active node" copy decoupled from the shell, which
 *     today returns `null` in that case — fine when mounted inline,
 *     awkward when mounted inside an always-visible drawer.
 *
 * Note: WorkflowBuilder gates whether to mount the drawer at all based
 * on `configSlice.activeNodeId`. The empty fallback below only fires in
 * the rare race-condition window where the drawer is opening / closing
 * at the same moment activeNodeId is flipping.
 */
export function NodeInspectorPanel() {
  return (
    <div data-testid="node-inspector-panel" className="flex flex-col">
      <ConfigModalShell />
    </div>
  );
}

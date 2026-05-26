"use client";

import type { ReactNode } from "react";

interface Props {
  /**
   * Collapsed-state flag. When true, the rail renders a slim placeholder
   * (no content) so the header toggle still has a return target and the
   * canvas recovers its full width.
   */
  isCollapsed: boolean;
  /**
   * Called when the user dismisses the rail via the in-rail × button.
   * The parent (`WorkflowBuilder`) owns the actual collapse state via
   * `useLeftAgentRail`; this is a pure callback for the rail header.
   */
  onCollapse: () => void;
  /**
   * Rail payload — the `BuilderAiPanel` in production. Kept as a slot so
   * the wrapper itself stays free of AI-service logic and tests can
   * substitute a placeholder.
   */
  children: ReactNode;
}

/**
 * Builder left rail container (Slice 4.BUILDER-LEFT-AGENT-1).
 *
 * Hosts the workflow-builder-scoped React Agent (BuilderAiPanel). Width
 * matches V1's `--agent-pane-width: 420px` on md+ screens; full width
 * below md (the responsive sheet treatment is owned by BUILDER-
 * RESPONSIVE-1). Renders chrome only — header label "React Agent" and a
 * collapse × button — no state, no AI behavior, no backend calls.
 *
 * Scope guardrail: this rail is **workflow-builder scoped**. It MUST NOT
 * mount the general app-level help assistant. If a general help surface
 * is ever added, it lives outside the builder shell. See port plan §0 /
 * §4 / §10.
 *
 * Collapsed model: when `isCollapsed === true` the component returns
 * `null` rather than a slim placeholder strip. The 4-zone BuilderShell
 * row simply omits the left column in that case and the canvas grows
 * to fill it. This matches the V1 left-pane behavior (collapsed = gone).
 */
export function BuilderLeftAgentRail({
  isCollapsed,
  onCollapse,
  children,
}: Props) {
  if (isCollapsed) return null;
  return (
    <aside
      data-testid="builder-left-agent-rail"
      role="complementary"
      aria-label="React Agent"
      className="flex w-full flex-col gap-0 rounded-lg border border-input bg-card shadow-sm md:w-[420px] md:shrink-0"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="truncate text-sm font-semibold">React Agent</h2>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse React Agent"
          data-testid="builder-left-agent-rail-collapse"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          ×
        </button>
      </header>
      <div className="flex flex-1 flex-col overflow-y-auto p-3">{children}</div>
    </aside>
  );
}

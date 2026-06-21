"use client";

import type { ReactNode } from "react";

interface Props {
  header: ReactNode;
  /**
   * Optional full-width notice rendered directly under the header, above the
   * workspace row (Slice 4.TEAM-WORKFLOWS-6 / TW-3b — the active-account
   * mismatch banner). Non-blocking; renders nothing when absent.
   */
  banner?: ReactNode;
  /**
   * Workflow-builder-scoped left rail — the React Agent (BuilderGuidanceRail).
   * Optional so the shell stays usable from tests that only exercise the
   * header / content split. Slice 4.BUILDER-LEFT-AGENT-1.
   */
  leftRail?: ReactNode;
  /**
   * Node-contextual right drawer — Inspector / Run results / Validation
   * summary. Mutually exclusive across modes (see `useRightDrawer`).
   * Optional for the same reason as `leftRail`.
   */
  rightDrawer?: ReactNode;
  children: ReactNode;
}

/**
 * Builder shell foundation (Slice 4.BUILDER-UI-SHELL-1, extended in
 * Slice 4.BUILDER-LEFT-AGENT-1, restyled in 4.BUILDER-DESIGN-PARITY-1).
 *
 * Composes the four-zone builder layout:
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  header                                                        │
 *   ├──────────────┬──────────────────────────────┬──────────────────┤
 *   │              │                              │                  │
 *   │  leftRail    │  children (canvas + rest)    │  rightDrawer     │
 *   │              │                              │                  │
 *   └──────────────┴──────────────────────────────┴──────────────────┘
 *
 * Design-parity restyle: panels sit edge-to-edge with vertical 1px
 * dividers between them (matches the Anthropic design's dense /
 * technical feel). The previous `p-3 gap-3` padded layout is gone —
 * background and dividers carry the visual separation instead.
 */
export function BuilderShell({
  header,
  banner,
  leftRail,
  rightDrawer,
  children,
}: Props) {
  return (
    <section
      aria-label="Workflow builder shell"
      data-testid="builder-shell"
      className="flex h-full flex-col overflow-hidden"
      style={{
        background: "var(--builder-bg)",
        color: "var(--builder-text)",
      }}
    >
      {header}
      {banner}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row md:items-stretch"
        data-testid="builder-workspace-row"
      >
        {leftRail}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
        {rightDrawer}
      </div>
    </section>
  );
}

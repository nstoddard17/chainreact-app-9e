"use client";

import type { ReactNode } from "react";

interface Props {
  header: ReactNode;
  /**
   * Workflow-builder-scoped left rail — the React Agent (BuilderAiPanel).
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
 * Slice 4.BUILDER-LEFT-AGENT-1).
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
 * The shell is intentionally provider-agnostic and behaviorless: it
 * composes regions, nothing else. All state, fetching, and dispatch
 * live in the slices and panels it hosts.
 *
 * - `leftRail` and `rightDrawer` are optional so the shell stays
 *   reusable from focused unit tests and so SHELL-1's two-zone tests
 *   (header + content only) keep working unchanged.
 * - On md+ screens the three columns sit side-by-side; below md they
 *   stack vertically (responsive sheet treatment for the drawer is
 *   owned by BUILDER-RESPONSIVE-1).
 * - **The shell does not own a state machine.** Whether the left rail
 *   is collapsed or which drawer mode is active is decided by the
 *   parent (`WorkflowBuilder`); when collapsed / closed, the parent
 *   simply passes `null` to the slot and the shell omits the column.
 */
export function BuilderShell({
  header,
  leftRail,
  rightDrawer,
  children,
}: Props) {
  return (
    <section
      aria-label="Workflow builder shell"
      className="flex flex-col gap-4"
    >
      {header}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {leftRail}
        <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
        {rightDrawer}
      </div>
    </section>
  );
}

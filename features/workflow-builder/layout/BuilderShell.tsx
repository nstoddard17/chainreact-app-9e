"use client";

import type { ReactNode } from "react";

interface Props {
  header: ReactNode;
  children: ReactNode;
}

/**
 * Builder shell foundation (Slice 4.BUILDER-UI-SHELL-1).
 *
 * Lays out a compact header strip above the main builder content. The
 * three-zone target layout (header / canvas / right drawer) from the
 * accepted port plan lands across the BUILDER-CANVAS-1 + BUILDER-INSPECTOR-1
 * slices — this shell only owns the header / content split for now.
 *
 * The shell is intentionally provider-agnostic and behaviorless: it composes
 * regions, nothing else. All state, fetching, and dispatch live in the
 * slices and panels it hosts.
 */
export function BuilderShell({ header, children }: Props) {
  return (
    <section
      aria-label="Workflow builder shell"
      className="flex flex-col gap-4"
    >
      {header}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

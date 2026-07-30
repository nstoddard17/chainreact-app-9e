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
  /**
   * BUILDER-RESPONSIVE-LAYOUT-1 — set when a secondary surface is currently
   * presented as an OVERLAY SHEET over the canvas rather than as an in-flow
   * column. The shell's only job here is the scrim: it dims the canvas so the
   * sheet reads as floating rather than as a broken column, and clicking it
   * dismisses. Absent (the wide desktop layout) ⇒ no scrim node is rendered at
   * all and the DOM is unchanged from before the slice.
   */
  overlay?: {
    active: boolean;
    onDismiss: () => void;
    /** Names the surface the scrim belongs to (diagnostics / tests). */
    label: string;
  };
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
 *
 * BUILDER-RESPONSIVE-LAYOUT-1 — two structural changes, both inert on a wide
 * desktop:
 *
 *   1. The workspace row is `relative` and is ALWAYS a row. It used to be
 *      `flex-col md:flex-row`, which meant that below 768px the rail and the
 *      config column stacked ABOVE and BELOW the canvas — so on a phone the
 *      canvas was pushed out of the clipped (`overflow-hidden`) row and the
 *      user could not reach it at all. Narrow widths now present those surfaces
 *      as sheets instead of stacking them, so the row stays a row at every
 *      width. `relative` is what those sheets position against: they are
 *      absolutely positioned inside the WORKSPACE, which is what keeps the
 *      header and banner visible and reachable above an open sheet.
 *
 *   2. The centre column is the only flexible track. The rail and drawer are
 *      `shrink-0` when in-flow and out of flow entirely when overlaid, so the
 *      canvas receives all remaining width by construction rather than by
 *      negotiation.
 *
 * The shell does NOT decide presentation. It receives already-presented
 * children plus an `overlay` descriptor; the policy lives in
 * `builderLayoutPolicy.ts` and its resolution in `useBuilderLayout`.
 */
export function BuilderShell({
  header,
  banner,
  leftRail,
  rightDrawer,
  overlay,
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
        className="relative flex min-h-0 flex-1 flex-row items-stretch overflow-hidden"
        data-testid="builder-workspace-row"
      >
        {leftRail}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
        {rightDrawer}
        {overlay?.active ? (
          /*
            The scrim. It is `aria-hidden` and not tabbable on purpose: keyboard
            and screen-reader users dismiss via Escape or the sheet's own close
            control, so announcing a full-canvas dimmer would be pure noise. It
            still has to be a real click target, because "click outside to
            dismiss" is what makes a sheet read as a sheet.
          */
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            data-testid="builder-overlay-scrim"
            data-overlay-label={overlay.label}
            onClick={overlay.onDismiss}
            className="absolute inset-0 z-30 cursor-default"
            style={{ background: "color-mix(in oklab, #000 38%, transparent)" }}
          />
        ) : null}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { SurfacePresentation } from "./builderLayoutPolicy";
import { useBuilderOverlaySurface } from "./useBuilderOverlaySurface";

interface Props {
  title: string;
  onClose: () => void;
  /**
   * BUILDER-RESPONSIVE-LAYOUT-1 — how the configuration surface is presented at
   * the current width. `panel` (the default, and the wide desktop layout) is the
   * in-flow 380px column it has always been. `overlay` is a full-height sheet
   * over the canvas, used below 1280px.
   *
   * Config goes to a sheet one tier EARLIER than the agent rail on purpose. A
   * 320px rail plus a 380px config column at 1024px leaves the canvas about
   * 320px — narrower than one node card, which is precisely the "undersized
   * canvas" failure this slice exists to fix. As a sheet it costs the canvas
   * nothing.
   *
   * Defaults to `panel` so existing callers and isolated tests are unchanged.
   */
  presentation?: SurfacePresentation;
  children: ReactNode;
}

/**
 * Builder right drawer (Slice 4.BUILDER-INSPECTOR-1, restyled in
 * 4.BUILDER-DESIGN-PARITY-1).
 *
 * Anthropic ChainV2 inspector chrome — left border divider, dense
 * header strip (title + close × button), scrollable content region.
 * The previous shadcn-card framing (rounded box w/ shadow) is gone;
 * the drawer now sits edge-to-edge against the canvas with a single
 * vertical 1px divider — the design's "right dock" look.
 *
 * Width: 380px as an in-flow column; a viewport-capped sheet as an overlay.
 * Mode-specific payload (NodeInspectorPanel / RunResultsPanel /
 * ValidationSummary) is passed in as children.
 *
 * BUILDER-RESPONSIVE-LAYOUT-1 — there is still ONE `<section>` and ONE payload
 * container; `presentation` switches className and positioning only. That
 * matters for unsaved work: the in-progress field edits live in `configSlice`
 * (`pending*`), and the surface itself never remounts across a presentation
 * change, so resizing the window while half-way through configuring a Slack
 * message cannot drop the draft. The previous `w-full below md` behaviour is
 * gone — below 768px this used to become a full-width block stacked BELOW the
 * canvas in the old column workspace row, i.e. off-screen.
 */
export function BuilderRightDrawer({
  title,
  onClose,
  presentation = "panel",
  children,
}: Props) {
  const isOverlay = presentation === "overlay";
  const drawerRef = useRef<HTMLElement | null>(null);

  // Focus in / trap / restore for sheet presentation. Escape is deliberately
  // NOT delegated here: the document-level binding below already covers BOTH
  // presentations and predates this slice, and two Escape handlers calling the
  // same `onClose` is a bug waiting to happen.
  useBuilderOverlaySurface({ active: isOverlay, containerRef: drawerRef });

  // Esc closes the drawer. Bind on document so the listener fires even
  // when focus is inside a nested form field.
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <section
      ref={drawerRef}
      data-testid="builder-right-drawer"
      data-presentation={presentation}
      /*
        A sheet over a scrimmed canvas is a modal dialog and is announced as
        one; an in-flow column beside the canvas stays the region it always was.
      */
      {...(isOverlay
        ? { role: "dialog" as const, "aria-modal": true as const }
        : { role: "region" as const })}
      aria-label={`Workflow builder drawer: ${title}`}
      className={
        isOverlay
          ? /*
              Positioned inside the workspace row (not the viewport) so the
              builder header stays visible above it, and capped against the
              viewport so some canvas is always still showing behind the scrim —
              the user can see what the sheet is covering.
            */
            "absolute inset-y-0 right-0 z-40 flex w-[min(24rem,92vw)] flex-col"
          : "flex w-[380px] shrink-0 flex-col"
      }
      style={{
        background: "var(--builder-panel)",
        borderLeft: "1px solid var(--builder-border)",
        minHeight: 0,
        ...(isOverlay
          ? { boxShadow: "var(--builder-shadow-lg, 0 10px 40px rgba(0,0,0,0.45))" }
          : {}),
      }}
    >
      {/* BUILDER-VALIDATION-PANEL-CLOSE-UX — `relative z-30` establishes a stacking
          context for the header so its close × always paints ABOVE any header-
          originated floating callout (e.g. HeaderRunControls' `z-10` private-
          credential status, which hangs `top-full right-0` over this drawer's top-
          right corner). Without it, that callout could cover the only dismiss
          control. The button below also carries always-visible chrome so it reads
          as a real, reachable close affordance (not a bare muted glyph). */}
      <header
        data-testid="builder-right-drawer-header"
        className="relative z-30 flex items-center justify-between gap-3 px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--builder-border)" }}
      >
        <h2
          className="truncate text-[13px] font-semibold"
          title={title}
          style={{ color: "var(--builder-text)" }}
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          title="Close (Esc)"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border text-[15px] leading-none transition-colors"
          style={{
            color: "var(--builder-text)",
            background: "var(--builder-panel-2)",
            borderColor: "var(--builder-border)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--builder-bg)";
            e.currentTarget.style.color = "var(--builder-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--builder-panel-2)";
            e.currentTarget.style.color = "var(--builder-text)";
          }}
        >
          ×
        </button>
      </header>
      <div
        className="flex flex-1 flex-col overflow-y-auto"
        style={{ minHeight: 0 }}
      >
        {children}
      </div>
    </section>
  );
}

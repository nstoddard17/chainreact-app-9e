"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  /**
   * Drawer title shown in the header. Each mode supplies its own
   * (e.g. "Node configuration" for the inspector, "Workflow AI" for the
   * AI panel later).
   */
  title: string;
  /**
   * Called when the user dismisses the drawer via the × button or the
   * Esc keyboard shortcut. The parent decides what "close" means for
   * the current mode (e.g. inspector close also drops the active node
   * selection in configSlice).
   */
  onClose: () => void;
  /**
   * The drawer payload. WorkflowBuilder picks which panel based on the
   * current `useRightDrawer` mode and renders it as children.
   */
  children: ReactNode;
}

/**
 * Builder right drawer (Slice 4.BUILDER-INSPECTOR-1).
 *
 * Presentational region for the right-side drawer. Renders chrome only
 * — header (title + close), Esc-to-close, and a scrollable content
 * region. The mode-specific payload (NodeInspectorPanel today, AI /
 * Run results / Validation in later slices) is passed in as children.
 *
 * Why a separate component rather than rendering chrome inside each
 * panel: keeps each future panel focused on its own UX while the
 * drawer chrome stays consistent across modes.
 *
 * Mounting model:
 *   - WorkflowBuilder mounts this conditionally (only when the drawer
 *     is open) — there's no `open` prop on this component. Conditional
 *     mount keeps initial render cheap and makes the Esc-to-close
 *     contract trivial (the listener is only attached when the drawer
 *     is visible).
 *   - The container width is fixed at 420px on md+ screens to match the
 *     port plan §6 "right drawer width: 420px default". Below md, the
 *     drawer takes full width; responsive sheet treatment is owned by
 *     BUILDER-RESPONSIVE-1.
 */
export function BuilderRightDrawer({ title, onClose, children }: Props) {
  const headerRef = useRef<HTMLDivElement | null>(null);

  // Esc closes the drawer. Mirrors V1 / Linear / Notion drawer UX. We
  // bind on document so the listener fires even when focus is inside a
  // nested form field (ConfigModalShell text inputs etc.).
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Don't steal Esc from native dialogs / popovers / autocomplete
      // menus the user might be inside. defaultPrevented signals one of
      // those layers already handled the key.
      if (event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    // Intentionally `role="region"` rather than `complementary` because
    // the inspector payload (ConfigModalShell) is itself a `complementary`
    // landmark with its own aria-label ("Node configuration"). Two nested
    // complementaries with the same accessible name would break
    // `getByRole("complementary", ...)` lookups in existing tests.
    <section
      data-testid="builder-right-drawer"
      role="region"
      aria-label={`Workflow builder drawer: ${title}`}
      className="flex w-full flex-col gap-0 rounded-lg border border-input bg-card shadow-sm md:w-[420px] md:shrink-0"
    >
      <header
        ref={headerRef}
        className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"
      >
        <h2 className="truncate text-sm font-semibold" title={title}>
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          ×
        </button>
      </header>
      <div className="flex flex-1 flex-col overflow-y-auto p-3">{children}</div>
    </section>
  );
}

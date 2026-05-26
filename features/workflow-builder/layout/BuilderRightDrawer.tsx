"use client";

import { useEffect, type ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
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
 * Width: 380px md+ (matches design's 380px), full-width below md.
 * Mode-specific payload (NodeInspectorPanel / RunResultsPanel /
 * ValidationSummary) is passed in as children.
 */
export function BuilderRightDrawer({ title, onClose, children }: Props) {
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
      data-testid="builder-right-drawer"
      role="region"
      aria-label={`Workflow builder drawer: ${title}`}
      className="flex w-full shrink-0 flex-col md:w-[380px]"
      style={{
        background: "var(--builder-panel)",
        borderLeft: "1px solid var(--builder-border)",
        minHeight: 0,
      }}
    >
      <header
        className="flex items-center justify-between gap-3 px-3 py-2.5"
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
          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[4px] text-[14px] transition-colors"
          style={{ color: "var(--builder-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--builder-bg)";
            e.currentTarget.style.color = "var(--builder-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--builder-muted)";
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

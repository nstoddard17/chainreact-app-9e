"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useBuilderOverlaySurface } from "./useBuilderOverlaySurface";

/**
 * The builder header's overflow control (BUILDER-RESPONSIVE-LAYOUT-1).
 *
 * Below 1280px the header cannot show every action inline without squeezing
 * buttons until they clip — which is exactly what it used to do: the header's
 * right-hand grid track had no `min-width: 0`, so the action cluster forced the
 * row wider than the viewport and Save / Activate were cut off by the shell's
 * `overflow-hidden`. Rather than shrink text until it is unreadable, the
 * lower-priority controls move in here.
 *
 * WHY THIS IS A GROUPED PANEL AND NOT `role="menu"`. A menu's children must be
 * `menuitem`s, and one of the things that moves in here is the run cluster —
 * a component with its own busy states and a confirmation modal. Declaring
 * `role="menu"` and then filling it with non-menuitems would be a lie to
 * assistive technology. So the trigger declares `aria-haspopup`/`aria-expanded`
 * and the panel is an honestly-labelled group of ordinary controls.
 *
 * Keyboard behaviour is not reimplemented here: it reuses the same
 * `useBuilderOverlaySurface` hook the rail and config sheets use, so focus
 * moves in on open, Tab stays inside, Escape closes, and focus returns to the
 * trigger — one implementation, three surfaces.
 */
export function BuilderHeaderOverflowMenu({
  children,
  label = "More workflow actions",
}: {
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useBuilderOverlaySurface({
    active: open,
    containerRef: panelRef,
    onEscape: open ? close : undefined,
  });

  // Dismiss on a pointer press outside the panel and outside the trigger.
  // `pointerdown` rather than `click` so the panel closes before the underlying
  // control receives the press — otherwise a tap on the canvas would both close
  // the menu and select a node.
  useEffect(() => {
    if (!open) return;
    function handler(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={label}
        data-testid="builder-header-overflow-trigger"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[12px]"
        style={{
          background: "var(--builder-panel-2)",
          color: "var(--builder-text-2)",
          border: "1px solid var(--builder-border)",
        }}
      >
        <EllipsisIcon />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={label}
          data-testid="builder-header-overflow-panel"
          className="absolute right-0 top-full z-50 mt-1 flex w-[248px] flex-col gap-2 rounded-md p-2 shadow-xl"
          style={{
            background: "var(--builder-panel)",
            border: "1px solid var(--builder-border)",
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A labelled row inside the overflow panel. Controls that were self-explanatory
 * next to each other in a wide toolbar need naming once they're stacked in a
 * list, so each group carries its own caption.
 */
export function BuilderOverflowGroup({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="builder-mono px-0.5 text-[10px] uppercase tracking-[0.12em]"
        style={{ color: "var(--builder-muted)" }}
      >
        {caption}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

const EllipsisIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
  >
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

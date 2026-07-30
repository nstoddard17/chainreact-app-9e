"use client";

import { useRef, useState, type ReactNode } from "react";
import type { SurfacePresentation } from "./builderLayoutPolicy";
import { useBuilderOverlaySurface } from "./useBuilderOverlaySurface";

interface Props {
  /**
   * Collapsed-state flag. When true, the rail renders a 40px vertical
   * spine with a rotated "REACT AGENT" label and an expand button —
   * matching the Anthropic design's collapsed rail (4.BUILDER-DESIGN-PARITY-1).
   * Previous SHELL-1 behavior (return null) is preserved via the
   * `onExpand` callback: the rail still surfaces a target for the
   * header toggle while staying compact.
   */
  isCollapsed: boolean;
  /**
   * Toggles the rail's collapsed state. Fired by the in-rail collapse
   * button (expanded mode) AND the spine expand button (collapsed mode) —
   * the two buttons request opposite outcomes, so the parent must pass a
   * TOGGLE here, not a one-way `collapse`. (Wiring it to `collapse` is what
   * made a collapsed rail impossible to re-open.) The parent
   * (`WorkflowBuilder`) owns the actual state via `useLeftAgentRail`.
   */
  onToggle: () => void;
  /**
   * HERMES-AGENT-BUILDER-RAIL-CHAT-AVAILABLE — whether builder AI guidance is actually available
   * (Hermes enabled AND an account is resolved — the SAME signal the rail body uses to render the chat
   * vs. the "unavailable" note). The header status line reflects this so it can never claim
   * "connected" while the body shows "unavailable". Defaults to false (honest when omitted). The
   * runtime/provider name (Hermes) is internal and deliberately NOT shown in this user-facing status.
   */
  connected?: boolean;
  /**
   * BUILDER-RESPONSIVE-LAYOUT-1 — how the rail is presented at the current
   * width. `panel` (the default, and everything ≥ 900px) is the in-flow column
   * this rail has always been. `overlay` is a full-height sheet floating over
   * the canvas, used below 900px where a 320px column and a usable canvas
   * cannot both exist.
   *
   * Defaults to `panel` so every existing caller and isolated test keeps the
   * pre-slice layout without passing anything.
   */
  presentation?: SurfacePresentation;
  /**
   * Expanded in-flow width in pixels (`panel` only). 320 on wide screens; the
   * medium tier passes a tighter value so the canvas keeps priority. Ignored in
   * `overlay` presentation, where the sheet sizes itself against the viewport.
   */
  panelWidth?: number;
  /**
   * Rail payload — the `BuilderGuidanceRail` in production. Kept as a slot so
   * the wrapper itself stays free of AI-service logic and tests can
   * substitute a placeholder.
   */
  children: ReactNode;
}

/**
 * Builder left rail container (Slice 4.BUILDER-LEFT-AGENT-1, restyled
 * in 4.BUILDER-DESIGN-PARITY-1, keep-alive in DOC-RAIL-LAYOUT-1).
 *
 * Hosts the workflow-builder-scoped React Agent (BuilderGuidanceRail) inside
 * the dense Anthropic ChainV2 chat frame: gradient sparkle logo, name +
 * connected status line, in-rail icon buttons (new conversation /
 * history / collapse), then the payload region.
 *
 * Width: 320px expanded (matches the design's `.rail` width), 40px
 * collapsed (vertical spine). The previous 420px width is intentionally
 * tighter here — the design optimizes for a denser middle canvas at
 * 1280-wide laptops; the rail still has room for the chat composer
 * (which renders inside `BuilderGuidanceRail`).
 *
 * DOC-RAIL-LAYOUT-1 — mount lifecycle: the payload never mounts until the
 * rail is first expanded (a rail nobody opened fires no chat effects /
 * network — Document mode now STARTS collapsed, so this matters more, not
 * less). After the first expansion, collapsing only HIDES the payload
 * (display:none at a stable tree position) instead of unmounting it, so the
 * composer text and conversation transcript survive close → reopen. There is
 * still exactly ONE panel instance; both states render ONE `aside` with the
 * payload container at the same child index, which is what lets React keep
 * the subtree alive across the toggle.
 *
 * Scope guardrail: workflow-builder-scoped only. MUST NOT mount the
 * general app-level assistant. (See port plan §0 / §4 / §10.)
 *
 * BUILDER-RESPONSIVE-LAYOUT-1 — the rail gained a `presentation` mode, and the
 * important part is what did NOT change: there is still exactly ONE `<aside>`
 * and the payload container is still at the SAME child index in every state.
 * Presentation switches className and position only, so React reconciles the
 * subtree rather than remounting it — which is what guarantees that going from
 * a desktop column to a phone sheet (or back) preserves the transcript, the
 * composer draft, and every bit of React Agent state. Nothing about the
 * conversation is duplicated per layout.
 *
 * The `md:` breakpoint prefixes are gone. They were the bug: below 768px the
 * collapsed rail was `hidden` with no spine and the expanded rail was `w-full`,
 * stacked above the canvas by the old `flex-col` workspace row. Width is now
 * decided by the resolved layout mode (one hook, one policy) instead of by
 * utility classes in this file guessing at it.
 */
export function BuilderLeftAgentRail({
  isCollapsed,
  onToggle,
  connected = false,
  presentation = "panel",
  panelWidth = 320,
  children,
}: Props) {
  const [hasEverExpanded, setHasEverExpanded] = useState(!isCollapsed);
  if (!isCollapsed && !hasEverExpanded) setHasEverExpanded(true);

  const isOverlay = presentation === "overlay";
  const isOpenOverlay = isOverlay && !isCollapsed;
  const railRef = useRef<HTMLElement | null>(null);

  // Focus in / trap / restore, plus Escape-to-close — but only while this rail
  // is genuinely an open sheet. In panel presentation the hook is inert, so a
  // desktop rail never traps focus or swallows Escape.
  useBuilderOverlaySurface({
    active: isOpenOverlay,
    containerRef: railRef,
    onEscape: isOpenOverlay ? onToggle : undefined,
  });

  return (
    <aside
      ref={railRef}
      data-testid="builder-left-agent-rail"
      data-collapsed={isCollapsed ? "true" : "false"}
      data-presentation={presentation}
      /*
        An open sheet sits over the canvas behind a scrim, so it IS a modal
        dialog and should be announced as one. An in-flow column is not — it is
        a complementary region beside the canvas, as it always was.
      */
      {...(isOpenOverlay
        ? { role: "dialog" as const, "aria-modal": true as const }
        : { role: "complementary" as const })}
      aria-label={isCollapsed ? "React Agent (collapsed)" : "React Agent"}
      className={
        isOverlay
          ? /*
              Sheet: absolutely positioned inside the workspace row (NOT the
              viewport), so the builder header stays visible and usable above
              it. Capped against the viewport so a 390px phone still shows a
              sliver of canvas — the user can always see what the sheet is
              covering. Collapsed, it stays mounted but `display:none`, which is
              what preserves the conversation with zero canvas cost.
            */
            `absolute inset-y-0 left-0 z-40 w-[min(20rem,88vw)] flex-col ${
              isCollapsed ? "hidden" : "flex"
            }`
          : "flex shrink-0 flex-col"
      }
      {...(isOverlay && isCollapsed ? { hidden: true, "aria-hidden": true as const } : {})}
      style={{
        ...(isOverlay ? {} : { width: isCollapsed ? 40 : panelWidth }),
        background: "var(--builder-panel)",
        borderRight: "1px solid var(--builder-border)",
        minHeight: 0,
        ...(isOpenOverlay ? { boxShadow: "var(--builder-shadow-lg, 0 10px 40px rgba(0,0,0,0.45))" } : {}),
      }}
    >
      {isCollapsed && !isOverlay ? (
        /*
          The ENTIRE spine is the expand affordance — a tiny icon-only target
          (the old 12px sparkle with no background) was easy to miss and the
          "REACT AGENT" label wasn't clickable. Clicking anywhere on the spine
          now re-opens the rail, with a hover highlight so it reads as a button.
        */
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand React Agent"
          data-testid="builder-left-agent-rail-expand"
          title="Open React Agent"
          className="builder-rail-spine group flex h-full w-full flex-col items-center gap-2 py-2.5"
          style={{ color: "var(--builder-muted)" }}
        >
          <span
            aria-hidden
            className="inline-flex h-6 w-6 items-center justify-center rounded-[4px]"
            style={{
              background:
                "linear-gradient(135deg, var(--builder-accent), color-mix(in oklab, var(--builder-accent) 50%, #a855f7))",
              color: "#fff",
            }}
          >
            <SparkleIcon />
          </span>
          <span
            className="builder-mono flex flex-1 items-center justify-center text-[10px] tracking-[0.18em]"
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
            }}
          >
            REACT&nbsp;AGENT
          </span>
          <span aria-hidden className="mt-auto opacity-60 transition group-hover:opacity-100">
            <ChevronRightIcon />
          </span>
        </button>
      ) : (
        <header
          className="flex items-center justify-between gap-3 px-2.5 py-2.5"
          style={{ borderBottom: "1px solid var(--builder-border)" }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] text-white"
              style={{
                background:
                  "linear-gradient(135deg, var(--builder-accent), color-mix(in oklab, var(--builder-accent) 50%, #a855f7))",
              }}
            >
              <SparkleIcon />
            </span>
            <div className="min-w-0">
              <div
                className="truncate text-[13px] font-semibold"
                style={{ color: "var(--builder-text)" }}
              >
                React Agent
              </div>
              <div
                data-testid="builder-left-agent-rail-status"
                data-connected={connected ? "true" : "false"}
                className="builder-mono mt-0.5 flex items-center gap-1.5 text-[10.5px]"
                style={{ color: "var(--builder-muted)" }}
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={
                    connected
                      ? {
                          background: "var(--builder-success)",
                          boxShadow: "0 0 0 2px var(--builder-success-soft)",
                        }
                      : { background: "var(--builder-muted)" }
                  }
                />
                {connected ? "connected" : "not connected"}
              </div>
            </div>
          </div>
          {/*
            One control, two honest labels. As a column it collapses to the
            spine; as a sheet there is no spine to collapse to, so it closes.
            Naming it "Collapse" in sheet mode would describe something the UI
            can't do — the same honesty rule the option-recovery contract
            applies to error copy.
          */}
          <button
            type="button"
            onClick={onToggle}
            aria-label={isOverlay ? "Close React Agent" : "Collapse React Agent"}
            title={isOverlay ? "Close (Esc)" : "Hide assistant"}
            data-testid="builder-left-agent-rail-collapse"
            className={
              isOverlay
                ? "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border text-[15px] leading-none"
                : "rounded p-1"
            }
            style={
              isOverlay
                ? {
                    color: "var(--builder-text)",
                    background: "var(--builder-panel-2)",
                    borderColor: "var(--builder-border)",
                  }
                : { color: "var(--builder-muted)" }
            }
          >
            {isOverlay ? "×" : <ChevronLeftIcon />}
          </button>
        </header>
      )}
      {/*
        AI-21B — the rail container previously owned the scroll
        (`overflow-y-auto`). That collapsed the chat layout because the
        whole rail scrolled together; messages and composer had no way to
        split. We now hand scroll ownership down to `BuilderGuidanceRail` so it
        can run a `flex-1 overflow-y-auto` message list with a pinned
        composer footer underneath. The rail keeps `min-h-0` so the inner
        flex child can shrink as needed.

        DOC-RAIL-LAYOUT-1 — this payload container renders in BOTH states at
        the SAME child index (keep-alive): expanded it is the visible chat
        region; collapsed it is `hidden` (display:none + hidden attribute +
        aria-hidden) with the children still mounted once they ever were.
      */}
      <div
        className={
          isCollapsed
            ? "hidden"
            : "flex min-h-0 flex-1 flex-col overflow-hidden px-2 py-2"
        }
        {...(isCollapsed ? { hidden: true, "aria-hidden": true as const } : {})}
        data-testid="builder-left-agent-rail-payload"
        style={{ background: "var(--builder-panel)" }}
      >
        {hasEverExpanded ? children : null}
      </div>
      {isCollapsed && !isOverlay ? (
        <style>{`
          .builder-rail-spine { transition: background 0.12s ease; }
          .builder-rail-spine:hover { background: var(--builder-panel-2); }
        `}</style>
      ) : null}
    </aside>
  );
}

const SparkleIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
    <path d="M19 14l.7 1.9L21.5 17l-1.9.7L19 19.5l-.7-1.9L16.5 17l1.9-.7z" />
  </svg>
);
const ChevronLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const ChevronRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

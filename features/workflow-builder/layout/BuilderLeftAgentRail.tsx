"use client";

import { useState, type ReactNode } from "react";

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
 */
export function BuilderLeftAgentRail({
  isCollapsed,
  onToggle,
  connected = false,
  children,
}: Props) {
  const [hasEverExpanded, setHasEverExpanded] = useState(!isCollapsed);
  if (!isCollapsed && !hasEverExpanded) setHasEverExpanded(true);

  return (
    <aside
      data-testid="builder-left-agent-rail"
      data-collapsed={isCollapsed ? "true" : "false"}
      role="complementary"
      aria-label={isCollapsed ? "React Agent (collapsed)" : "React Agent"}
      className={
        isCollapsed
          ? "hidden shrink-0 md:flex md:flex-col"
          : "flex w-full shrink-0 flex-col md:w-[320px]"
      }
      style={{
        ...(isCollapsed ? { width: 40 } : {}),
        background: "var(--builder-panel)",
        borderRight: "1px solid var(--builder-border)",
        minHeight: 0,
      }}
    >
      {isCollapsed ? (
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
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse React Agent"
            data-testid="builder-left-agent-rail-collapse"
            className="rounded p-1"
            style={{ color: "var(--builder-muted)" }}
          >
            <ChevronLeftIcon />
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
      {isCollapsed ? (
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

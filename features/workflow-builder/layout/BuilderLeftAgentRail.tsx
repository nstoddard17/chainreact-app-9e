"use client";

import type { ReactNode } from "react";

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
   * Called when the user dismisses the rail via the in-rail × button
   * (expanded mode) or the spine button (collapsed mode). The parent
   * (`WorkflowBuilder`) owns the actual collapse state via
   * `useLeftAgentRail`; this is a pure callback for the rail header.
   */
  onCollapse: () => void;
  /**
   * Rail payload — the `BuilderAiPanel` in production. Kept as a slot so
   * the wrapper itself stays free of AI-service logic and tests can
   * substitute a placeholder.
   */
  children: ReactNode;
}

/**
 * Builder left rail container (Slice 4.BUILDER-LEFT-AGENT-1, restyled
 * in 4.BUILDER-DESIGN-PARITY-1).
 *
 * Hosts the workflow-builder-scoped React Agent (BuilderAiPanel) inside
 * the dense Anthropic ChainV2 chat frame: gradient sparkle logo, name +
 * connected status line, in-rail icon buttons (new conversation /
 * history / collapse), then the payload region.
 *
 * Width: 320px expanded (matches the design's `.rail` width), 40px
 * collapsed (vertical spine). The previous 420px width is intentionally
 * tighter here — the design optimizes for a denser middle canvas at
 * 1280-wide laptops; the rail still has room for the chat composer
 * (which renders inside `BuilderAiPanel`).
 *
 * Scope guardrail: workflow-builder-scoped only. MUST NOT mount the
 * general app-level assistant. (See port plan §0 / §4 / §10.)
 */
export function BuilderLeftAgentRail({
  isCollapsed,
  onCollapse,
  children,
}: Props) {
  if (isCollapsed) {
    return (
      <aside
        data-testid="builder-left-agent-rail"
        data-collapsed="true"
        role="complementary"
        aria-label="React Agent (collapsed)"
        className="hidden shrink-0 flex-col items-center gap-2 py-2 md:flex"
        style={{
          width: 40,
          background: "var(--builder-panel)",
          borderRight: "1px solid var(--builder-border)",
        }}
      >
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Expand React Agent"
          data-testid="builder-left-agent-rail-expand"
          className="inline-flex h-6 w-6 items-center justify-center rounded-[4px]"
          style={{ color: "var(--builder-text-2)" }}
          title="Open React Agent"
        >
          <SparkleIcon />
        </button>
        <div className="flex flex-1 items-center justify-center">
          <span
            className="builder-mono text-[10px] tracking-[0.18em]"
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              color: "var(--builder-muted)",
            }}
          >
            REACT&nbsp;AGENT
          </span>
        </div>
      </aside>
    );
  }
  return (
    <aside
      data-testid="builder-left-agent-rail"
      data-collapsed="false"
      role="complementary"
      aria-label="React Agent"
      className="flex w-full shrink-0 flex-col md:w-[320px]"
      style={{
        background: "var(--builder-panel)",
        borderRight: "1px solid var(--builder-border)",
        minHeight: 0,
      }}
    >
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
              className="builder-mono mt-0.5 flex items-center gap-1.5 text-[10.5px]"
              style={{ color: "var(--builder-muted)" }}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: "var(--builder-success)",
                  boxShadow: "0 0 0 2px var(--builder-success-soft)",
                }}
              />
              connected · claude
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse React Agent"
          data-testid="builder-left-agent-rail-collapse"
          className="rounded p-1"
          style={{ color: "var(--builder-muted)" }}
        >
          <ChevronLeftIcon />
        </button>
      </header>
      {/*
        AI-21B — the rail container previously owned the scroll
        (`overflow-y-auto`). That collapsed the chat layout because the
        whole rail scrolled together; messages and composer had no way to
        split. We now hand scroll ownership down to `BuilderAiPanel` so it
        can run a `flex-1 overflow-y-auto` message list with a pinned
        composer footer underneath. The rail keeps `min-h-0` so the inner
        flex child can shrink as needed.
      */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 py-2"
        style={{ background: "var(--builder-panel)" }}
      >
        {children}
      </div>
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

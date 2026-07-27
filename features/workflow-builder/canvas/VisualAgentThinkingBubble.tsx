"use client";

/**
 * REACT-AGENT-VISUAL-THINKING-BUBBLE-1 — small canvas "React is thinking…" bubble.
 *
 * Purely presentational feedback while a React Agent guidance request is in flight in VISUAL mode.
 * The single source of truth is the conversation hook's `loading` flag (passed in as `isThinking`)
 * — the SAME request that may internally run the server-side repair, so the bubble never flickers
 * between the initial attempt and the repair. This component owns NO request logic: no API calls,
 * no timeout logic, no response inspection, no billing state.
 *
 * Behavior contract:
 *   - Anti-flicker: the bubble becomes visible only after `SHOW_DELAY_MS` of continuous thinking,
 *     so a fast response never flashes it. Hiding is IMMEDIATE (no minimum visible duration).
 *   - Non-interactive: the wrapper is `pointer-events-none` — it can never block panning, zooming,
 *     node dragging, or any canvas control. It is not a workflow node and is never persisted.
 *   - Anchor: absolute bottom-left of the canvas workspace, offset right of the React Flow zoom
 *     controls (`left-16`), on the React Agent rail's side. Clear of the review tray (top-left),
 *     the preview control bar (top-center), and the minimap (bottom-right).
 *   - Accessibility: a PERSISTENT `role="status"` live region announces one fixed sentence when
 *     thinking becomes visible and clears when it ends. The visual bubble (including the animated
 *     dots) is `aria-hidden`, so screen readers hear one announcement — never animation frames.
 *   - Motion: dot animation is defined in globals.css inside a
 *     `@media (prefers-reduced-motion: no-preference)` block — reduced-motion users get a static
 *     bubble with static dots (same information, no movement).
 */

import { useEffect, useState } from "react";

/** Delay before the bubble shows — fast responses resolve inside it and never flash. */
export const THINKING_BUBBLE_SHOW_DELAY_MS = 200;

/** The one fixed sentence the live region announces. Never rotated, never animated. */
export const THINKING_BUBBLE_STATUS_LABEL = "React Agent is preparing a response.";

/** Same sparkle mark the agent rail uses (its local-copy idiom — see BuilderLeftAgentRail). */
const SparkleIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
    <path d="M19 14l.7 1.9L21.5 17l-1.9.7L19 19.5l-.7-1.9L16.5 17l1.9-.7z" />
  </svg>
);

export interface VisualAgentThinkingBubbleProps {
  /** True while the current React Agent guidance request is awaiting its result. */
  readonly isThinking: boolean;
}

export function VisualAgentThinkingBubble({ isThinking }: VisualAgentThinkingBubbleProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isThinking) {
      setVisible(false); // hide immediately — no artificial minimum duration
      return;
    }
    const timer = setTimeout(() => setVisible(true), THINKING_BUBBLE_SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isThinking]);

  return (
    <>
      {/* Persistent live region (mounted whether or not the bubble shows) so the announcement is
          reliable; content is one fixed sentence, set once per thinking episode. */}
      <span role="status" aria-live="polite" className="sr-only" data-testid="visual-agent-thinking-status">
        {visible ? THINKING_BUBBLE_STATUS_LABEL : ""}
      </span>
      {visible ? (
        <div
          className="pointer-events-none absolute bottom-3 left-16 z-30 crv2-thinking-enter"
          data-testid="visual-agent-thinking-bubble"
          aria-hidden="true"
        >
          <div
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium shadow-sm"
            style={{
              background: "var(--builder-panel)",
              borderColor: "var(--builder-border)",
              color: "var(--builder-text-2)",
              boxShadow: "var(--builder-shadow-sm)",
            }}
          >
            <span style={{ color: "var(--builder-accent)" }}>
              <SparkleIcon />
            </span>
            React is thinking
            <span className="crv2-thinking-dots" data-testid="visual-agent-thinking-dots">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}

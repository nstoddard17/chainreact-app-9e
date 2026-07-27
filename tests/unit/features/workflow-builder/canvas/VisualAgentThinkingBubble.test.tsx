/**
 * REACT-AGENT-VISUAL-THINKING-BUBBLE-1 — presentational contract of the canvas thinking bubble.
 *
 * Pure component tests (no builder, no network): visibility lifecycle with the anti-flicker delay,
 * immediate hide, non-interactivity (pointer-events-none), and the accessibility contract (one
 * fixed live-region sentence; animated dots hidden from screen readers; motion scoped to
 * prefers-reduced-motion: no-preference in globals.css).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import {
  VisualAgentThinkingBubble,
  THINKING_BUBBLE_SHOW_DELAY_MS,
  THINKING_BUBBLE_STATUS_LABEL,
} from "@/features/workflow-builder/canvas/VisualAgentThinkingBubble";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

describe("VisualAgentThinkingBubble — visibility lifecycle", () => {
  it("(#1) hidden when idle", () => {
    render(<VisualAgentThinkingBubble isThinking={false} />);
    expect(screen.queryByTestId("visual-agent-thinking-bubble")).toBeNull();
  });

  it("(#2) appears after the anti-flicker delay while thinking", () => {
    render(<VisualAgentThinkingBubble isThinking />);
    expect(screen.queryByTestId("visual-agent-thinking-bubble")).toBeNull(); // not yet
    advance(THINKING_BUBBLE_SHOW_DELAY_MS);
    expect(screen.getByTestId("visual-agent-thinking-bubble")).toBeInTheDocument();
    expect(screen.getByTestId("visual-agent-thinking-bubble")).toHaveTextContent("React is thinking");
  });

  it("(#4–#8 component contract) disappears IMMEDIATELY when thinking ends — no minimum duration", () => {
    const { rerender } = render(<VisualAgentThinkingBubble isThinking />);
    advance(THINKING_BUBBLE_SHOW_DELAY_MS);
    expect(screen.getByTestId("visual-agent-thinking-bubble")).toBeInTheDocument();
    rerender(<VisualAgentThinkingBubble isThinking={false} />);
    // No timer advance needed: the hide is synchronous with the state change.
    expect(screen.queryByTestId("visual-agent-thinking-bubble")).toBeNull();
  });

  it("(#10) a fast response inside the delay window never flashes the bubble", () => {
    const { rerender } = render(<VisualAgentThinkingBubble isThinking />);
    advance(THINKING_BUBBLE_SHOW_DELAY_MS - 50);
    rerender(<VisualAgentThinkingBubble isThinking={false} />);
    advance(1_000);
    expect(screen.queryByTestId("visual-agent-thinking-bubble")).toBeNull();
    // And the live region never announced anything for the aborted episode.
    expect(screen.getByTestId("visual-agent-thinking-status")).toHaveTextContent("");
  });

  it("(#3 continuity) stays visible across a long single request — the repair is the SAME request", () => {
    // The hook keeps `loading` true through the server-side repair; as long as the prop stays true
    // the bubble never unmounts/remounts, so there is nothing to flicker.
    render(<VisualAgentThinkingBubble isThinking />);
    advance(THINKING_BUBBLE_SHOW_DELAY_MS);
    advance(30_000); // well past an initial attempt + repair
    expect(screen.getByTestId("visual-agent-thinking-bubble")).toBeInTheDocument();
  });
});

describe("VisualAgentThinkingBubble — interaction + accessibility", () => {
  it("(#11) never intercepts pointer events (wrapper is pointer-events-none, absolute overlay)", () => {
    render(<VisualAgentThinkingBubble isThinking />);
    advance(THINKING_BUBBLE_SHOW_DELAY_MS);
    const bubble = screen.getByTestId("visual-agent-thinking-bubble");
    expect(bubble.className).toContain("pointer-events-none");
    expect(bubble.className).toContain("absolute");
  });

  it("(#14) announces ONE fixed sentence via a persistent status region; dots are aria-hidden", () => {
    const { rerender } = render(<VisualAgentThinkingBubble isThinking={false} />);
    // The live region exists BEFORE anything happens (reliable announcement), empty while idle.
    const status = screen.getByTestId("visual-agent-thinking-status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("");

    rerender(<VisualAgentThinkingBubble isThinking />);
    advance(THINKING_BUBBLE_SHOW_DELAY_MS);
    expect(status).toHaveTextContent(THINKING_BUBBLE_STATUS_LABEL);
    // The whole visual bubble (text + animated dots) is hidden from screen readers — the dots can
    // never be re-announced frame by frame.
    expect(screen.getByTestId("visual-agent-thinking-bubble")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("visual-agent-thinking-dots").querySelectorAll("span")).toHaveLength(3);

    rerender(<VisualAgentThinkingBubble isThinking={false} />);
    expect(status).toHaveTextContent("");
  });

  it("(#13) all motion is scoped to prefers-reduced-motion: no-preference in globals.css", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    // The animation classes/keyframes exist ONLY inside a no-preference media block: strip every
    // no-preference block and assert no crv2-thinking animation remains outside one.
    expect(css).toContain("crv2-thinking-dot");
    const outsideMotionBlocks = css
      .split(/@media \(prefers-reduced-motion: no-preference\) \{/)
      .map((chunk, i) => {
        if (i === 0) return chunk;
        // Drop the balanced media block body (ends at the matching closing brace at depth 0).
        let depth = 1;
        let idx = 0;
        while (idx < chunk.length && depth > 0) {
          if (chunk[idx] === "{") depth += 1;
          if (chunk[idx] === "}") depth -= 1;
          idx += 1;
        }
        return chunk.slice(idx);
      })
      .join("");
    expect(outsideMotionBlocks).not.toContain("animation: crv2-thinking");
    expect(outsideMotionBlocks).not.toContain("@keyframes crv2-thinking");
    // The static dot styling (information, not motion) is available to everyone.
    expect(outsideMotionBlocks).toContain(".crv2-thinking-dots > span");
  });

  it("(#12) is presentational only — no graph, API, or store imports", () => {
    const src = readFileSync(
      resolve(process.cwd(), "features/workflow-builder/canvas/VisualAgentThinkingBubble.tsx"),
      "utf8",
    );
    for (const forbidden of ["@xyflow/react", "lib/api", "graphSlice", "configSlice", "fetch(", "useGuidanceConversation"]) {
      expect(src).not.toContain(forbidden);
    }
  });
});

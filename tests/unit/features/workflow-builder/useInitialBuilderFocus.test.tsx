/**
 * 5.ONBOARD-1 Batch 3 — `?focus=` builder deep-link hook, against the REAL
 * graph/config slices (the same stores the builder mounts).
 *
 * Contract under test:
 *   - setup: reveals the FIRST incomplete node + field via the existing
 *     validation rule (revealNode → activeNodeId + focusFieldKey), exactly once
 *   - test/activate: transient pulse value, auto-clearing
 *   - one-shot: re-renders never re-fire; the query param is consumed
 *   - navigation-only: the graph is never mutated, nothing saved/run/activated
 */
import { act, render } from "@testing-library/react";
import {
  useInitialBuilderFocus,
  type BuilderInitialFocus,
} from "@/features/workflow-builder/hooks/useInitialBuilderFocus";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { RequiredFieldsByType } from "@/features/workflow-builder/validation/collectBuilderValidationIssues";

const REQUIRED: RequiredFieldsByType = {
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    requiredFields: [
      { name: "channel", label: "Channel", hasDefault: false },
      { name: "text", label: "Message", hasDefault: false },
    ],
  },
};

const DEFINITION = {
  nodes: [
    {
      id: "trigger-1",
      kind: "trigger" as const,
      provider: "native",
      type: "manual.run",
      config: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "action-1",
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
      config: {},
      position: { x: 0, y: 120 },
    },
  ],
  edges: [{ id: "e1", from: "trigger-1", to: "action-1" }],
};

let lastPulse: BuilderInitialFocus | null = null;
function Harness({
  focus,
  enabled = true,
}: {
  focus: BuilderInitialFocus | undefined;
  enabled?: boolean;
}) {
  lastPulse = useInitialBuilderFocus({
    focus,
    workflowId: "wf-1",
    requiredFieldsByType: REQUIRED,
    enabled,
  });
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice
    .getState()
    .hydrate("wf-1", DEFINITION, "2026-07-18T00:00:00Z");
  window.history.replaceState(null, "", "/workflows/wf-1?focus=setup");
  lastPulse = null;
});

afterEach(() => {
  jest.useRealTimers();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("useInitialBuilderFocus — setup", () => {
  it("reveals the first incomplete node + field via the existing validation rule", () => {
    render(<Harness focus="setup" />);
    const cfg = useConfigSlice.getState();
    expect(cfg.activeNodeId).toBe("action-1");
    expect(cfg.focusFieldKey).toBe("channel");
  });

  it("runs ONCE — a re-render never re-fires the reveal or moves the canvas again", () => {
    const { rerender } = render(<Harness focus="setup" />);
    const seqAfterFirst = useConfigSlice.getState().canvasFocusSeq;
    // Simulate the user moving on, then an unrelated re-render.
    act(() => {
      useConfigSlice.getState().closeNode();
    });
    rerender(<Harness focus="setup" />);
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
    expect(useConfigSlice.getState().canvasFocusSeq).toBe(seqAfterFirst);
  });

  it("consumes the focus query param (back/forward/reload safe)", () => {
    render(<Harness focus="setup" />);
    expect(window.location.pathname + window.location.search).toBe(
      "/workflows/wf-1",
    );
  });

  it("NAVIGATION-ONLY: the graph is untouched — no mutation, no dirty flag", () => {
    const nodesBefore = useGraphSlice.getState().pendingNodes;
    render(<Harness focus="setup" />);
    const state = useGraphSlice.getState();
    expect(state.pendingNodes).toEqual(nodesBefore);
    expect(state.isDirty).toBe(false);
  });

  it("fully-configured workflow → quiet no-op (no reveal, nothing selected)", () => {
    useGraphSlice.getState().reset();
    useConfigSlice.getState().reset();
    useGraphSlice.getState().hydrate(
      "wf-1",
      {
        ...DEFINITION,
        nodes: DEFINITION.nodes.map((n) =>
          n.id === "action-1"
            ? { ...n, config: { channel: "C123", text: "hi" } }
            : n,
        ),
      },
      "2026-07-18T00:00:00Z",
    );
    render(<Harness focus="setup" />);
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
  });

  it("disabled (local-only mode) → inert", () => {
    render(<Harness focus="setup" enabled={false} />);
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
  });
});

describe("useInitialBuilderFocus — test/activate pulses", () => {
  it.each(["test", "activate"] as const)(
    "focus=%s pulses once and auto-clears without touching config or graph",
    (focus) => {
      render(<Harness focus={focus} />);
      expect(lastPulse).toBe(focus);
      expect(useConfigSlice.getState().activeNodeId).toBeNull();
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(lastPulse).toBeNull();
      expect(useGraphSlice.getState().isDirty).toBe(false);
    },
  );

  it("no focus param → no pulse, no reveal, nothing consumed", () => {
    window.history.replaceState(null, "", "/workflows/wf-1");
    render(<Harness focus={undefined} />);
    expect(lastPulse).toBeNull();
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
  });
});

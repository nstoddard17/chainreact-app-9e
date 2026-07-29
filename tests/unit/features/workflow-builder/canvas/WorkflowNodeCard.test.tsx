/**
 * Tests for features/workflow-builder/canvas/WorkflowNodeCard.
 *
 * WorkflowNodeCard (Slice 4.BUILDER-CANVAS-1) replaces WorkflowNodeView
 * as the canvas's custom node renderer. The component is presentational
 * — no slice reads — so we render it directly through ReactFlowProvider
 * (`Handle` requires the React Flow store context).
 *
 * Surface contracts verified here:
 *   - data-testid="workflow-node-view" preserved (so the existing
 *     canvas-config-sync integration test keeps finding nodes).
 *   - data-selected, data-kind, data-status attributes.
 *   - Slice 4.BUILDER-NODE-IDENTITY-1: the node DISPLAY NAME is the title
 *     and the provider label is the subtitle (the raw `provider:type` key
 *     is no longer shown to the user).
 *   - Provider initials avatar fallback (deterministic, no per-provider
 *     branches).
 *   - "Not configured" amber badge when type === "".
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  WorkflowNodeCard,
  computeInitials,
} from "@/features/workflow-builder/canvas/WorkflowNodeCard";
import type { WorkflowNodeData } from "@/features/workflow-builder/canvas/adapters";

interface RenderInput {
  data: WorkflowNodeData;
  selected?: boolean;
}

function renderCard({ data, selected = false }: RenderInput) {
  // ReactFlow's Handle component reads the internal store; ReactFlowProvider
  // is enough for jsdom-render contexts (we never call useReactFlow here).
  return render(
    <ReactFlowProvider>
      <WorkflowNodeCard
        id="n1"
        type="workflowNode"
        data={data}
        selected={selected}
        // Minimal ReactFlow NodeProps surface — the component only consumes data + selected.
        dragging={false}
        isConnectable
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        zIndex={0}
        selectable
        deletable
        draggable
      />
    </ReactFlowProvider>,
  );
}

describe("WorkflowNodeCard — render contract", () => {
  it("preserves the data-testid 'workflow-node-view' so existing canvas tests still resolve nodes", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "slack",
        type: "slack.message.channel",
        displayName: "Send Message",
        providerLabel: "Slack",
      },
    });
    expect(screen.getByTestId("workflow-node-view")).toBeInTheDocument();
  });

  it("renders the node display name as the title, the provider label as the subtitle, and the kind chip", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "slack",
        type: "slack.message.channel",
        displayName: "Notify Support Team",
        providerLabel: "Slack",
      },
    });
    expect(screen.getByText("Notify Support Team")).toBeInTheDocument();
    expect(screen.getByText("action")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
    // The raw provider:type key is NOT shown to the user any more.
    expect(screen.queryByText("slack.message.channel")).toBeNull();
  });

  it("shows the provider id as the subtitle when no providerLabel is supplied", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "github",
        type: "add_comment",
        displayName: "Add Comment",
      },
    });
    expect(screen.getByText("Add Comment")).toBeInTheDocument();
    expect(screen.getByText("github")).toBeInTheDocument();
  });

  it("sets data-kind for trigger vs action", () => {
    const { rerender } = renderCard({
      data: {
        kind: "trigger",
        provider: "slack",
        type: "slack.event",
        displayName: "New Event",
      },
    });
    expect(screen.getByTestId("workflow-node-view")).toHaveAttribute(
      "data-kind",
      "trigger",
    );
    rerender(
      <ReactFlowProvider>
        <WorkflowNodeCard
          id="n1"
          type="workflowNode"
          data={{
            kind: "action",
            provider: "slack",
            type: "x",
            displayName: "X",
          }}
          selected={false}
          dragging={false}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          zIndex={0}
          selectable
          deletable
          draggable
        />
      </ReactFlowProvider>,
    );
    expect(screen.getByTestId("workflow-node-view")).toHaveAttribute(
      "data-kind",
      "action",
    );
  });
});

describe("WorkflowNodeCard — selected state", () => {
  it("sets data-selected='true' when ReactFlow marks the node selected", () => {
    renderCard({
      data: { kind: "action", provider: "slack", type: "x", displayName: "X" },
      selected: true,
    });
    expect(screen.getByTestId("workflow-node-view")).toHaveAttribute(
      "data-selected",
      "true",
    );
  });

  it("omits data-selected when not selected", () => {
    renderCard({
      data: { kind: "action", provider: "slack", type: "x", displayName: "X" },
      selected: false,
    });
    expect(screen.getByTestId("workflow-node-view")).not.toHaveAttribute(
      "data-selected",
    );
  });
});

describe("WorkflowNodeCard — status surface", () => {
  it("renders the 'Not configured' badge and data-status='unconfigured' when type is empty", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "slack",
        type: "",
        // The adapter feeds the kind fallback for an unconfigured node.
        displayName: "Action",
        providerLabel: "Slack",
      },
    });
    expect(screen.getByTestId("not-configured-badge")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-node-view")).toHaveAttribute(
      "data-status",
      "unconfigured",
    );
  });

  it("does NOT render the 'Not configured' badge once the node has a type, and reports data-status='configured'", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "slack",
        type: "slack.message.channel",
        displayName: "Send Message",
        providerLabel: "Slack",
      },
    });
    expect(screen.queryByTestId("not-configured-badge")).toBeNull();
    expect(screen.getByTestId("workflow-node-view")).toHaveAttribute(
      "data-status",
      "configured",
    );
  });
});

describe("WorkflowNodeCard — initials avatar fallback", () => {
  it("renders an initials avatar (no per-provider iconography branches)", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "slack",
        type: "x",
        displayName: "X",
        providerLabel: "Slack",
      },
    });
    const avatar = screen.getByTestId("provider-initials-avatar");
    expect(avatar.textContent).toBe("SL");
  });

  it("avatar initials are derived from the provider label (or id if unlabeled)", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "github",
        type: "x",
        displayName: "X",
      },
    });
    expect(screen.getByTestId("provider-initials-avatar").textContent).toBe(
      "GI",
    );
  });
});

describe("WorkflowNodeCard — provider icon rendering (Slice 4.BUILDER-INSPECTOR-1)", () => {
  it("renders the provider SVG <img> when providerIcon is supplied", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "slack",
        type: "slack.message.channel",
        displayName: "Send Message",
        providerLabel: "Slack",
        providerIcon: "/integrations/slack.svg",
      },
    });
    const iconWrap = screen.getByTestId("provider-icon");
    expect(iconWrap).toBeInTheDocument();
    expect(iconWrap.getAttribute("data-provider")).toBe("slack");
    const img = iconWrap.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("/integrations/slack.svg");
    // Initials avatar is NOT rendered when the icon path is active.
    expect(screen.queryByTestId("provider-initials-avatar")).toBeNull();
  });

  it("falls back to the initials avatar when the icon <img> fires onError (missing or malformed asset)", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "slack",
        type: "x",
        displayName: "X",
        providerLabel: "Slack",
        providerIcon: "/integrations/slack.svg",
      },
    });
    // Start with the icon mounted...
    const img = screen.getByTestId("provider-icon").querySelector("img")!;
    expect(img).not.toBeNull();
    // ...then simulate an asset load failure.
    act(() => {
      fireEvent.error(img);
    });
    // The card flips to the initials avatar without unmounting.
    expect(screen.queryByTestId("provider-icon")).toBeNull();
    expect(screen.getByTestId("provider-initials-avatar")).toBeInTheDocument();
    expect(screen.getByTestId("provider-initials-avatar").textContent).toBe(
      "SL",
    );
  });

  it("renders the initials fallback when providerIcon is absent (legacy / unknown provider)", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "unknown-provider",
        type: "x",
        displayName: "X",
        providerLabel: "Unknown",
      },
    });
    expect(screen.queryByTestId("provider-icon")).toBeNull();
    expect(screen.getByTestId("provider-initials-avatar")).toBeInTheDocument();
  });

  it("renders the ChainReact brand mark (svg) for built-in (native) nodes instead of initials", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "native",
        type: "loop",
        displayName: "Loop",
        providerLabel: "Built-in",
      },
    });
    const iconWrap = screen.getByTestId("provider-icon");
    expect(iconWrap.getAttribute("data-provider")).toBe("native");
    // The brand mark is an inline SVG (square + spark dot), not an <img> asset.
    expect(iconWrap.querySelector("svg")).not.toBeNull();
    expect(iconWrap.querySelector("img")).toBeNull();
    // No "BU"/"NA" initials avatar for native nodes.
    expect(screen.queryByTestId("provider-initials-avatar")).toBeNull();
  });

  it("has no per-provider string branches in the rendered output (icon URL drives everything)", () => {
    // Sanity check: passing an icon URL for a totally fictional provider
    // still renders the <img> with that URL — the card does NOT switch
    // behavior based on the provider key.
    renderCard({
      data: {
        kind: "action",
        provider: "totally-fictional",
        type: "x",
        displayName: "X",
        providerLabel: "Totally Fictional",
        providerIcon: "/integrations/totally-fictional.svg",
      },
    });
    const img = screen.getByTestId("provider-icon").querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/integrations/totally-fictional.svg");
  });
});

describe("computeInitials (pure helper)", () => {
  it("returns up to 2 letters from a single word", () => {
    expect(computeInitials("Slack")).toBe("SL");
    expect(computeInitials("X")).toBe("X");
  });

  it("returns the first letter of each of the first 2 words", () => {
    expect(computeInitials("Microsoft Teams")).toBe("MT");
    expect(computeInitials("Google Sheets Trigger")).toBe("GS");
  });

  it("falls back to '?' when the input is blank", () => {
    expect(computeInitials("")).toBe("?");
    expect(computeInitials("   ")).toBe("?");
  });
});

describe("WorkflowNodeCard — bottom connector orientation (BUILDER-NODE-BOTTOM-CONNECTOR)", () => {
  const action: WorkflowNodeData = {
    kind: "action",
    provider: "slack",
    type: "slack.message.channel",
    displayName: "Send Message",
    providerLabel: "Slack",
  };

  it("renders exactly one bottom source connector using the shared source-handle class", () => {
    const { container } = renderCard({ data: action });
    const bottom = container.querySelectorAll(".react-flow__handle-bottom");
    // 1 bottom handle only — no duplicate/legacy handle sneaks in.
    expect(bottom).toHaveLength(1);
    expect(bottom[0]).toHaveClass("builder-handle--source");
  });

  it("uses the bottom-facing orientation (React Flow anchors it on the node's bottom edge)", () => {
    const { container } = renderCard({ data: action });
    const bottom = container.querySelector(".react-flow__handle-bottom")!;
    // The `-bottom` position class is what drives RF's centered bottom-edge placement
    // (left:50%, bottom:0). data-handlepos mirrors it.
    expect(bottom).toHaveClass("react-flow__handle-bottom");
    expect(bottom).toHaveAttribute("data-handlepos", "bottom");
    // Not the top orientation — the connector faces down, not up/into the node.
    expect(bottom).not.toHaveClass("react-flow__handle-top");
  });

  it("keeps the bottom connector a source handle that can start an edge (edge-creation contract)", () => {
    const { container } = renderCard({ data: action });
    const bottom = container.querySelector(".react-flow__handle-bottom")!;
    expect(bottom).toHaveClass("source");
    expect(bottom).not.toHaveClass("target");
    // `connectablestart` = you can drag FROM it to create an edge (unchanged behavior).
    expect(bottom).toHaveClass("connectablestart");
  });

  it("preserves the top target handle topology (present on actions, omitted on triggers, never a source)", () => {
    const { container: actionC } = renderCard({ data: action });
    const top = actionC.querySelector(".react-flow__handle-top")!;
    expect(top).toBeInTheDocument();
    expect(top).toHaveClass("target");
    // Target must not be draggable as a connection START.
    expect(top).not.toHaveClass("connectablestart");

    const { container: triggerC } = renderCard({
      data: { kind: "trigger", provider: "native", type: "manual", displayName: "Manual Run" },
    });
    // Trigger nodes have no incoming edge, so no top target handle...
    expect(triggerC.querySelector(".react-flow__handle-top")).toBeNull();
    // ...but they DO expose the same bottom source connector.
    expect(triggerC.querySelectorAll(".react-flow__handle-bottom.builder-handle--source")).toHaveLength(1);
  });

  it("applies the same bottom connector to every node type sharing this card (trigger, action, native/logic)", () => {
    const cases: WorkflowNodeData[] = [
      { kind: "trigger", provider: "native", type: "manual", displayName: "Manual Run" },
      { kind: "action", provider: "slack", type: "slack.message.channel", displayName: "Send Message" },
      { kind: "action", provider: "native", type: "loop", displayName: "Loop" },
    ];
    for (const data of cases) {
      const { container, unmount } = renderCard({ data });
      expect(
        container.querySelectorAll(".react-flow__handle-bottom.builder-handle--source"),
      ).toHaveLength(1);
      unmount();
    }
  });

  it("does not clip the connector at the node wrapper: the testid wrapper allows overflow, the inner card clips its own corners", () => {
    const { container } = renderCard({ data: action });
    const wrapper = screen.getByTestId("workflow-node-view");
    // The wrapper that hosts the handles must NOT be overflow-hidden, or the semicircle
    // would be clipped back inside the node (the original bug).
    expect(wrapper).not.toHaveClass("overflow-hidden");
    // The rounded visual card is a separate inner element that keeps overflow-hidden.
    const clipped = container.querySelector(".overflow-hidden");
    expect(clipped).not.toBeNull();
    expect(clipped).not.toBe(wrapper);
    // And the handle is a sibling of that clipped card (not a descendant of it), so it
    // can protrude below the node.
    expect(clipped!.querySelector(".react-flow__handle-bottom")).toBeNull();
  });
});

describe("WorkflowNodeCard — Needs setup (BUILDER-READINESS)", () => {
  const base = {
    kind: "action" as const,
    provider: "native",
    type: "http_request",
    displayName: "HTTP Request",
  };

  it("renders the Needs setup badge when a required field is missing", () => {
    renderCard({ data: { ...base, missingRequiredConfig: true } });
    expect(screen.getByTestId("needs-setup-badge")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-node-view")).toHaveAttribute(
      "data-status",
      "needs_setup",
    );
  });

  it("renders Ready (no Needs setup badge) when required fields are present", () => {
    renderCard({ data: { ...base, missingRequiredConfig: false } });
    expect(screen.queryByTestId("needs-setup-badge")).toBeNull();
    expect(screen.getByTestId("workflow-node-view")).toHaveAttribute(
      "data-status",
      "configured",
    );
  });
});

describe("WorkflowNodeCard — at-a-glance summary line (CONFIG-UX-NODE-SUMMARY-1)", () => {
  const base: WorkflowNodeData = {
    kind: "action",
    provider: "slack",
    type: "send_channel_message",
    displayName: "Send Channel Message",
    providerLabel: "Slack",
  };

  it("renders the summary line when the headline carries a resolved resource name", () => {
    renderCard({
      data: { ...base, summaryHeadline: "Send Channel Message · #support-alerts" },
    });
    const line = screen.getByTestId("node-summary-line");
    expect(line).toHaveTextContent("Send Channel Message · #support-alerts");
    // Truncated on the card, so the full text must stay readable on hover.
    expect(line).toHaveAttribute("title", "Send Channel Message · #support-alerts");
  });

  it("does NOT render the line when no headline was computed (unresolved label / no summary metadata)", () => {
    renderCard({ data: base });
    expect(screen.queryByTestId("node-summary-line")).toBeNull();
  });

  it("does NOT render the line when the headline only repeats the title the card already shows", () => {
    renderCard({ data: { ...base, summaryHeadline: "Send Channel Message" } });
    expect(screen.queryByTestId("node-summary-line")).toBeNull();
  });

  it("keeps the provider-label subtitle alongside the summary line", () => {
    renderCard({
      data: { ...base, summaryHeadline: "Send Channel Message · #support-alerts" },
    });
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByTestId("node-summary-line")).toBeInTheDocument();
  });
});

/**
 * BUILDER-CANVAS-ZOOM-FOCUS-1 — the node whose config panel is open pulses slowly, so with the
 * canvas zoomed in and a panel open there is never any doubt which step you are editing.
 */
describe("WorkflowNodeCard — config-open pulse", () => {
  const base: WorkflowNodeData = {
    kind: "action",
    provider: "slack",
    type: "send_channel_message",
    displayName: "Send Channel Message",
  };

  it("marks and animates the node whose config panel is open", () => {
    renderCard({ data: { ...base, configOpen: true }, selected: true });
    const view = screen.getByTestId("workflow-node-view");
    expect(view).toHaveAttribute("data-config-open", "true");
    expect(view.querySelector(".builder-node-editing")).not.toBeNull();
  });

  it("does NOT pulse a node that is merely selected", () => {
    // The distinction that matters: a canvas click or marquee selects a node without opening its
    // config. Pulsing on `selected` would mark the node you last touched, not the one you're
    // editing — and could pulse several at once.
    renderCard({ data: base, selected: true });
    const view = screen.getByTestId("workflow-node-view");
    expect(view).not.toHaveAttribute("data-config-open");
    expect(view.querySelector(".builder-node-editing")).toBeNull();
  });

  it("does not pulse an ordinary unselected node", () => {
    renderCard({ data: base, selected: false });
    expect(screen.getByTestId("workflow-node-view").querySelector(".builder-node-editing")).toBeNull();
  });
});

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

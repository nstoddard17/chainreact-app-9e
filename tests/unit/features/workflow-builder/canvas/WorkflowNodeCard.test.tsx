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
 *   - Provider label + kind chip rendered.
 *   - Provider initials avatar fallback (deterministic, no per-provider
 *     branches).
 *   - "Not configured" amber badge when type === "".
 *   - Type subtitle shown when configured.
 */
import { render, screen } from "@testing-library/react";
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
        providerLabel: "Slack",
      },
    });
    expect(screen.getByTestId("workflow-node-view")).toBeInTheDocument();
  });

  it("renders the provider label, kind chip, and configured type subtitle", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "slack",
        type: "slack.message.channel",
        providerLabel: "Slack",
      },
    });
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByText("action")).toBeInTheDocument();
    expect(screen.getByText("slack.message.channel")).toBeInTheDocument();
  });

  it("falls back to the provider id when no providerLabel is supplied", () => {
    renderCard({
      data: { kind: "action", provider: "github", type: "add_comment" },
    });
    expect(screen.getByText("github")).toBeInTheDocument();
  });

  it("sets data-kind for trigger vs action", () => {
    const { rerender } = renderCard({
      data: { kind: "trigger", provider: "slack", type: "slack.event" },
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
          data={{ kind: "action", provider: "slack", type: "x" }}
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
      data: { kind: "action", provider: "slack", type: "x" },
      selected: true,
    });
    expect(screen.getByTestId("workflow-node-view")).toHaveAttribute(
      "data-selected",
      "true",
    );
  });

  it("omits data-selected when not selected", () => {
    renderCard({
      data: { kind: "action", provider: "slack", type: "x" },
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
        providerLabel: "Slack",
      },
    });
    expect(screen.getByTestId("not-configured-badge")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-node-view")).toHaveAttribute(
      "data-status",
      "unconfigured",
    );
    // Subtitle still says "(unconfigured)" — preserves prior copy.
    expect(screen.getByText("(unconfigured)")).toBeInTheDocument();
  });

  it("does NOT render the 'Not configured' badge once the node has a type, and reports data-status='configured'", () => {
    renderCard({
      data: {
        kind: "action",
        provider: "slack",
        type: "slack.message.channel",
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
        providerLabel: "Slack",
      },
    });
    const avatar = screen.getByTestId("provider-initials-avatar");
    expect(avatar.textContent).toBe("SL");
  });

  it("avatar initials are derived from the provider label (or id if unlabeled)", () => {
    renderCard({
      data: { kind: "action", provider: "github", type: "x" },
    });
    expect(screen.getByTestId("provider-initials-avatar").textContent).toBe(
      "GI",
    );
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

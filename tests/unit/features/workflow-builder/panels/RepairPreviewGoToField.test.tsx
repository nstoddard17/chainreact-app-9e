/**
 * Tests for the blocked-repair-preview "Go to field" affordance
 * (Slice 4.AI-REPAIR-2F), rendered by `RepairPreviewBody`.
 *
 * The affordance is NAVIGATION ONLY: clicking selects the affected node, opens
 * its config rail (activeNodeId), requests a canvas pan (canvasFocus*), and
 * highlights the affected field (focusFieldKey). It renders display LABELS only
 * — never the raw node id or field key — and writes NO config value, save, run,
 * or graph mutation. When no targeting metadata exists, no button renders.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RepairPreview } from "@/lib/api/ai";
import { RepairPreviewBody } from "@/features/workflow-builder/panels/_BuilderAiPanelDiagnosis";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const SLACK_NODE = {
  id: "slack1",
  kind: "action" as const,
  provider: "slack",
  type: "send_channel_message",
  config: { channel: "C12345678", text: "" },
  position: { x: 40, y: 80 },
};

function blockedPreview(
  errorOverrides: Partial<RepairPreview["validation"]["errors"][number]> = {},
): RepairPreview {
  return {
    ok: false,
    patchSummary: "Add the message body",
    changes: [],
    affectedNodeIds: ["slack1"],
    affectedEdgeIds: [],
    riskLevel: "low",
    requiresConfirmation: false,
    riskReasons: [],
    validation: {
      ok: false,
      errors: [
        {
          code: "MISSING_REQUIRED_FIELD",
          message: "Required field “Message” is missing on “Send Channel Message.”",
          nodeId: "slack1",
          path: "text",
          nodeLabel: "Send Channel Message",
          fieldLabel: "Message",
          ...errorOverrides,
        },
      ],
      warnings: [],
    },
    userFacingSummaryText: "Add the message body — BLOCKED — 1 error(s).",
    canApplyLater: false,
    blockedReason: "Required field “Message” is missing on “Send Channel Message.”",
  };
}

beforeEach(() => {
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
  // Seed the live graph so the reveal handler can resolve the node's config.
  useGraphSlice.getState().hydrate("wf1", { nodes: [SLACK_NODE], edges: [] }, "rev-1");
});

describe("RepairPreviewBody — Go to field affordance (AI-REPAIR-2F)", () => {
  it("renders a label-based button when node + field targeting metadata exists", () => {
    render(<RepairPreviewBody preview={blockedPreview()} />);
    const btn = screen.getByTestId("builder-ai-repair-preview-goto");
    // Label uses the friendly field label, not the raw key.
    expect(btn).toHaveTextContent("Open Message field");
  });

  it("does NOT render the raw node id or field key as text", () => {
    render(<RepairPreviewBody preview={blockedPreview()} />);
    const blocked = screen.getByTestId("builder-ai-repair-preview-blocked");
    expect(blocked.textContent).not.toMatch(/\bslack1\b/);
    expect(blocked.textContent).not.toMatch(/\btext\b/); // raw field key
    expect(blocked.textContent).not.toMatch(/send_channel_message/);
  });

  it("clicking selects the node, opens the rail, highlights the field, and pans the canvas — no graph mutation", async () => {
    const user = userEvent.setup();
    const nodesBefore = useGraphSlice.getState().pendingNodes;
    render(<RepairPreviewBody preview={blockedPreview()} />);

    await user.click(screen.getByTestId("builder-ai-repair-preview-goto"));

    const cfg = useConfigSlice.getState();
    expect(cfg.activeNodeId).toBe("slack1"); // selected + rail opens (via WorkflowBuilder effect)
    expect(cfg.focusFieldKey).toBe("text"); // field highlight target
    expect(cfg.canvasFocusNodeId).toBe("slack1"); // canvas pan target
    expect(cfg.canvasFocusSeq).toBe(1);
    // The draft mirrors current config — NO value changed, not dirty.
    expect(cfg.drafts.slack1).toMatchObject({
      values: { channel: "C12345678", text: "" },
      isDirty: false,
    });
    // The graph is untouched (no mutation / save / run).
    expect(useGraphSlice.getState().pendingNodes).toEqual(nodesBefore);
  });

  it("renders a node-only 'Go to' button when no field label is present", () => {
    render(
      <RepairPreviewBody
        preview={blockedPreview({ fieldLabel: undefined, path: undefined })}
      />,
    );
    expect(screen.getByTestId("builder-ai-repair-preview-goto")).toHaveTextContent(
      "Go to Send Channel Message",
    );
  });

  it("renders NO button (safe guidance only) when targeting metadata is absent", () => {
    render(
      <RepairPreviewBody
        preview={blockedPreview({ nodeId: undefined, nodeLabel: undefined, fieldLabel: undefined })}
      />,
    );
    // The blocked guidance text still renders…
    expect(screen.getByTestId("builder-ai-repair-preview-blocked")).toBeInTheDocument();
    // …but there is no (broken) button.
    expect(screen.queryByTestId("builder-ai-repair-preview-goto")).not.toBeInTheDocument();
  });

  it("does NOT render an Apply control anywhere in the blocked preview", () => {
    render(<RepairPreviewBody preview={blockedPreview()} />);
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
  });

  it("click no-ops safely when the target node is no longer on the canvas (stale)", async () => {
    const user = userEvent.setup();
    useGraphSlice.getState().reset(); // node gone
    render(<RepairPreviewBody preview={blockedPreview()} />);
    await user.click(screen.getByTestId("builder-ai-repair-preview-goto"));
    // No selection happened; nothing threw.
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
  });
});

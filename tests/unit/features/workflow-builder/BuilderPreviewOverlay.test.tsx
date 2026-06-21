/**
 * BuilderPreviewOverlay — non-applied AI draft preview layer (HERMES-AGENT-BUILDER-PREVIEW-OVERLAY).
 * Proves the overlay renders shimmered/ghost preview nodes + dashed preview edges with clear
 * preview markers, a "Suggested" badge + "Preview only…" notice, and a Discard control that calls
 * onDiscard. There is NO apply/create/use/add/run control. Pure presentational — no store/network.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderPreviewOverlay } from "@/features/workflow-builder/canvas/BuilderPreviewOverlay";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

const preview: DraftPreview = {
  version: 1,
  title: "Lead follow-up",
  summary: "Watch then notify.",
  notice: "Preview only — your workflow has not changed.",
  notApplied: true,
  nodes: [
    { previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true },
    { previewId: "preview-step-2", role: "action", provider: "slack", type: "send_message", label: "slack:send_message", purpose: "notify", missingInputs: ["channel"], notApplied: true },
  ],
  edges: [{ previewId: "preview-edge-1", fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2", notApplied: true }],
};

describe("BuilderPreviewOverlay", () => {
  it("renders the overlay with a Suggested badge and the preview-only notice", () => {
    render(<BuilderPreviewOverlay preview={preview} onDiscard={() => {}} />);
    expect(screen.getByTestId("builder-preview-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("builder-preview-badge")).toHaveTextContent("Suggested");
    expect(screen.getByTestId("builder-preview-overlay-notice")).toHaveTextContent(
      "Preview only — your workflow has not changed.",
    );
  });

  it("renders a ghost/shimmer preview node per plan node with a preview marker class", () => {
    render(<BuilderPreviewOverlay preview={preview} onDiscard={() => {}} />);
    const nodes = screen.getAllByTestId("builder-preview-node");
    expect(nodes).toHaveLength(2);
    for (const n of nodes) {
      expect(n).toHaveAttribute("data-preview", "true");
      expect(n.className).toMatch(/builder-preview-node-ghost/);
      expect(n.className).toMatch(/animate-pulse|border-dashed/); // shimmer / ghost styling
    }
    expect(nodes[0]).toHaveTextContent("gmail:new_email");
    expect(nodes[1]).toHaveTextContent("slack:send_message");
    expect(nodes[1]).toHaveTextContent("Still needs: channel");
  });

  it("renders dashed preview edges between nodes (N-1)", () => {
    render(<BuilderPreviewOverlay preview={preview} onDiscard={() => {}} />);
    const edges = screen.getAllByTestId("builder-preview-edge");
    expect(edges).toHaveLength(1);
    expect(edges[0]).toHaveAttribute("data-preview", "true");
    expect(edges[0]!.className).toMatch(/builder-preview-edge-dashed|border-dashed/);
  });

  it("Discard control calls onDiscard (overlay state only — no mutation here)", async () => {
    const user = userEvent.setup();
    const onDiscard = jest.fn();
    render(<BuilderPreviewOverlay preview={preview} onDiscard={onDiscard} />);
    await user.click(screen.getByTestId("builder-preview-discard"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("is review-only (no Apply control) when onApply is omitted", () => {
    render(<BuilderPreviewOverlay preview={preview} onDiscard={() => {}} />);
    expect(screen.queryByTestId("builder-preview-apply")).not.toBeInTheDocument();
    // Still no create/use-this/run controls regardless.
    expect(
      screen.queryByRole("button", { name: /create|use this|add node|run/i }),
    ).not.toBeInTheDocument();
  });

  it("shows an 'Apply preview' control ONLY when onApply is provided, and calls it", async () => {
    const user = userEvent.setup();
    const onApply = jest.fn();
    render(<BuilderPreviewOverlay preview={preview} onDiscard={() => {}} onApply={onApply} />);
    const applyBtn = screen.getByTestId("builder-preview-apply");
    expect(applyBtn).toHaveTextContent("Apply preview");
    await user.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
    // No create/use-this/run controls beyond the explicit Apply.
    expect(screen.queryByRole("button", { name: /create|use this|run\b/i })).not.toBeInTheDocument();
  });
});

// HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 — the "Set up these steps" controls on the holographic preview.
describe("BuilderPreviewOverlay — guided setup", () => {
  const setupFieldsByType: PreviewSetupFieldsByType = {
    "slack:send_message": [{ name: "message", label: "Message", type: "textarea", required: true }],
  };
  const previewWithMissing: DraftPreview = {
    ...preview,
    nodes: [
      preview.nodes[0]!,
      { ...preview.nodes[1]!, missingInputs: ["message", "channel"] }, // message supported; channel not
    ],
  };

  it("renders a 'Set up these steps' control for supported missing fields and marks the rest 'after Apply'", () => {
    render(
      <BuilderPreviewOverlay
        preview={previewWithMissing}
        onDiscard={() => {}}
        onApply={() => {}}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
      />,
    );
    expect(screen.getByTestId("builder-preview-setup")).toBeInTheDocument();
    expect(screen.getByTestId("preview-setup-preview-step-2-message")).toBeInTheDocument();
    // The async/unknown field is NOT rendered as a fake control — it waits until after Apply.
    expect(screen.queryByTestId("preview-setup-preview-step-2-channel")).not.toBeInTheDocument();
    expect(screen.getByTestId("preview-setup-after-apply")).toHaveTextContent("channel");
  });

  it("typing a value calls onPreviewConfigChange (preview-only)", () => {
    const onPreviewConfigChange = jest.fn();
    render(
      <BuilderPreviewOverlay
        preview={previewWithMissing}
        onDiscard={() => {}}
        onApply={() => {}}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={onPreviewConfigChange}
      />,
    );
    fireEvent.change(screen.getByTestId("preview-setup-preview-step-2-message"), {
      target: { value: "Review new leads" },
    });
    expect(onPreviewConfigChange).toHaveBeenCalledWith("preview-step-2", "message", "Review new leads");
  });

  it("renders NO setup section when setupFieldsByType is absent (e.g. dashboard / no metadata)", () => {
    render(
      <BuilderPreviewOverlay
        preview={previewWithMissing}
        onDiscard={() => {}}
        onApply={() => {}}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("builder-preview-setup")).not.toBeInTheDocument();
  });
});

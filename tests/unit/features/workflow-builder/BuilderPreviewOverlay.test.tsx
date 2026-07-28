/**
 * BuilderPreviewOverlay — non-applied AI draft preview layer (HERMES-AGENT-BUILDER-PREVIEW-OVERLAY +
 * HERMES-AGENT-HOLOGRAPHIC-PREVIEW-NODE-UX).
 *
 * Proves the overlay renders holographic preview cards that MIRROR the real node card (provider
 * avatar, kind chip, humanized title, provider label) with a proposed/shimmer treatment + dashed
 * preview edges, a "Suggested" badge + "Preview only…" notice, and a Discard control. There is NO
 * apply/create/use/add/run control beyond the explicit Apply. CRITICALLY: the canvas preview nodes
 * are VISUAL ONLY — no inputs / selects / textareas / setup forms render inside them; a still-
 * incomplete node shows a short "Needs setup" badge, never a field list. Pure presentational — no
 * store/network.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderPreviewOverlay } from "@/features/workflow-builder/canvas/BuilderPreviewOverlay";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";

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

  it("renders a holographic preview node per plan node with a preview marker class + node-card content", () => {
    render(<BuilderPreviewOverlay preview={preview} onDiscard={() => {}} />);
    const nodes = screen.getAllByTestId("builder-preview-node");
    expect(nodes).toHaveLength(2);
    for (const n of nodes) {
      expect(n).toHaveAttribute("data-preview", "true");
      // Holographic / proposed styling markers.
      expect(n.className).toMatch(/builder-preview-node-ghost/);
      expect(n.className).toMatch(/animate-pulse/); // shimmer pulse
      expect(n.className).toMatch(/border-dashed/); // dashed glowing border
      // A subtle per-node "Preview" badge.
      expect(n).toHaveTextContent("Preview");
    }
    // Mirrors the real card: kind chip + humanized title + the provider:type capability label.
    expect(nodes[0]).toHaveTextContent("trigger");
    expect(nodes[0]).toHaveTextContent("New Email"); // humanized type title
    expect(nodes[0]).toHaveTextContent("gmail:new_email"); // mono capability subtitle
    expect(nodes[1]).toHaveTextContent("action");
    expect(nodes[1]).toHaveTextContent("Send Message");
    expect(nodes[1]).toHaveTextContent("slack:send_message");
  });

  // REACT-AGENT-RAIL-NODE-DISPLAY-NAMES-1 — when the builder threads the registry names in, the ghost
  // card titles the step exactly as the real node card and the rail's setup card do. The humanized key
  // asserted above is only the fallback, and it can differ from the registry name.
  it("prefers the registry display name for the card title when one is supplied", () => {
    render(
      <BuilderPreviewOverlay
        preview={preview}
        onDiscard={() => {}}
        nodeDisplayNames={{ "gmail:new_email": "New Email Received" }}
      />,
    );
    const nodes = screen.getAllByTestId("builder-preview-node");
    expect(nodes[0]).toHaveTextContent("New Email Received");
    // Unmapped types still fall back to the title-cased key.
    expect(nodes[1]).toHaveTextContent("Send Message");
  });

  it("shows a SHORT 'Needs setup' badge (with count) on incomplete nodes — never a field list", () => {
    render(<BuilderPreviewOverlay preview={preview} onDiscard={() => {}} />);
    const nodes = screen.getAllByTestId("builder-preview-node");
    // The slack node still needs `channel` → short badge with the field count, NOT the field name.
    const badge = screen.getByTestId("preview-node-needs-setup");
    expect(badge).toHaveTextContent("Needs setup · 1");
    expect(badge).not.toHaveTextContent("channel");
    // The whole overlay never lists the missing field name anywhere.
    expect(screen.queryByText(/channel/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Still needs/i)).not.toBeInTheDocument();
    // The complete trigger node shows the "ready" status, not "Needs setup".
    expect(nodes[0]).toHaveTextContent("ready");
  });

  it("renders NO setup controls inside the preview nodes (visual cards only)", () => {
    render(
      <BuilderPreviewOverlay preview={preview} onDiscard={() => {}} onApply={() => {}} />,
    );
    // No form controls anywhere on the canvas overlay — those live in the rail / config drawer.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(document.querySelector("input,select,textarea")).toBeNull();
    // The Phase-1 on-canvas setup section is gone.
    expect(screen.queryByTestId("builder-preview-setup")).not.toBeInTheDocument();
    expect(screen.queryByTestId("preview-setup-preview-step-2-channel")).not.toBeInTheDocument();
  });

  it("renders the provider avatar (icon when provided, initials fallback otherwise)", () => {
    render(
      <BuilderPreviewOverlay
        preview={preview}
        onDiscard={() => {}}
        providerLabels={{ slack: "Slack" }}
        providerIcons={{ slack: "https://cdn.example.com/slack.svg" }}
      />,
    );
    // Slack has an icon → image avatar; gmail has none → initials avatar.
    expect(screen.getByTestId("preview-provider-icon")).toHaveAttribute("data-provider", "slack");
    expect(screen.getAllByTestId("preview-provider-initials-avatar").length).toBeGreaterThan(0);
    // The friendly provider label renders (mirrors the real card's provider line).
    expect(screen.getAllByTestId("builder-preview-node")[1]).toHaveTextContent("Slack");
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

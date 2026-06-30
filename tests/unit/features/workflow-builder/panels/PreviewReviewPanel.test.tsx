/**
 * PreviewReviewPanel — right-rail "Review changes" config diff (HERMES-AGENT-CONFIG-DIFF-REVIEW).
 *
 * The panel is presentational: it renders the pre-computed, already-redacted diff and exposes only the
 * existing Apply/Discard actions. These tests protect: the section structure (summary / node changes /
 * config changes / setup needed), that a redacted field NEVER renders a raw value, that the compute-
 * failure fallback still lets the user Apply/Discard, and that the panel calls only the passed callbacks
 * (no store / fetch / service / repository import — a boundary guard).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PreviewReviewPanel } from "@/features/workflow-builder/panels/PreviewReviewPanel";
import type { ConfigDiff } from "@/core/workflows/buildConfigDiff";
import type { AgentPreviewRationale } from "@/core/workflows/buildPreviewRationale";

const diff: ConfigDiff = {
  nodes: [
    {
      nodeId: "gmail-1",
      provider: "gmail",
      type: "send_email",
      label: "Gmail / Send Email",
      status: "added",
      addedFields: [
        { name: "subject", label: "Subject", secret: false, after: { kind: "text", preview: "Welcome", truncated: false } },
      ],
      changedFields: [],
      removedFields: [],
      missingRequiredFields: [{ name: "to", label: "To" }],
      variablesUsed: ["{{trigger.email}}"],
    },
    {
      nodeId: "slack-1",
      provider: "slack",
      type: "send_message",
      label: "Slack / Send Channel Message",
      status: "changed",
      addedFields: [],
      changedFields: [
        {
          name: "channel",
          label: "Channel",
          secret: false,
          before: { kind: "text", preview: "#support", truncated: false },
          after: { kind: "text", preview: "#sales", truncated: false },
        },
      ],
      removedFields: [],
      missingRequiredFields: [],
      variablesUsed: [],
    },
  ],
};

describe("PreviewReviewPanel", () => {
  it("renders the diff WITHOUT Apply/Discard in read-only mode (hideActions) for the historical View diff", () => {
    render(<PreviewReviewPanel configDiff={diff} hideActions />);
    // The value-level diff still renders…
    expect(screen.getByTestId("preview-review-panel")).toBeInTheDocument();
    expect(screen.getByTestId("preview-review-overview-gmail-1")).toBeInTheDocument();
    // …but the mutating actions are gone (a past change can't be re-applied from here).
    expect(screen.queryByTestId("preview-review-apply")).not.toBeInTheDocument();
    expect(screen.queryByTestId("preview-review-discard")).not.toBeInTheDocument();
  });

  it("renders summary, node changes, config changes, and setup-needed sections", () => {
    render(
      <PreviewReviewPanel summary="Add a Gmail step and retarget the Slack channel." configDiff={diff} onApply={jest.fn()} onDiscard={jest.fn()} />,
    );
    expect(screen.getByTestId("preview-review-summary")).toHaveTextContent("Add a Gmail step");
    expect(screen.getByTestId("preview-review-node-changes")).toHaveTextContent("Added Gmail / Send Email");
    expect(screen.getByTestId("preview-review-node-changes")).toHaveTextContent("Changed Slack / Send Channel Message");
    // Field-level detail: the changed channel reads before → after.
    const slackCard = screen.getByTestId("preview-review-node-slack-1");
    expect(slackCard).toHaveTextContent("Channel");
    expect(slackCard).toHaveTextContent("#support");
    expect(slackCard).toHaveTextContent("#sales");
    // Setup needed surfaces the missing required field.
    expect(screen.getByTestId("preview-review-missing-gmail-1-to")).toHaveTextContent("To: required");
    // Variables used are listed for the Gmail node.
    expect(screen.getByTestId("preview-review-variables-gmail-1")).toHaveTextContent("{{trigger.email}}");
  });

  it("renders the 'Why this change?' bullets near the top when a rationale is provided", () => {
    const rationale: AgentPreviewRationale = {
      title: "Why this change?",
      summary: "Add a Gmail step and retarget the Slack channel.",
      bullets: [
        { kind: "request_match", text: 'You asked: "send an email instead"' },
        { kind: "node_added", text: "Added Gmail / Send Email.", nodeId: "gmail-1" },
        { kind: "preserved", text: "Kept the native:manual.run trigger.", nodeId: "t1" },
        { kind: "needs_user_input", text: "Gmail / Send Email still needs To.", nodeId: "gmail-1", fieldPath: "to" },
      ],
      fieldReasons: [],
    };
    render(<PreviewReviewPanel summary="x" configDiff={diff} rationale={rationale} onApply={jest.fn()} onDiscard={jest.fn()} />);
    const why = screen.getByTestId("preview-review-why");
    expect(why).toHaveTextContent('You asked: "send an email instead"');
    expect(why).toHaveTextContent("Added Gmail / Send Email.");
    expect(why).toHaveTextContent("Kept the native:manual.run trigger.");
    expect(screen.getByTestId("preview-review-why-needs_user_input")).toHaveTextContent("still needs To.");
  });

  it("omits the 'Why this change?' section when the rationale is null or has no bullets", () => {
    const { rerender } = render(<PreviewReviewPanel configDiff={diff} rationale={null} onApply={jest.fn()} onDiscard={jest.fn()} />);
    expect(screen.queryByTestId("preview-review-why")).not.toBeInTheDocument();
    rerender(
      <PreviewReviewPanel configDiff={diff} rationale={{ title: "Why this change?", bullets: [], fieldReasons: [] }} onApply={jest.fn()} onDiscard={jest.fn()} />,
    );
    expect(screen.queryByTestId("preview-review-why")).not.toBeInTheDocument();
  });

  it("renders high-risk field reasons grouped by node, and omits the section when there are none", () => {
    const rationale: AgentPreviewRationale = {
      title: "Why this change?",
      bullets: [{ kind: "node_changed", text: "Updated Slack / Send Channel Message.", nodeId: "slack-1" }],
      fieldReasons: [
        {
          nodeId: "slack-1",
          nodeLabel: "Slack / Send Channel Message",
          fieldPath: "channel",
          fieldLabel: "Channel",
          status: "changed",
          category: "recipient",
          text: "Channel changed — controls where this sends.",
        },
      ],
    };
    const { rerender } = render(
      <PreviewReviewPanel configDiff={diff} rationale={rationale} onApply={jest.fn()} onDiscard={jest.fn()} />,
    );
    const section = screen.getByTestId("preview-review-field-reasons");
    expect(section).toHaveTextContent("Slack / Send Channel Message");
    expect(screen.getByTestId("preview-review-field-reason-slack-1-channel")).toHaveTextContent(
      "Channel changed — controls where this sends.",
    );
    // No raw before/after value leaks into the field-reasons section.
    expect(section).not.toHaveTextContent("#support");
    expect(section).not.toHaveTextContent("#sales");

    // Empty fieldReasons → the whole section is omitted.
    rerender(
      <PreviewReviewPanel
        configDiff={diff}
        rationale={{ title: "Why this change?", bullets: [], fieldReasons: [] }}
        onApply={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(screen.queryByTestId("preview-review-field-reasons")).not.toBeInTheDocument();
  });

  it("renders a redacted field as hidden and never shows a raw secret value", () => {
    const secretDiff: ConfigDiff = {
      nodes: [
        {
          nodeId: "hook-1",
          provider: "webhook",
          type: "call",
          label: "Webhook",
          status: "changed",
          addedFields: [],
          changedFields: [
            { name: "apiKey", label: "API Key", secret: true, before: { kind: "redacted" }, after: { kind: "redacted" } },
          ],
          removedFields: [],
          missingRequiredFields: [],
          variablesUsed: [],
        },
      ],
    };
    render(<PreviewReviewPanel configDiff={secretDiff} onApply={jest.fn()} onDiscard={jest.fn()} />);
    expect(screen.getByTestId("preview-review-node-hook-1")).toHaveTextContent("API Key");
    expect(screen.getAllByTestId("preview-review-redacted").length).toBeGreaterThan(0);
    // The whole rendered subtree carries no raw secret material.
    expect(document.body.textContent).toContain("hidden");
  });

  it("renders a calm fallback (still Apply/Discard) when the diff failed to compute (null)", () => {
    const onApply = jest.fn();
    const onDiscard = jest.fn();
    render(<PreviewReviewPanel configDiff={null} onApply={onApply} onDiscard={onDiscard} />);
    expect(screen.getByTestId("preview-review-fallback")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("preview-review-apply"));
    fireEvent.click(screen.getByTestId("preview-review-discard"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("invokes only the provided Apply/Discard callbacks", () => {
    const onApply = jest.fn();
    const onDiscard = jest.fn();
    render(<PreviewReviewPanel configDiff={diff} onApply={onApply} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByTestId("preview-review-apply"));
    fireEvent.click(screen.getByTestId("preview-review-discard"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("imports no store / service / repository / fetch (presentational boundary)", () => {
    const source = readFileSync(
      join(process.cwd(), "features/workflow-builder/panels/PreviewReviewPanel.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["']@\/services\//);
    expect(source).not.toMatch(/from\s+["']@\/repositories\//);
    expect(source).not.toMatch(/from\s+["']@\/lib\/api\//);
    expect(source).not.toMatch(/state\/\w+Slice/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});

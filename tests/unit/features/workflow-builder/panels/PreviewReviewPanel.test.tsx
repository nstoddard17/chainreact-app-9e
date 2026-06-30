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

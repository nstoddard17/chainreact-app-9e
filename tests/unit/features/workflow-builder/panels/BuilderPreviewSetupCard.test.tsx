/**
 * BuilderPreviewSetupCard — guided preview setup re-homed into the React rail
 * (HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX).
 *
 * Proves the rail setup card renders supported local controls for the latest preview's missing fields,
 * defers async/unsupported fields to a compact "Choose after Apply" line (no fake dropdown), updates
 * ONLY the ephemeral previewConfig via onPreviewConfigChange (no store/network/Hermes), and applies via
 * the existing explicit onApply. Recipient-class fields render as local controls; secret/connection
 * fields are excluded upstream (never in setupFieldsByType) so they never render here. Pure
 * presentational — no fetch, no model call.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderPreviewSetupCard } from "@/features/workflow-builder/panels/BuilderPreviewSetupCard";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

function preview(missing: readonly string[]): DraftPreview {
  return {
    version: 1,
    title: "Lead follow-up",
    summary: "Watch then notify.",
    notice: "Preview only — your workflow has not changed.",
    notApplied: true,
    nodes: [
      { previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true },
      { previewId: "preview-step-2", role: "action", provider: "slack", type: "send_message", label: "slack:send_message", purpose: "notify", missingInputs: missing, notApplied: true },
    ],
    edges: [{ previewId: "preview-edge-1", fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2", notApplied: true }],
  };
}

const setupFieldsByType: PreviewSetupFieldsByType = {
  "slack:send_message": [
    { name: "text", label: "Message", type: "textarea", required: true },
    // A recipient-class field that renders as a local text control (e.g. typed destination).
    { name: "to", label: "To", type: "text", required: true },
    { name: "count", label: "Count", type: "number", required: false },
    { name: "silent", label: "Silent", type: "boolean", required: false },
    { name: "mode", label: "Mode", type: "select", required: false, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
  ],
};

describe("BuilderPreviewSetupCard", () => {
  it("renders supported controls (text/textarea/number/boolean/select incl. recipient) for missing fields", () => {
    render(
      <BuilderPreviewSetupCard
        preview={preview(["text", "to", "count", "silent", "mode"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.getByTestId("builder-preview-setup-rail")).toBeInTheDocument();
    for (const name of ["text", "to", "count", "silent", "mode"]) {
      expect(screen.getByTestId(`preview-setup-preview-step-2-${name}`)).toBeInTheDocument();
    }
    expect(screen.getByText(/Finish these details before applying:/i)).toBeInTheDocument();
  });

  it("defers an async optionsSource field (not in supported metadata) to 'Choose after Apply'", () => {
    render(
      <BuilderPreviewSetupCard
        preview={preview(["text", "channel"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.getByTestId("preview-setup-preview-step-2-text")).toBeInTheDocument();
    // `channel` (async resolver) is not faked as a dropdown — it's deferred.
    expect(screen.queryByTestId("preview-setup-preview-step-2-channel")).not.toBeInTheDocument();
    expect(screen.getByTestId("preview-setup-after-apply")).toHaveTextContent("Choose after Apply: channel");
  });

  it("filling a control (incl. a recipient field) calls onPreviewConfigChange only — preview-only", () => {
    const onPreviewConfigChange = jest.fn();
    render(
      <BuilderPreviewSetupCard
        preview={preview(["to"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={onPreviewConfigChange}
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("preview-setup-preview-step-2-to"), {
      target: { value: "team@example.com" },
    });
    expect(onPreviewConfigChange).toHaveBeenCalledWith("preview-step-2", "to", "team@example.com");
  });

  it("clicking Apply to draft calls onApply (the existing explicit apply action)", async () => {
    const user = userEvent.setup();
    const onApply = jest.fn();
    render(
      <BuilderPreviewSetupCard
        preview={preview(["text"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={onApply}
      />,
    );
    await user.click(screen.getByTestId("builder-preview-setup-apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("shows an apply-only card (no controls) when nothing is missing", () => {
    render(
      <BuilderPreviewSetupCard
        preview={preview([])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.getByTestId("builder-preview-setup-rail")).toBeInTheDocument();
    expect(screen.getByTestId("builder-preview-setup-apply")).toBeInTheDocument();
    expect(document.querySelector("[data-testid^='preview-setup-preview-step-']")).toBeNull();
  });

  it("reflects the current previewConfig value in the control", () => {
    render(
      <BuilderPreviewSetupCard
        preview={preview(["text"])}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{ "preview-step-2": { text: "Review new leads" } }}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
      />,
    );
    expect((screen.getByTestId("preview-setup-preview-step-2-text") as HTMLTextAreaElement).value).toBe(
      "Review new leads",
    );
  });
});

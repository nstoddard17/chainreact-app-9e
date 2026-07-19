/**
 * Guided setup card — prefilled user-request values (REACT-CONFIG-COVERAGE-1).
 *
 * Pins that values the user supplied in their request are VISIBLE before Apply:
 *   - a supported-control field prefilled by the request renders editable even when it is not in
 *     `missingInputs` (its value arrives via previewConfig, seeded by the preview hook);
 *   - a field with no supported control renders in the read-only "From your request" row;
 *   - nodes with prefilled values but nothing missing still render.
 */
import { render, screen } from "@testing-library/react";
import { BuilderPreviewSetupCard } from "@/features/workflow-builder/panels/BuilderPreviewSetupCard";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

const PREVIEW: DraftPreview = {
  version: 1,
  title: "T",
  summary: "S",
  nodes: [
    {
      previewId: "preview-step-1",
      role: "trigger",
      provider: "gmail",
      type: "new_email",
      label: "gmail:new_email",
      purpose: "watch",
      notApplied: true,
    },
  ],
  edges: [],
  notice: "Preview only — your workflow has not changed.",
  notApplied: true,
};

const SETUP_FIELDS: PreviewSetupFieldsByType = {
  "gmail:new_email": [{ name: "subject", label: "Subject", type: "text", required: false }],
};

describe("BuilderPreviewSetupCard — prefilled request values", () => {
  it("renders an editable control for a prefilled supported field and a read-only row for the rest", () => {
    render(
      <BuilderPreviewSetupCard
        preview={PREVIEW}
        setupFieldsByType={SETUP_FIELDS}
        previewConfig={{ "preview-step-1": { subject: "Invoice" } }}
        prefilledConfig={{
          "preview-step-1": { subject: "Invoice", from: ["vendor@example.com"] },
        }}
        onPreviewConfigChange={jest.fn()}
        onApply={jest.fn()}
      />,
    );
    // Supported control renders (not in missingInputs — prefill drives it) with the request value.
    const input = screen.getByTestId("preview-setup-preview-step-1-subject") as HTMLInputElement;
    expect(input.value).toBe("Invoice");
    // Unsupported-control value is visible read-only.
    expect(screen.getByTestId("preview-setup-prefilled").textContent).toContain(
      "from: vendor@example.com",
    );
  });

  it("renders nothing extra when there is no prefill and nothing missing", () => {
    render(
      <BuilderPreviewSetupCard
        preview={PREVIEW}
        setupFieldsByType={SETUP_FIELDS}
        onPreviewConfigChange={jest.fn()}
        onApply={jest.fn()}
      />,
    );
    expect(screen.queryByTestId("preview-setup-prefilled")).toBeNull();
    expect(screen.queryByTestId("preview-setup-preview-step-1-subject")).toBeNull();
  });
});

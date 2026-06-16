/**
 * Tests for AI-REPAIR-3E — the Apply affordance on the validated repair PREVIEW card
 * (`RepairPreviewBody`). Apply shows ONLY for an applyable preview the parent gated
 * (`canApply`); it's disabled while applying, becomes a success line once applied, and
 * a safe error line (no button) on failure. The opaque operations are NEVER rendered.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RepairPreviewBody } from "@/features/workflow-builder/panels/_BuilderAiPanelDiagnosis";
import type { RepairPreview } from "@/lib/api/ai";

function preview(over: Partial<RepairPreview> = {}): RepairPreview {
  return {
    ok: true,
    patchSummary: "Fix the broken reference",
    changes: [{ op: "repairVariableReference", description: 'Repairs variable reference in field "body".', nodeId: "n1", fields: ["body"] }],
    affectedNodeIds: ["n1"],
    affectedEdgeIds: [],
    riskLevel: "low",
    requiresConfirmation: false,
    riskReasons: [],
    validation: { ok: true, errors: [], warnings: [] },
    userFacingSummaryText: "Repair the variable reference. 1 change(s). Risk: low.",
    canApplyLater: true,
    apply: {
      applyable: true,
      operations: [{ op: "repairVariableReference", nodeId: "n1", fieldPath: "body", newReference: "{{n0.OPAQUE_SECRET_REF}}" }],
      baseRevision: "rev-1",
    },
    ...over,
  } as RepairPreview;
}

describe("RepairPreviewBody — Apply visibility", () => {
  it("renders the Apply button on a safe applyable preview (canApply)", () => {
    render(<RepairPreviewBody preview={preview()} canApply onApply={() => {}} />);
    expect(screen.getByTestId("builder-ai-repair-apply-button").textContent).toBe("Apply fix");
  });

  it("does NOT render Apply when canApply is false (non-latest / not-applyable)", () => {
    render(<RepairPreviewBody preview={preview()} canApply={false} />);
    expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
    // The "nothing changed yet" notice still shows.
    expect(screen.getByTestId("builder-ai-repair-preview-not-applied")).toBeInTheDocument();
  });

  it("does NOT render Apply on a blocked preview", () => {
    const blocked = preview({ ok: false, blockedReason: "Required field is missing.", apply: { applyable: false } });
    render(<RepairPreviewBody preview={blocked} canApply={false} />);
    expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
  });

  it("disables the button while applying", () => {
    render(<RepairPreviewBody preview={preview()} canApply applying onApply={() => {}} />);
    const btn = screen.getByTestId("builder-ai-repair-apply-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toBe("Applying…");
  });

  it("clicking Apply calls onApply once", async () => {
    const onApply = jest.fn();
    const user = userEvent.setup();
    render(<RepairPreviewBody preview={preview()} canApply onApply={onApply} />);
    await user.click(screen.getByTestId("builder-ai-repair-apply-button"));
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});

describe("RepairPreviewBody — applied / failed states", () => {
  it("shows the success line and NO button once applied", () => {
    render(<RepairPreviewBody preview={preview()} canApply applied onApply={() => {}} />);
    expect(screen.getByTestId("builder-ai-repair-apply-success").textContent).toContain("Applied fix. Workflow not run.");
    expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
    // The "nothing changed yet" notice is hidden once applied (it would be misleading).
    expect(screen.queryByTestId("builder-ai-repair-preview-not-applied")).toBeNull();
  });

  it("shows a safe error line and NO button on apply failure", () => {
    render(
      <RepairPreviewBody
        preview={preview()}
        canApply
        applyError="This preview is out of date. Run Check workflow again."
        onApply={() => {}}
      />,
    );
    expect(screen.getByTestId("builder-ai-repair-apply-error").textContent).toContain("out of date");
    expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
  });
});

describe("RepairPreviewBody — no-leak", () => {
  it("never renders the raw operations / their values", () => {
    const { container } = render(<RepairPreviewBody preview={preview()} canApply onApply={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("OPAQUE_SECRET_REF");
    expect(text).not.toContain("fieldPath");
    expect(text).not.toContain("baseRevision");
  });
});

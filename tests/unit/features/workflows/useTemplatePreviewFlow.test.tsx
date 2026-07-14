import { act, renderHook, waitFor } from "@testing-library/react";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const mockUseTemplate = jest.fn();
class TemplateApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
jest.mock("@/lib/api/workflowTemplates", () => ({
  useTemplate: (...a: unknown[]) => mockUseTemplate(...a),
  TemplateApiError,
}));

import { useTemplatePreviewFlow } from "@/features/workflows/useTemplatePreviewFlow";
import type { GuidanceOfficialTemplateMatch } from "@/contracts/aiGuidance";

const MATCH: GuidanceOfficialTemplateMatch = {
  templateId: "tpl-42",
  name: "Support escalation from email",
  description: null,
  score: 20,
  confidence: "high",
  reasons: [],
  isOfficial: true,
  providers: ["hubspot", "slack"],
  providerLabels: ["HubSpot", "Slack"],
  triggerKind: "app",
  category: "sales-crm",
  categoryLabel: "Sales & CRM",
  nodeCount: 5,
  stepCount: 4,
  steps: [],
};

beforeEach(() => {
  mockPush.mockReset();
  mockUseTemplate.mockReset();
});

describe("useTemplatePreviewFlow", () => {
  it("openPreview sets the match and creates NOTHING", () => {
    const { result } = renderHook(() => useTemplatePreviewFlow("acct-1"));
    act(() => result.current.openPreview(MATCH));
    expect(result.current.previewMatch?.templateId).toBe("tpl-42");
    expect(mockUseTemplate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("confirmUse calls the existing use route exactly once and navigates to the new workflow", async () => {
    mockUseTemplate.mockResolvedValue({ workflowId: "wf-99", name: "Support escalation from email" });
    const { result } = renderHook(() => useTemplatePreviewFlow("acct-1"));
    act(() => result.current.openPreview(MATCH));
    await act(async () => {
      await result.current.confirmUse();
    });
    expect(mockUseTemplate).toHaveBeenCalledTimes(1);
    expect(mockUseTemplate).toHaveBeenCalledWith("tpl-42", { targetAccountId: "acct-1" });
    expect(mockPush).toHaveBeenCalledWith("/workflows/wf-99");
    expect(result.current.error).toBeNull();
  });

  it("error path surfaces safe copy, navigates nowhere, and clears busy", async () => {
    mockUseTemplate.mockRejectedValue(new TemplateApiError("Template no longer exists.", "TEMPLATE_NOT_FOUND", 404));
    const { result } = renderHook(() => useTemplatePreviewFlow("acct-1"));
    act(() => result.current.openPreview(MATCH));
    await act(async () => {
      await result.current.confirmUse();
    });
    expect(mockPush).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.error).toBe("Template no longer exists."));
    expect(result.current.busy).toBe(false);
  });

  it("closePreview clears the match (creating nothing)", () => {
    const { result } = renderHook(() => useTemplatePreviewFlow("acct-1"));
    act(() => result.current.openPreview(MATCH));
    act(() => result.current.closePreview());
    expect(result.current.previewMatch).toBeNull();
    expect(mockUseTemplate).not.toHaveBeenCalled();
  });

  it("does not call the use route twice if confirmUse is invoked while busy", async () => {
    let resolve!: (v: { workflowId: string; name: string }) => void;
    mockUseTemplate.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useTemplatePreviewFlow("acct-1"));
    act(() => result.current.openPreview(MATCH));
    act(() => { void result.current.confirmUse(); });
    act(() => { void result.current.confirmUse(); }); // second call while busy → ignored
    await act(async () => { resolve({ workflowId: "wf-1", name: "x" }); });
    expect(mockUseTemplate).toHaveBeenCalledTimes(1);
  });

  // AI-TEMPLATE-APPLY-CURRENT — the in-builder "apply to current workflow" path.
  describe("apply to current workflow (builder context)", () => {
    it("dashboard (no builder context) offers create-new only — canApplyToCurrent is false", () => {
      const { result } = renderHook(() => useTemplatePreviewFlow("acct-1"));
      expect(result.current.canApplyToCurrent).toBe(false);
    });

    it("with a current workflow + handler, canApplyToCurrent is true", () => {
      const { result } = renderHook(() =>
        useTemplatePreviewFlow("acct-1", { currentWorkflowId: "wf-7", onApplyToCurrent: jest.fn() }),
      );
      expect(result.current.canApplyToCurrent).toBe(true);
    });

    it("confirmApplyToCurrent delegates to the handler with the template id/name, closes, and NEVER navigates", async () => {
      const onApplyToCurrent = jest.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useTemplatePreviewFlow("acct-1", { currentWorkflowId: "wf-7", onApplyToCurrent }),
      );
      act(() => result.current.openPreview(MATCH));
      await act(async () => {
        await result.current.confirmApplyToCurrent();
      });
      expect(onApplyToCurrent).toHaveBeenCalledWith({ templateId: "tpl-42", templateName: MATCH.name });
      // Create-new route never called; NO navigation.
      expect(mockUseTemplate).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      // Dialog closed on success.
      expect(result.current.previewMatch).toBeNull();
      expect(result.current.busy).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("a failed apply keeps the dialog open with safe copy, creates no workflow, and does not navigate", async () => {
      const onApplyToCurrent = jest.fn().mockRejectedValue(new Error("boom"));
      const { result } = renderHook(() =>
        useTemplatePreviewFlow("acct-1", { currentWorkflowId: "wf-7", onApplyToCurrent }),
      );
      act(() => result.current.openPreview(MATCH));
      await act(async () => {
        await result.current.confirmApplyToCurrent();
      });
      expect(mockUseTemplate).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      // Still on the dialog, error shown, busy released — no create-new fallback.
      expect(result.current.previewMatch?.templateId).toBe("tpl-42");
      await waitFor(() =>
        expect(result.current.error).toBe(
          "Couldn't apply that template to your workflow. Please try again.",
        ),
      );
      expect(result.current.busy).toBe(false);
    });

    it("surfaces a TemplateApiError message verbatim on a failed apply", async () => {
      const onApplyToCurrent = jest
        .fn()
        .mockRejectedValue(new TemplateApiError("Workflow not found.", "WORKFLOW_NOT_FOUND", 404));
      const { result } = renderHook(() =>
        useTemplatePreviewFlow("acct-1", { currentWorkflowId: "wf-7", onApplyToCurrent }),
      );
      act(() => result.current.openPreview(MATCH));
      await act(async () => {
        await result.current.confirmApplyToCurrent();
      });
      await waitFor(() => expect(result.current.error).toBe("Workflow not found."));
    });
  });
});

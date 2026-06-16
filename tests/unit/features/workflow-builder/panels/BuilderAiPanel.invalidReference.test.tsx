/**
 * Integration test for AI-REPAIR-3I — "Check workflow" makes an invalid
 * variable-reference issue ACTIONABLE when there is no safe automatic Apply:
 * a "Needs attention" card with reason-specific guidance + an "Open <field> field"
 * button that reveals + highlights the affected field (same reveal seam as the
 * missing-field affordance). No Apply control appears for the zero/multiple-candidate
 * case.
 *
 * Renders the real BuilderAiPanel with `@/lib/api/ai` + `@/lib/api/workflows` mocked
 * (no network) and the discovery-metadata hooks mocked so the diagnosed node resolves
 * client-side. Proves: card copy by reason, Open-field reveal, no Apply, no leak.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActionMeta } from "@/contracts/actionMeta";

const mockDiagnose = jest.fn();
const mockRepair = jest.fn();
const mockPreview = jest.fn();
const mockExplain = jest.fn();
const mockApply = jest.fn();
const mockGetThread = jest.fn();
const mockAppendThreadMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/lib/api/ai", () => {
  const actual = jest.requireActual("@/lib/api/ai");
  return {
    planWorkflow: jest.fn(),
    applyWorkflowPatch: jest.fn(),
    diagnoseWorkflow: (...a: unknown[]) => mockDiagnose(...a),
    explainDiagnosis: (...a: unknown[]) => mockExplain(...a),
    planWorkflowRepair: (...a: unknown[]) => mockRepair(...a),
    previewWorkflowRepair: (...a: unknown[]) => mockPreview(...a),
    applyWorkflowRepair: (...a: unknown[]) => mockApply(...a),
    getBuilderAgentThread: (...a: unknown[]) => mockGetThread(...a),
    appendBuilderAgentMessage: (...a: unknown[]) => mockAppendThreadMessage(...a),
    clearBuilderAgentThread: (...a: unknown[]) => mockClearThread(...a),
    AI_CREDITS_EXHAUSTED_MESSAGE: actual.AI_CREDITS_EXHAUSTED_MESSAGE,
    AiApiError: class AiApiError extends Error {
      status: number;
      constructor(message: string, status: number) {
        super(message);
        this.name = "AiApiError";
        this.status = status;
      }
    },
  };
});

const mockGetWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => ({ getWorkflow: (...a: unknown[]) => mockGetWorkflow(...a) }));

const SLACK_META = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    { name: "channel", label: "Channel", type: "combobox", required: true },
    { name: "text", label: "Message", type: "textarea", required: true },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: null,
  isDestructive: false,
  requiresConfirmation: false,
} as unknown as ActionMeta;

jest.mock("@/features/workflow-builder/hooks/useNativeActions", () => ({
  useNativeActions: () => ({ actions: [], loading: false, error: null }),
  findNativeActionByKey: () => undefined,
}));
jest.mock("@/features/workflow-builder/hooks/useNativeTriggers", () => ({
  useNativeTriggers: () => ({ triggers: [], loading: false, error: null }),
  findNativeTriggerByKey: () => undefined,
}));
jest.mock("@/features/workflow-builder/hooks/useProviderActions", () => ({
  useProviderActions: () => ({ actions: [SLACK_META], loading: false, error: null }),
  findProviderActionByKey: (actions: ActionMeta[], key: string) => actions.find((a) => a.key === key),
}));
jest.mock("@/features/workflow-builder/hooks/useProviderTriggers", () => ({
  useProviderTriggers: () => ({ triggers: [], loading: false, error: null }),
  findProviderTriggerByKey: () => undefined,
}));

import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

const BROKEN_TOKEN = "{{e25b1c45-af99-4913-9947-f726012329a5.to}}";

const SLACK_NODE = {
  id: "slack1",
  kind: "action" as const,
  provider: "slack",
  type: "send_channel_message",
  // Message field holds a deleted-node reference (Marcus's production case).
  config: { channel: "C1", text: `Hello ${BROKEN_TOKEN}` },
  position: { x: 0, y: 0 },
};

function invalidRefDiagnosis(replacementReason: "none" | "one" | "multiple" | undefined) {
  return {
    workflowId: "wf-1",
    access: "OK",
    overallReady: false,
    summaryText: "A step references a deleted or missing step.",
    nextSteps: ["Re-point or remove the broken variable reference(s) on the flagged steps."],
    findings: [
      {
        source: "graph",
        code: "INVALID_VARIABLE_REFERENCE",
        severity: "error",
        title: "A step references a deleted or missing step.",
        nodeIds: ["slack1"],
        nodeLabels: ["Send Channel Message"],
        invalidReferences: [
          {
            fieldLabel: "Message",
            token: BROKEN_TOKEN,
            fieldKey: "text",
            ...(replacementReason ? { replacementReason } : {}),
          },
        ],
      },
    ],
  };
}

/**
 * AI-REPAIR-3K — an applyable deterministic preview the one-candidate "Preview fix"
 * yields (mirrors the route's `{ ok, preview }` shape; the preview comes from the
 * model-free deterministic path so no model/credit/telemetry is involved server-side).
 */
const APPLY_OPS = [
  { op: "repairVariableReference", nodeId: "slack1", fieldPath: "text", newReference: "{{gmail-1.subject}}" },
];
const previewApplyable = {
  ok: true,
  preview: {
    ok: true,
    patchSummary: "Re-point the broken variable reference",
    changes: [{ op: "repairVariableReference", description: 'Repairs variable reference in field "text".', nodeId: "slack1", fields: ["text"] }],
    affectedNodeIds: ["slack1"],
    affectedEdgeIds: [],
    riskLevel: "medium",
    requiresConfirmation: false,
    riskReasons: [],
    validation: { ok: true, errors: [], warnings: [] },
    userFacingSummaryText: "Re-point the broken variable reference — 1 change(s). Risk: medium.",
    candidateSummary: "3 node(s)",
    canApplyLater: true,
    apply: { applyable: true, operations: APPLY_OPS, baseRevision: "rev-1" },
  },
  notAppliedNotice: "x",
};

beforeEach(() => {
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(invalidRefDiagnosis("none"));
  mockRepair.mockReset();
  mockPreview.mockReset();
  mockExplain.mockReset();
  mockApply.mockReset();
  mockApply.mockResolvedValue({ ok: true, applied: true, currentRevision: "rev-2", appliedOperations: [] });
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({ thread: { id: "t", workflowId: "wf-1", createdAt: "now", updatedAt: "now" }, messages: [] });
  mockAppendThreadMessage.mockReset();
  mockAppendThreadMessage.mockResolvedValue({ id: "m", role: "user", kind: "prompt", content: "", safePayload: {}, createdAt: "now" });
  mockClearThread.mockReset();
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 0 });
  mockGetWorkflow.mockReset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [SLACK_NODE], edges: [] }, "rev-1");
});

async function check() {
  const user = userEvent.setup();
  render(<BuilderAiPanel />);
  await user.click(screen.getByTestId("builder-ai-check-button"));
  await screen.findByTestId("builder-ai-diagnosis");
  return user;
}

describe("Check workflow → actionable invalid-reference card (AI-REPAIR-3I)", () => {
  it("zero candidates → 'Open Message field' action + 'choose or remove' guidance, NO Apply", async () => {
    await check();
    const card = await screen.findByTestId("builder-ai-diagnosis-invalid-ref");
    const open = screen.getByTestId("builder-ai-invalid-ref-open-field-button");
    expect(open.textContent).toBe("Open Message field");
    expect(card.textContent).toContain("choose a valid variable or remove");

    // No automatic Apply anywhere (zero safe replacement).
    expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
    // The card itself was deterministic — Check never asked the model to suggest/preview.
    expect(mockRepair).not.toHaveBeenCalled();
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("clicking 'Open Message field' reveals + highlights the field; no graph mutation / save / run", async () => {
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-invalid-ref-open-field-button"));

    const cs = useConfigSlice.getState();
    expect(cs.activeNodeId).toBe("slack1");
    expect(cs.focusFieldKey).toBe("text"); // the affected field is highlighted
    expect(cs.canvasFocusNodeId).toBe("slack1");

    // Graph untouched: same workflow + node config, no save/run path hit.
    const gs = useGraphSlice.getState();
    expect(gs.workflowId).toBe("wf-1");
    expect(gs.pendingNodes[0]!.config).toEqual({ channel: "C1", text: `Hello ${BROKEN_TOKEN}` });
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });

  it("renders no raw node id / field key / token uuid in the card copy", async () => {
    await check();
    const card = await screen.findByTestId("builder-ai-diagnosis-invalid-ref");
    const t = card.textContent ?? "";
    expect(t).not.toContain("slack1");
    expect(t).not.toContain("e25b1c45"); // the raw token uuid
    expect(t).toContain("Message"); // the safe field label
  });

  it("multiple candidates → manual-choice guidance, still no Apply", async () => {
    mockDiagnose.mockResolvedValue(invalidRefDiagnosis("multiple"));
    await check();
    const card = await screen.findByTestId("builder-ai-diagnosis-invalid-ref");
    expect(card.textContent).toContain("More than one replacement");
    expect(card.textContent).toContain("choose the correct variable manually");
    expect(screen.getByTestId("builder-ai-invalid-ref-open-field-button")).toBeEnabled();
    expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
  });
});

describe("Check workflow → one-candidate direct 'Preview fix' (AI-REPAIR-3K)", () => {
  it("renders 'Preview fix' (primary) + 'Open Message field' (secondary); NO Apply on the Check card", async () => {
    mockDiagnose.mockResolvedValue(invalidRefDiagnosis("one"));
    await check();
    const card = await screen.findByTestId("builder-ai-diagnosis-invalid-ref");
    expect(card.textContent).toContain("found one safe replacement");
    expect(screen.getByTestId("builder-ai-invalid-ref-preview-fix-button").textContent).toBe("Preview fix");
    // Open-field manual affordance is preserved as the secondary action.
    expect(screen.getByTestId("builder-ai-invalid-ref-open-field-button").textContent).toBe("Open Message field");
    // Apply is NEVER placed on a Check card — and the model preview hasn't run yet.
    expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it("renders no raw node id / field key / token uuid in the one-candidate card copy", async () => {
    mockDiagnose.mockResolvedValue(invalidRefDiagnosis("one"));
    await check();
    const card = await screen.findByTestId("builder-ai-diagnosis-invalid-ref");
    const t = card.textContent ?? "";
    expect(t).not.toContain("slack1");
    expect(t).not.toContain("e25b1c45");
    expect(t).not.toContain("text"); // raw field key (label "Message" is shown instead)
    expect(t).toContain("Message");
  });

  it("clicking 'Preview fix' runs the deterministic preview path (no Suggest/plan) → applyable preview with 'Apply fix'", async () => {
    mockDiagnose.mockResolvedValue(invalidRefDiagnosis("one"));
    mockPreview.mockResolvedValue(previewApplyable);
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-invalid-ref-preview-fix-button"));
    await screen.findByTestId("builder-ai-repair-preview");
    // SAME deterministic preview client path (the route runs the model-free preview
    // FIRST, AI-REPAIR-3H); no proposalContext is sent from the Check card.
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPreview).toHaveBeenCalledWith("wf-1", expect.anything(), undefined);
    // The Check-card action is Preview, never the LLM "Suggest a fix" plan.
    expect(mockRepair).not.toHaveBeenCalled();
    // Apply appears ON THE PREVIEW (a separate click), not on the Check card.
    expect(screen.getByTestId("builder-ai-repair-apply-button").textContent).toBe("Apply fix");
  });

  it("Apply on that preview persists the corrected draft + refetches/hydrates; workflow not run", async () => {
    mockDiagnose.mockResolvedValue(invalidRefDiagnosis("one"));
    mockPreview.mockResolvedValue(previewApplyable);
    mockGetWorkflow.mockResolvedValue({ id: "wf-1", draftDefinition: { nodes: [], edges: [] }, updatedAt: "rev-2" });
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-invalid-ref-preview-fix-button"));
    await screen.findByTestId("builder-ai-repair-preview");
    await user.click(screen.getByTestId("builder-ai-repair-apply-button"));
    const ok = await screen.findByTestId("builder-ai-repair-apply-success");
    expect(ok.textContent).toContain("Applied fix. Workflow not run.");
    // The 3D apply route got the opaque operations + baseRevision (no model call).
    expect(mockApply).toHaveBeenCalledWith("wf-1", { operations: APPLY_OPS, baseRevision: "rev-1" });
    await waitFor(() => expect(mockGetWorkflow).toHaveBeenCalledWith("wf-1"));
  });

  it("'Preview fix' disables + relabels after one click (no repeat round-trip)", async () => {
    mockDiagnose.mockResolvedValue(invalidRefDiagnosis("one"));
    mockPreview.mockResolvedValue(previewApplyable);
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-invalid-ref-preview-fix-button"));
    await screen.findByTestId("builder-ai-repair-preview");
    const btn = screen.getByTestId("builder-ai-invalid-ref-preview-fix-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toBe("Previewed");
    await user.click(btn); // disabled → no-op
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it.each(["none", "multiple"] as const)(
    "%s candidates → NO 'Preview fix' action (Open-field manual guidance remains, no Apply)",
    async (reason) => {
      mockDiagnose.mockResolvedValue(invalidRefDiagnosis(reason));
      await check();
      await screen.findByTestId("builder-ai-diagnosis-invalid-ref");
      expect(screen.queryByTestId("builder-ai-invalid-ref-preview-fix-button")).toBeNull();
      expect(screen.getByTestId("builder-ai-invalid-ref-open-field-button")).toBeEnabled();
      expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
    },
  );
});

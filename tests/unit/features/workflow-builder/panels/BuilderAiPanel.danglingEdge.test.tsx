/**
 * Integration test for AI-REPAIR-4A — "Check workflow" surfaces a dangling/broken-edge
 * issue (a connection whose source or target step no longer exists) as an actionable
 * "Needs attention" card with a "Preview fix" that runs the deterministic `removeEdge`
 * cleanup preview. Apply appears ONLY on the resulting preview and removes the broken
 * edge; the workflow is not run.
 *
 * Renders the real BuilderAiPanel with `@/lib/api/ai` + `@/lib/api/workflows` mocked.
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

const GMAIL_META = {
  key: "gmail:send_email",
  provider: "gmail",
  type: "send_email",
  displayName: "Send Email",
  description: "Send an email",
  category: "email",
  requiresIntegration: true,
  fields: [{ name: "to", label: "To", type: "string-array", required: true }],
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
  useProviderActions: () => ({ actions: [GMAIL_META], loading: false, error: null }),
  findProviderActionByKey: (actions: ActionMeta[], key: string) => actions.find((a) => a.key === key),
}));
jest.mock("@/features/workflow-builder/hooks/useProviderTriggers", () => ({
  useProviderTriggers: () => ({ triggers: [], loading: false, error: null }),
  findProviderTriggerByKey: () => undefined,
}));

import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const GMAIL_NODE = {
  id: "gmail1",
  kind: "action" as const,
  provider: "gmail",
  type: "send_email",
  config: { to: ["a@example.com"] },
  position: { x: 0, y: 0 },
};

const staleEdgeDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText: "This workflow has a connection to a step that no longer exists.",
  nextSteps: ["Remove the broken connection."],
  findings: [
    {
      source: "graph",
      code: "STALE_EDGE",
      severity: "error",
      title: "This workflow has a connection to a step that no longer exists.",
      danglingEdges: [{ fromLabel: "Send Email", toLabel: "a step that no longer exists" }],
    },
  ],
};

const REMOVE_EDGE_OPS = [{ op: "removeEdge", edgeId: "e-dangling" }];
const previewApplyable = {
  ok: true,
  preview: {
    ok: true,
    patchSummary: "Remove broken connection to a missing step",
    changes: [{ op: "removeEdge", description: 'Removes "Send Email" → "a node that\'s no longer in this workflow".', edgeId: "e-dangling" }],
    affectedNodeIds: [],
    affectedEdgeIds: ["e-dangling"],
    riskLevel: "low",
    requiresConfirmation: false,
    riskReasons: [],
    validation: { ok: true, errors: [], warnings: [] },
    userFacingSummaryText: "Remove broken connection to a missing step — 1 change(s). Risk: low.",
    canApplyLater: true,
    apply: { applyable: true, operations: REMOVE_EDGE_OPS, baseRevision: "rev-1" },
  },
  notAppliedNotice: "x",
};

beforeEach(() => {
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(staleEdgeDiagnosis);
  mockRepair.mockReset();
  mockPreview.mockReset();
  mockPreview.mockResolvedValue(previewApplyable);
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
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [GMAIL_NODE], edges: [] }, "rev-1");
});

async function check() {
  const user = userEvent.setup();
  render(<BuilderAiPanel />);
  await user.click(screen.getByTestId("builder-ai-check-button"));
  await screen.findByTestId("builder-ai-diagnosis");
  return user;
}

describe("Check workflow → dangling-edge cleanup (AI-REPAIR-4A)", () => {
  it("renders an actionable dangling-edge card with copy + 'Preview fix'; NO Apply on the Check card", async () => {
    await check();
    const card = await screen.findByTestId("builder-ai-diagnosis-dangling-edge");
    expect(card.textContent).toContain("connection to a step that no longer exists");
    expect(card.textContent).toContain("Send Email");
    expect(screen.getByTestId("builder-ai-dangling-edge-preview-fix-button").textContent).toBe("Preview fix");
    // Apply is never on a Check card; the model preview hasn't run.
    expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockRepair).not.toHaveBeenCalled();
  });

  it("renders no raw edge / node id in the card copy", async () => {
    await check();
    const t = (await screen.findByTestId("builder-ai-diagnosis-dangling-edge")).textContent ?? "";
    expect(t).not.toContain("e-dangling");
    expect(t).not.toContain("gmail1");
  });

  it("clicking 'Preview fix' runs the deterministic edge-repair path → applyable preview with 'Apply fix'", async () => {
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-dangling-edge-preview-fix-button"));
    await screen.findByTestId("builder-ai-repair-preview");
    // The deterministic dangling-edge flag was sent (5th arg = true); never a Suggest/plan call.
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPreview).toHaveBeenCalledWith("wf-1", expect.anything(), undefined, undefined, true);
    expect(mockRepair).not.toHaveBeenCalled();
    expect(screen.getByTestId("builder-ai-repair-apply-button").textContent).toBe("Apply fix");
  });

  it("Apply removes only the broken edge + refetches/hydrates; workflow not run", async () => {
    mockGetWorkflow.mockResolvedValue({ id: "wf-1", draftDefinition: { nodes: [], edges: [] }, updatedAt: "rev-2" });
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-dangling-edge-preview-fix-button"));
    await screen.findByTestId("builder-ai-repair-preview");
    await user.click(screen.getByTestId("builder-ai-repair-apply-button"));
    const ok = await screen.findByTestId("builder-ai-repair-apply-success");
    expect(ok.textContent).toContain("Applied fix. Workflow not run.");
    expect(mockApply).toHaveBeenCalledWith("wf-1", { operations: REMOVE_EDGE_OPS, baseRevision: "rev-1" });
    await waitFor(() => expect(mockGetWorkflow).toHaveBeenCalledWith("wf-1"));
  });
});

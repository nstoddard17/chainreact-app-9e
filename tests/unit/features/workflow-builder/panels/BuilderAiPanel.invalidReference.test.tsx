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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActionMeta } from "@/contracts/actionMeta";

const mockDiagnose = jest.fn();
const mockRepair = jest.fn();
const mockPreview = jest.fn();
const mockExplain = jest.fn();
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

beforeEach(() => {
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(invalidRefDiagnosis("none"));
  mockRepair.mockReset();
  mockPreview.mockReset();
  mockExplain.mockReset();
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

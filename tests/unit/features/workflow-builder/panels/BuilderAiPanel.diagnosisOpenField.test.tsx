/**
 * Integration test for AI-CONFIG-ASSIST CS-5 — "Check workflow" produces an
 * actionable issue card whose PRIMARY action for a missing user-input field is
 * "Open <field> field", with NO Suggest / Preview required.
 *
 * Renders the real BuilderAiPanel with `@/lib/api/ai` + `@/lib/api/workflows`
 * mocked (no network) and the discovery-metadata hooks mocked so the diagnosed
 * node's field resolves client-side. Proves: after Check, the diagnosis card shows
 * "Open Message field" directly; clicking it reveals + highlights the field
 * (chat-fill precondition) with zero graph mutation / save / run / preview call.
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

const SLACK_NODE = {
  id: "slack1",
  kind: "action" as const,
  provider: "slack",
  type: "send_channel_message",
  config: { channel: "C1", text: "" }, // Message empty → the targetable missing field
  position: { x: 0, y: 0 },
};

const missingFieldDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText: "Send Channel Message is missing its Message.",
  nextSteps: ["Add the Message on Send Channel Message."],
  findings: [
    {
      source: "field",
      code: "MISSING_REQUIRED_FIELD",
      severity: "error",
      title: "Required fields are missing.",
      nodeIds: ["slack1"],
      nodeLabels: ["Send Channel Message"],
      missingFields: ["Message"],
    },
  ],
};

beforeEach(() => {
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(missingFieldDiagnosis);
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

describe("Check workflow → actionable missing-field card (CS-5)", () => {
  it("surfaces 'Open Message field' on the diagnosis card WITHOUT requiring Suggest or Preview", async () => {
    await check();
    const open = await screen.findByTestId("builder-ai-diagnosis-open-field-button");
    expect(open.textContent).toBe("Open Message field");
    // Suggest remains available as a secondary action, but is NOT required.
    expect(screen.getByTestId("builder-ai-suggest-fix-button")).toBeEnabled();
    // No proposal/preview exists or was requested.
    expect(screen.queryByTestId("builder-ai-preview-fix-button")).toBeNull();
    expect(mockRepair).not.toHaveBeenCalled();
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("clicking it reveals + highlights the field (chat-fill precondition); no graph mutation / save / run", async () => {
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-diagnosis-open-field-button"));

    const cs = useConfigSlice.getState();
    expect(cs.activeNodeId).toBe("slack1");
    expect(cs.focusFieldKey).toBe("text"); // highlighted → chat-fill can now activate
    expect(cs.canvasFocusNodeId).toBe("slack1");

    // Graph untouched: still the same workflow + node config, no save/run path hit.
    const gs = useGraphSlice.getState();
    expect(gs.workflowId).toBe("wf-1");
    expect(gs.pendingNodes[0]!.config).toEqual({ channel: "C1", text: "" });
    expect(mockGetWorkflow).not.toHaveBeenCalled();
    // No Apply control anywhere.
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
  });

  it("renders no raw node id or field key in the card copy", async () => {
    await check();
    const card = await screen.findByTestId("builder-ai-diagnosis-open-field");
    const t = card.textContent ?? "";
    expect(t).not.toContain("slack1");
    expect(t).not.toContain("text"); // the field KEY; the label "Message" is shown instead
    expect(t).toContain("Message");
  });
});

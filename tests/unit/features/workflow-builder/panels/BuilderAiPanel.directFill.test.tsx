/**
 * Integration test for AI-CONFIG-ASSIST CS-9 — DIRECT field-fill (no confirmation).
 *
 * Product decision: when an eligible field is highlighted and the composer is in
 * field-fill mode, pressing Send fills the pending config DRAFT IMMEDIATELY and
 * shows an after-fill summary — NO "Put this in …? Confirm / Cancel" proposal.
 *
 * Renders the real BuilderAiPanel with the AI client + discovery hooks mocked, then
 * reveals the Message field, types a value, and submits. Asserts: draft filled +
 * dirty, summary bubble ("Filled … · Not saved yet"), and NO proposal / confirm /
 * cancel anywhere. Navigation/pending only — no graph mutation / save / run / Apply.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActionMeta } from "@/contracts/actionMeta";

jest.mock("@/lib/api/ai", () => {
  const actual = jest.requireActual("@/lib/api/ai");
  return {
    planWorkflow: jest.fn(),
    applyWorkflowPatch: jest.fn(),
    diagnoseWorkflow: jest.fn(),
    explainDiagnosis: jest.fn(),
    planWorkflowRepair: jest.fn(),
    previewWorkflowRepair: jest.fn(),
    getBuilderAgentThread: jest.fn().mockResolvedValue({ thread: { id: "t", workflowId: "wf-1", createdAt: "now", updatedAt: "now" }, messages: [] }),
    appendBuilderAgentMessage: jest.fn().mockResolvedValue({ id: "m", role: "user", kind: "prompt", content: "", safePayload: {}, createdAt: "now" }),
    clearBuilderAgentThread: jest.fn().mockResolvedValue({ ok: true, deletedCount: 0 }),
    AI_CREDITS_EXHAUSTED_MESSAGE: actual.AI_CREDITS_EXHAUSTED_MESSAGE,
    AiApiError: class AiApiError extends Error {
      status: number;
      constructor(m: string, s: number) { super(m); this.name = "AiApiError"; this.status = s; }
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

jest.mock("@/features/workflow-builder/hooks/useNativeActions", () => ({ useNativeActions: () => ({ actions: [], loading: false, error: null }), findNativeActionByKey: () => undefined }));
jest.mock("@/features/workflow-builder/hooks/useNativeTriggers", () => ({ useNativeTriggers: () => ({ triggers: [], loading: false, error: null }), findNativeTriggerByKey: () => undefined }));
jest.mock("@/features/workflow-builder/hooks/useProviderActions", () => ({ useProviderActions: () => ({ actions: [SLACK_META], loading: false, error: null }), findProviderActionByKey: (a: ActionMeta[], k: string) => a.find((x) => x.key === k) }));
jest.mock("@/features/workflow-builder/hooks/useProviderTriggers", () => ({ useProviderTriggers: () => ({ triggers: [], loading: false, error: null }), findProviderTriggerByKey: () => undefined }));

import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

const SLACK_NODE = {
  id: "slack1",
  kind: "action" as const,
  provider: "slack",
  type: "send_channel_message",
  config: { channel: "C1", text: "" },
  position: { x: 0, y: 0 },
};

beforeEach(() => {
  mockGetWorkflow.mockReset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [SLACK_NODE], edges: [] }, "rev-1");
});

async function renderAndReveal() {
  render(<BuilderAiPanel />);
  await screen.findByTestId("builder-ai-composer");
  act(() => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { channel: "C1", text: "" }, fieldKey: "text" });
  });
  // In field-fill mode: hint visible.
  expect(screen.getByTestId("builder-ai-chatfill-hint")).toBeInTheDocument();
}

describe("CS-9/CS-10 — direct fill on Send (no confirmation; local commit)", () => {
  it("fills the field, commits the node config locally, shows a summary; no Confirm/Cancel/proposal; no server save", async () => {
    const user = userEvent.setup();
    const saveSpy = jest.spyOn(useGraphSlice.getState(), "save");
    await renderAndReveal();

    await user.type(screen.getByTestId("builder-ai-prompt"), "Hey!!!");
    await user.click(screen.getByTestId("builder-ai-plan-button"));

    // CS-10 — node config COMMITTED LOCALLY: the canvas-pending node now holds the
    // value, and the rail draft is marked saved (clean) — no need to click panel Save.
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({ channel: "C1", text: "Hey!!!" });
    const draft = useConfigSlice.getState().drafts.slack1!;
    expect(draft.values.text).toBe("Hey!!!");
    expect(draft.isDirty).toBe(false); // local commit done (markSaved)
    // The WORKFLOW is now dirty → the toolbar Save is still required.
    expect(useGraphSlice.getState().isDirty).toBe(true);

    // After-fill summary ("Filled … · Workflow not saved yet"); NO proposal/confirm/cancel.
    const summary = await screen.findByTestId("builder-ai-chat-fill-summary");
    expect(summary.textContent).toMatch(/Filled/i);
    expect(summary.textContent).toMatch(/Message/);
    expect(summary.textContent).toMatch(/Send Channel Message/);
    expect(summary.textContent).toMatch(/workflow not saved yet/i);
    expect(screen.queryByTestId("builder-ai-chat-fill-proposal")).toBeNull();
    expect(screen.queryByTestId("builder-ai-chat-fill-confirm")).toBeNull();
    expect(screen.queryByTestId("builder-ai-chat-fill-cancel")).toBeNull();

    // NO workflow server save / run / Apply, and NO graph STRUCTURE change.
    expect(saveSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
    expect(useGraphSlice.getState().pendingEdges).toHaveLength(0);

    // No raw node id / field key in the summary copy.
    expect(summary.textContent).not.toContain("slack1");
    expect(summary.textContent).not.toMatch(/\btext\b/);

    saveSpy.mockRestore();
  });

  it("with NO field highlighted, Send goes to normal AI chat (not a direct fill)", async () => {
    const user = userEvent.setup();
    const { planWorkflow } = jest.requireMock("@/lib/api/ai") as { planWorkflow: jest.Mock };
    planWorkflow.mockResolvedValue({ ok: false, code: "MODEL_FAILED", message: "x", errors: [] });
    render(<BuilderAiPanel />);
    await screen.findByTestId("builder-ai-composer");

    await user.type(screen.getByTestId("builder-ai-prompt"), "add a delay");
    await user.click(screen.getByTestId("builder-ai-plan-button"));

    expect(await screen.findByTestId("builder-ai-plan-failure")).toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-chat-fill-summary")).toBeNull();
    expect(screen.queryByTestId("builder-ai-chat-fill-proposal")).toBeNull();
  });
});

/**
 * Integration test for AI-CONFIG-ASSIST CS-7 — exit chat-fill targeting.
 *
 * When a field is highlighted for chat-fill, the user must be able to leave that
 * mode and return to normal AI chat — via the inline "Ask something else" action or
 * Escape in the composer. Clearing:
 *   - removes the helper hint + restores the default placeholder;
 *   - routes the next submit to normal AI chat (NOT a direct field fill);
 *   - keeps the config panel open (activeNodeId unchanged);
 *   - never saves / runs / mutates the graph;
 *   - never erases an already-typed pending config value.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActionMeta } from "@/contracts/actionMeta";

const mockPlan = jest.fn();
jest.mock("@/lib/api/ai", () => {
  const actual = jest.requireActual("@/lib/api/ai");
  return {
    planWorkflow: (...a: unknown[]) => mockPlan(...a),
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
  config: { channel: "C1", text: "" },
  position: { x: 0, y: 0 },
};

beforeEach(() => {
  mockPlan.mockReset();
  mockPlan.mockResolvedValue({ ok: false, code: "MODEL_FAILED", message: "x", errors: [] });
  mockGetWorkflow.mockReset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [SLACK_NODE], edges: [] }, "rev-1");
});

async function renderPanelAndReveal(textValue = "") {
  render(<BuilderAiPanel />);
  await screen.findByTestId("builder-ai-composer");
  act(() => {
    useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { channel: "C1", text: textValue }, fieldKey: "text" });
  });
  // Sanity: chat-fill mode is on.
  expect(screen.getByTestId("builder-ai-chatfill-hint")).toBeInTheDocument();
}

describe("CS-7 — Escape exits chat-fill targeting", () => {
  it("clears targeting: hint gone, placeholder normal, focus cleared, panel still open", async () => {
    const user = userEvent.setup();
    await renderPanelAndReveal();
    await user.click(screen.getByTestId("builder-ai-prompt"));
    await user.keyboard("{Escape}");

    expect(screen.queryByTestId("builder-ai-chatfill-hint")).toBeNull();
    expect(screen.getByTestId("builder-ai-prompt").getAttribute("placeholder")).toMatch(/describe a change/i);
    // Targeting cleared; the config panel stays OPEN (node still active).
    expect(useConfigSlice.getState().focusFieldKey).toBeNull();
    expect(useConfigSlice.getState().activeNodeId).toBe("slack1");
  });
});

describe("CS-7 — 'Ask something else' exits chat-fill targeting", () => {
  it("clears targeting the same way", async () => {
    const user = userEvent.setup();
    await renderPanelAndReveal();
    await user.click(screen.getByTestId("builder-ai-chatfill-exit"));

    expect(screen.queryByTestId("builder-ai-chatfill-hint")).toBeNull();
    expect(useConfigSlice.getState().focusFieldKey).toBeNull();
    expect(useConfigSlice.getState().activeNodeId).toBe("slack1");
  });
});

describe("CS-7 — after clearing, composer is normal AI chat", () => {
  it("a typed value routes to normal chat (planner), NOT a direct field fill", async () => {
    const user = userEvent.setup();
    await renderPanelAndReveal();
    await user.click(screen.getByTestId("builder-ai-chatfill-exit"));

    // AUTOROUTE CS-3 — after exiting chat-fill the composer is the normal AI chat,
    // now intent-routed. Use a clearly PLAN-shaped request so it routes to the
    // planner (a vague phrase would route to a clarification, which is also "not a
    // field fill"); the point of this test is that chat-fill no longer intercepts it.
    await user.type(screen.getByTestId("builder-ai-prompt"), "Add a Slack step");
    await user.click(screen.getByTestId("builder-ai-plan-button"));

    // Went to the planner (normal chat) — a plan failure bubble renders…
    expect(await screen.findByTestId("builder-ai-plan-failure")).toBeInTheDocument();
    expect(mockPlan).toHaveBeenCalledTimes(1);
    // …and did NOT produce a chat-fill proposal.
    expect(screen.queryByTestId("builder-ai-chat-fill-proposal")).toBeNull();
  });
});

describe("CS-7 — clearing is side-effect-free", () => {
  it("does not save / run / mutate the graph", async () => {
    const user = userEvent.setup();
    await renderPanelAndReveal();
    await user.click(screen.getByTestId("builder-ai-chatfill-exit"));

    const gs = useGraphSlice.getState();
    expect(gs.workflowId).toBe("wf-1");
    expect(gs.pendingNodes[0]!.config).toEqual({ channel: "C1", text: "" });
    expect(mockGetWorkflow).not.toHaveBeenCalled();
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("does NOT erase an already-typed pending config value", async () => {
    const user = userEvent.setup();
    // The Message draft already holds a value (e.g. user typed it / chat-fill placed it).
    await renderPanelAndReveal("already typed");
    await user.click(screen.getByTestId("builder-ai-chatfill-exit"));

    // Targeting cleared, but the pending draft value is untouched.
    expect(useConfigSlice.getState().focusFieldKey).toBeNull();
    expect(useConfigSlice.getState().drafts.slack1?.values.text).toBe("already typed");
  });
});

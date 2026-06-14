/**
 * Integration test for AI-CONFIG-ASSIST CS-6 — chat-fill discoverability gating.
 *
 * The panel surfaces the composer hint + field placeholder ONLY when a chat-fill
 * ELIGIBLE field is highlighted. Renders the real BuilderAiPanel with the AI client
 * + discovery-metadata hooks mocked, then drives `revealNode` directly to assert:
 *   - eligible field (Message / textarea) highlighted → hint + placeholder appear;
 *   - ineligible field (Channel / recipient-destination) highlighted → NO hint;
 *   - nothing highlighted → NO hint.
 */
import { act, render, screen } from "@testing-library/react";
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
jest.mock("@/lib/api/workflows", () => ({ getWorkflow: jest.fn() }));

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
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [SLACK_NODE], edges: [] }, "rev-1");
});

async function renderPanel() {
  render(<BuilderAiPanel />);
  await screen.findByTestId("builder-ai-composer");
}

describe("BuilderAiPanel — chat-fill hint gating (CS-6)", () => {
  it("shows the hint + Message placeholder when the eligible Message field is highlighted", async () => {
    await renderPanel();
    act(() => {
      useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { channel: "C1", text: "" }, fieldKey: "text" });
    });
    expect(screen.getByTestId("builder-ai-chatfill-hint").textContent).toMatch(/Message/);
    expect(screen.getByTestId("builder-ai-prompt").getAttribute("placeholder")).toBe("Type Message value…");
  });

  it("does NOT show the hint when an INELIGIBLE field (Channel) is highlighted", async () => {
    await renderPanel();
    act(() => {
      useConfigSlice.getState().revealNode({ nodeId: "slack1", initialValues: { channel: "C1", text: "" }, fieldKey: "channel" });
    });
    expect(screen.queryByTestId("builder-ai-chatfill-hint")).toBeNull();
    expect(screen.getByTestId("builder-ai-prompt").getAttribute("placeholder")).toMatch(/describe a change/i);
  });

  it("does NOT show the hint when no field is highlighted", async () => {
    await renderPanel();
    expect(screen.queryByTestId("builder-ai-chatfill-hint")).toBeNull();
    expect(screen.getByTestId("builder-ai-prompt").getAttribute("placeholder")).toMatch(/describe a change/i);
  });
});

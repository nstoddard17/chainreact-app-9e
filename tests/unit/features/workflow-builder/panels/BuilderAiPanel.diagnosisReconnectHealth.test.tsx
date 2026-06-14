/**
 * Integration test for CHECK-ACTIONS-3 — the Check "Needs setup" cards use the
 * persisted reconnect-needed health + per-user reconnect permission carried on the
 * diagnosis DTO:
 *   - allowed (canReconnect !== false)  → safe "Reconnect <Provider> in Apps" action.
 *   - restricted (canReconnect === false) → guidance only ("Ask the workflow owner or
 *     connection owner to reconnect <Provider>."), NO broken button.
 *
 * Renders the real BuilderAiPanel with `@/lib/api/ai` + `@/lib/api/workflows` mocked
 * (no network). Proves: setup cards never arm chat-fill, missing fields still render
 * under "Needs your input", and the check consumes NO model round-trip.
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
  config: { channel: "C1", text: "" },
  position: { x: 0, y: 0 },
};

const reconnectFinding = (canReconnect: boolean) => ({
  source: "connection",
  code: "RECONNECT_REQUIRED",
  severity: "error",
  title: "The connection expired and needs reconnecting.",
  provider: "slack",
  providerName: "Slack",
  nodeIds: ["slack1"],
  credentialClass: "account",
  reconnectNeeded: true,
  canReconnect,
});

const diagnosisWith = (findings: unknown[]) => ({
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText: "Slack needs reconnecting.",
  nextSteps: ["Reconnect Slack."],
  findings,
});

beforeEach(() => {
  mockDiagnose.mockReset();
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

describe("Check workflow → reconnect-health-aware Needs setup (CHECK-ACTIONS-3)", () => {
  it("allowed reconnect (canReconnect true) → safe Apps action", async () => {
    mockDiagnose.mockResolvedValue(diagnosisWith([reconnectFinding(true)]));
    await check();
    const link = screen.getByTestId("builder-ai-diagnosis-setup-link");
    expect(link).toHaveAttribute("href", "/apps");
    expect(link.textContent).toBe("Reconnect Slack in Apps");
  });

  it("restricted reconnect (canReconnect false) → guidance only, no broken button", async () => {
    mockDiagnose.mockResolvedValue(diagnosisWith([reconnectFinding(false)]));
    await check();
    const setup = screen.getByTestId("builder-ai-diagnosis-setup");
    expect(setup.textContent).toContain(
      "Ask the workflow owner or connection owner to reconnect Slack.",
    );
    expect(screen.queryByTestId("builder-ai-diagnosis-setup-link")).toBeNull();
  });

  it("card shows the provider LABEL, never the raw provider id / code", async () => {
    mockDiagnose.mockResolvedValue(diagnosisWith([reconnectFinding(false)]));
    await check();
    const setup = (await screen.findByTestId("builder-ai-diagnosis-setup")).textContent ?? "";
    expect(setup).toContain("Slack");
    expect(setup).not.toContain("RECONNECT_REQUIRED");
    expect(setup).not.toContain("slack1");
  });

  it("missing field + restricted setup → both groups; setup arms no chat-fill", async () => {
    mockDiagnose.mockResolvedValue(
      diagnosisWith([
        {
          source: "field",
          code: "MISSING_REQUIRED_FIELD",
          severity: "error",
          title: "Required fields are missing.",
          nodeIds: ["slack1"],
          nodeLabels: ["Send Channel Message"],
          missingFields: ["Message"],
        },
        reconnectFinding(false),
      ]),
    );
    await check();
    // Needs your input still renders the open-field action.
    expect(screen.getByTestId("builder-ai-diagnosis-open-field-button").textContent).toBe("Open Message field");
    // Needs setup is guidance-only; no link, no open-field button inside it.
    const setup = screen.getByTestId("builder-ai-diagnosis-setup");
    expect(setup.textContent).toContain("Ask the workflow owner or connection owner to reconnect Slack.");
    expect(screen.queryByTestId("builder-ai-diagnosis-setup-link")).toBeNull();
    expect(setup.querySelector('[data-testid="builder-ai-diagnosis-open-field-button"]')).toBeNull();
    // The setup card did NOT reveal/highlight a field (chat-fill precondition not armed).
    expect(useConfigSlice.getState().focusFieldKey).toBeNull();
  });

  it("consumes NO model call (deterministic Check)", async () => {
    mockDiagnose.mockResolvedValue(diagnosisWith([reconnectFinding(false)]));
    await check();
    expect(mockDiagnose).toHaveBeenCalledTimes(1);
    expect(mockRepair).not.toHaveBeenCalled();
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockExplain).not.toHaveBeenCalled();
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
  });
});

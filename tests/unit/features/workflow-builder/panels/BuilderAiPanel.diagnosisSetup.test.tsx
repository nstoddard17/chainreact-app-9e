/**
 * Integration test for CHECK-ACTIONS-1 — "Check workflow" produces actionable issue
 * cards GROUPED BY TYPE: a "Needs your input" group (Open <field> field) AND a "Needs
 * setup" group (reconnect/setup guidance + an Apps link) can render together.
 *
 * Renders the real BuilderAiPanel with `@/lib/api/ai` + `@/lib/api/workflows` mocked
 * (no network). Proves: after a single deterministic Check, a missing field shows
 * "Open Message field" and a Slack reconnect finding shows "Reconnect Slack in Apps"
 * (href=/apps) — with NO model round-trip (Suggest / Preview / Explain never called,
 * so no AI credits are consumed by the check path).
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

// A check result with BOTH issue classes: a missing required field AND a Slack
// reconnect/connection problem.
const multiIssueDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText: "Send Channel Message is missing its Message, and Slack needs reconnecting.",
  nextSteps: ["Add the Message on Send Channel Message.", "Reconnect Slack."],
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
    {
      source: "connection",
      code: "RECONNECT_REQUIRED",
      severity: "error",
      title: "The connection expired and needs reconnecting.",
      provider: "slack",
      providerName: "Slack",
      nodeIds: ["slack1"],
      nodeLabels: ["Send Channel Message"],
      credentialClass: "account",
    },
  ],
};

beforeEach(() => {
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(multiIssueDiagnosis);
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

describe("Check workflow → grouped actionable cards (CHECK-ACTIONS-1)", () => {
  it("renders BOTH groups: 'Open Message field' AND 'Reconnect Slack in Apps'", async () => {
    await check();
    // Needs your input
    const open = await screen.findByTestId("builder-ai-diagnosis-open-field-button");
    expect(open.textContent).toBe("Open Message field");
    // Needs setup
    const setup = screen.getByTestId("builder-ai-diagnosis-setup");
    expect(setup.textContent).toContain("Needs setup");
    const link = screen.getByTestId("builder-ai-diagnosis-setup-link");
    expect(link).toHaveAttribute("href", "/apps");
    expect(link.textContent).toBe("Reconnect Slack in Apps");
  });

  it("the setup group offers no open-field action and links only to Apps", async () => {
    await check();
    // Exactly one open-field button (the missing field), none from the setup group.
    expect(screen.getAllByTestId("builder-ai-diagnosis-open-field-button")).toHaveLength(1);
    // The only setup affordance is the Apps link.
    const links = screen.getAllByTestId("builder-ai-diagnosis-setup-link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/apps");
  });

  it("consumes NO model call: Suggest / Preview / Explain are never invoked by the check", async () => {
    await check();
    expect(mockDiagnose).toHaveBeenCalledTimes(1);
    expect(mockRepair).not.toHaveBeenCalled();
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockExplain).not.toHaveBeenCalled();
    // No Apply control anywhere.
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
  });

  it("renders no raw provider error code or node id in the setup copy", async () => {
    await check();
    const setup = await screen.findByTestId("builder-ai-diagnosis-setup");
    const t = setup.textContent ?? "";
    expect(t).not.toContain("RECONNECT_REQUIRED");
    expect(t).not.toContain("slack1");
  });
});
